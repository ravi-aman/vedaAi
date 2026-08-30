#!/usr/bin/env python3
"""
PaddleOCR worker for VedaAI - internal child process
Loads PaddleOCR once, processes pages, outputs JSON
"""
import os
# Must be set before paddle import
os.environ["FLAGS_use_pir_api"] = "0"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import sys
import json
import time
import argparse
import traceback
from pathlib import Path

def log(msg):
    print(f"[paddle_worker] {msg}", file=sys.stderr, flush=True)

def main():
    parser = argparse.ArgumentParser(description="VedaAI PaddleOCR worker")
    parser.add_argument("--manifest", required=True, help="Path to manifest JSON with pages")
    parser.add_argument("--output-dir", required=True, help="Output directory for per-page results")
    parser.add_argument("--lang", default="en", help="OCR language")
    parser.add_argument("--ocr-version", default="PP-OCRv5", help="OCR version")
    parser.add_argument("--device", default="cpu", help="Device")
    args = parser.parse_args()

    start_total = time.time()
    # Import here after env set
    t0 = time.time()
    from paddleocr import PaddleOCR
    import psutil
    proc = psutil.Process()
    mem_before = proc.memory_info().rss / 1024 / 1024
    log(f"imported paddleocr in {(time.time()-t0)*1000:.0f}ms mem {mem_before:.1f}MB")

    t1 = time.time()
    # ── File-locked model provisioning (Fixes QP OCR || AS OCR race) ──
    # PaddleX model resolver is not atomic: concurrent workers race on .paddlex/official_models extraction.
    # Use directory-based lock (atomic mkdir) to serialize PaddleOCR initialization only; inference remains parallel.
    lock_dir = Path.home() / ".paddlex" / ".veda-init.lock"
    lock_acquired = False
    lock_attempts = 0
    while not lock_acquired and lock_attempts < 120:
        try:
            lock_dir.mkdir(parents=False, exist_ok=False)
            lock_acquired = True
        except FileExistsError:
            time.sleep(0.5)
            lock_attempts += 1
            if lock_attempts % 10 == 0:
                log(f"waiting for paddle init lock held by other worker... {lock_attempts*0.5:.0f}s")
    if not lock_acquired:
        log(f"WARNING: could not acquire paddle init lock after 60s, proceeding without lock (may race)")
    try:
        # Speed-first: use mobile detection where available, English rec
        ocr_kwargs = dict(
            lang=args.lang,
            ocr_version=args.ocr_version,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        # Use mobile models for speed if available, else fallback to server — verified existence
        if args.ocr_version == "PP-OCRv5":
            try:
                import pathlib
                det_path = pathlib.Path.home() / ".paddlex" / "official_models" / "PP-OCRv5_mobile_det" / "inference.yml"
                rec_path = pathlib.Path.home() / ".paddlex" / "official_models" / "en_PP-OCRv5_mobile_rec" / "inference.yml"
                det_ok = det_path.exists() and det_path.stat().st_size > 100
                rec_ok = rec_path.exists() and rec_path.stat().st_size > 100
                if det_ok and rec_ok:
                    ocr_kwargs["text_detection_model_name"] = "PP-OCRv5_mobile_det"
                    ocr_kwargs["text_recognition_model_name"] = "en_PP-OCRv5_mobile_rec"
                    log(f"using mobile models: det={det_ok} rec={rec_ok}")
                elif rec_ok:
                    ocr_kwargs["text_recognition_model_name"] = "en_PP-OCRv5_mobile_rec"
                    log(f"using mobile rec only: det={det_ok} rec={rec_ok}")
                else:
                    log(f"mobile models not ready (det={det_ok} rec={rec_ok}), using PaddleOCR defaults (will auto-download)")
                    # Do not force server — let PaddleOCR choose correct default and download
            except Exception as e:
                log(f"mobile model check failed: {e}, using PaddleOCR defaults")
        ocr = PaddleOCR(**ocr_kwargs)
        t2 = time.time()
        log(f"PaddleOCR initialized in {(t2-t1)*1000:.0f}ms mem {proc.memory_info().rss/1024/1024:.1f}MB lock_wait={lock_attempts*0.5:.1f}s")
    finally:
        if lock_acquired:
            try:
                lock_dir.rmdir()
            except Exception:
                pass

    # Load manifest
    manifest_path = Path(args.manifest)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(manifest_path, "r") as f:
        manifest = json.load(f)

    pages = manifest.get("pages", [])
    jobId = manifest.get("jobId", "unknown")
    kind = manifest.get("kind", "unknown")

    log(f"processing {len(pages)} pages for {jobId} {kind}")

    results = []
    total_texts = 0
    total_polys = 0
    min_ms = float("inf")
    max_ms = 0
    sum_ms = 0

    for page in pages:
        pageNumber = page["pageNumber"]
        imagePath = page["imagePath"]
        width = page["width"]
        height = page["height"]
        t_page_start = time.time()
        try:
            # PaddleOCR predict expects file path
            res_list = ocr.predict(imagePath)
            t_page_end = time.time()
            dur_ms = int((t_page_end - t_page_start) * 1000)
            sum_ms += dur_ms
            min_ms = min(min_ms, dur_ms)
            max_ms = max(max_ms, dur_ms)

            if not res_list or len(res_list) == 0:
                log(f"page {pageNumber} no result")
                res = {
                    "pageNumber": pageNumber,
                    "width": width,
                    "height": height,
                    "rec_texts": [],
                    "rec_scores": [],
                    "dt_polys": [],
                    "rec_polys": [],
                    "rec_boxes": [],
                }
            else:
                raw = res_list[0]
                # raw contains rec_texts, rec_scores, dt_polys, rec_polys, rec_boxes - handle numpy arrays safely
                def safe_list(v):
                    if v is None:
                        return []
                    # numpy array check without triggering truth value
                    try:
                        import numpy as np
                        if isinstance(v, np.ndarray):
                            return v.tolist()
                    except Exception:
                        pass
                    if isinstance(v, (list, tuple)):
                        return list(v)
                    try:
                        # generic iterable with len
                        if hasattr(v, "__len__"):
                            return list(v) if len(v) > 0 else []
                        return [v]
                    except Exception:
                        return []

                rec_texts = safe_list(raw.get("rec_texts"))
                rec_scores = safe_list(raw.get("rec_scores"))
                dt_polys = safe_list(raw.get("dt_polys"))
                rec_polys = safe_list(raw.get("rec_polys"))
                rec_boxes = safe_list(raw.get("rec_boxes"))
                # dt_polys may be nested arrays - ensure they are lists
                # Convert any nested numpy arrays inside dt_polys
                def deep_to_list(obj):
                    try:
                        import numpy as np
                        if isinstance(obj, np.ndarray):
                            return obj.tolist()
                    except Exception:
                        pass
                    if isinstance(obj, (list, tuple)):
                        return [deep_to_list(x) for x in obj]
                    return obj
                dt_polys = deep_to_list(dt_polys)
                rec_polys = deep_to_list(rec_polys)
                rec_boxes = deep_to_list(rec_boxes)
                total_texts += len(rec_texts)
                total_polys += len(dt_polys)
                res = {
                    "pageNumber": pageNumber,
                    "width": width,
                    "height": height,
                    "rec_texts": rec_texts,
                    "rec_scores": rec_scores,
                    "dt_polys": dt_polys,
                    "rec_polys": rec_polys,
                    "rec_boxes": rec_boxes,
                    "durationMs": dur_ms,
                    "imagePath": imagePath,
                }
                log(f"page {pageNumber} dur {dur_ms}ms texts {len(rec_texts)} polys {len(dt_polys)}")

            # Write per-page file
            out_path = output_dir / f"page-{pageNumber:03d}.json"
            with open(out_path, "w") as out_f:
                json.dump(res, out_f)

            results.append(res)

        except Exception as e:
            t_page_end = time.time()
            dur_ms = int((t_page_end - t_page_start) * 1000)
            log(f"page {pageNumber} failed after {dur_ms}ms: {e}")
            traceback.print_exc(file=sys.stderr)
            # Write error marker but continue
            err_res = {
                "pageNumber": pageNumber,
                "width": width,
                "height": height,
                "error": str(e),
                "durationMs": dur_ms,
                "rec_texts": [],
                "rec_scores": [],
                "dt_polys": [],
                "rec_polys": [],
                "rec_boxes": [],
            }
            out_path = output_dir / f"page-{pageNumber:03d}.json"
            with open(out_path, "w") as out_f:
                json.dump(err_res, out_f)
            results.append(err_res)

    total_ms = int((time.time() - start_total) * 1000)
    avg_ms = int(sum_ms / len(pages)) if pages else 0
    peak_mem = proc.memory_info().rss / 1024 / 1024

    summary = {
        "jobId": jobId,
        "kind": kind,
        "engine": "paddleocr",
        "ocrVersion": args.ocr_version,
        "lang": args.lang,
        "device": args.device,
        "pages": len(pages),
        "totalMs": total_ms,
        "avgPageMs": avg_ms,
        "minPageMs": int(min_ms) if min_ms != float("inf") else 0,
        "maxPageMs": int(max_ms),
        "totalTexts": total_texts,
        "totalPolys": total_polys,
        "peakMemoryMb": round(peak_mem, 1),
        "completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    summary_path = output_dir / "summary.json"
    with open(summary_path, "w") as sf:
        json.dump(summary, sf, indent=2)

    log(f"completed {len(pages)} pages total {total_ms}ms avg {avg_ms}ms peak {peak_mem:.1f}MB")

    # Also output summary to stdout for Node to capture
    print(json.dumps(summary))

    # Clean exit
    sys.exit(0)

if __name__ == "__main__":
    main()
