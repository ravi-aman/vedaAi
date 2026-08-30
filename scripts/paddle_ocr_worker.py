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
import warnings
# Suppress benign RequestsDependencyWarning before paddle imports (urllib3 2.5.0/chardet mismatch, not root cause)
warnings.simplefilter("ignore")
try:
    import urllib3
    warnings.filterwarnings("ignore", category=urllib3.exceptions.NotOpenSSLWarning)
except Exception:
    pass
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
    # ── File-locked model provisioning — NEVER proceed without lock ──
    # PaddleX model resolver is not atomic: concurrent workers race on .paddlex/official_models.
    # Use directory-based lock (atomic mkdir) + cache validation. If lock cannot be acquired, FAIL, don't race.
    def is_model_ready(model_name: str) -> bool:
        base = Path.home() / ".paddlex" / "official_models" / model_name
        required = ["inference.yml", "inference.json", "inference.pdiparams", "config.json"]
        for fname in required:
            p = base / fname
            try:
                if not p.exists() or p.stat().st_size < 100:
                    return False
            except Exception:
                return False
        return True

    def is_cache_ready() -> bool:
        return is_model_ready("PP-OCRv5_mobile_det") and is_model_ready("en_PP-OCRv5_mobile_rec")

    # If cache already ready, no lock needed — fast path for warm runs
    if not is_cache_ready():
        lock_dir = Path.home() / ".paddlex" / ".veda-provision.lock"
        lock_acquired = False
        lock_attempts = 0
        # Stale lock detection: if lock dir older than 10 min, consider stale (previous crash)
        def is_lock_stale(p: Path) -> bool:
            try:
                mtime = p.stat().st_mtime
                return (time.time() - mtime) > 600
            except Exception:
                return False
        while not lock_acquired and lock_attempts < 180:  # 90s total, bounded
            try:
                lock_dir.mkdir(parents=False, exist_ok=False)
                lock_acquired = True
            except FileExistsError:
                if is_lock_stale(lock_dir):
                    try:
                        # Try to remove stale lock
                        lock_dir.rmdir()
                        log(f"removed stale lock after 600s, retrying")
                        continue
                    except Exception:
                        pass
                time.sleep(0.5)
                lock_attempts += 1
                if lock_attempts % 10 == 0:
                    log(f"waiting for paddle init lock held by other worker... {lock_attempts*0.5:.0f}s")
        if not lock_acquired:
            log(f"ERROR: could not acquire paddle init lock after 90s, failing rather than racing")
            print(json.dumps({"error": "INCOMPLETE_MODEL_CACHE", "message": f"Could not acquire model provisioning lock after 90s after {lock_attempts} attempts; cache not ready={not is_cache_ready()}; failing safely without initializing incomplete cache"}), file=sys.stderr)
            sys.exit(2)
        # Re-check after acquiring lock — another worker may have just provisioned
        if not is_cache_ready():
            log(f"cache not ready after acquiring lock, provisioning required (det={is_model_ready('PP-OCRv5_mobile_det')} rec={is_model_ready('en_PP-OCRv5_mobile_rec')})")
            # Delete incomplete model directories so PaddleX will re-download (it skips download if dir exists even when incomplete)
            for m in ["PP-OCRv5_mobile_det", "en_PP-OCRv5_mobile_rec"]:
                if not is_model_ready(m):
                    base = Path.home() / ".paddlex" / "official_models" / m
                    if base.exists():
                        try:
                            import shutil
                            shutil.rmtree(base)
                            log(f"removed incomplete {m} for re-download")
                        except Exception as e:
                            log(f"failed to remove incomplete {m}: {e}")
            # Now PaddleOCR will download fresh while holding lock (single writer, safe)
        else:
            log(f"cache already ready after acquiring lock, no provisioning needed")
    else:
        lock_acquired = False
        lock_attempts = 0
        lock_dir = Path.home() / ".paddlex" / ".veda-provision.lock"
    try:
        # Configured models: PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec (no silent fallback)
        ocr_kwargs = dict(
            lang=args.lang,
            ocr_version=args.ocr_version,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="en_PP-OCRv5_mobile_rec",
        )
        # Validate that configured mobile models are actually ready; if not, fail clearly rather than silently switching to server
        if not is_model_ready("PP-OCRv5_mobile_det") or not is_model_ready("en_PP-OCRv5_mobile_rec"):
            det_ready = is_model_ready("PP-OCRv5_mobile_det")
            rec_ready = is_model_ready("en_PP-OCRv5_mobile_rec")
            log(f"ERROR: configured mobile models not ready (det={det_ready} rec={rec_ready}) — expected PP-OCRv5_mobile_det and en_PP-OCRv5_mobile_rec")
            # If we hold the lock, try one-time provisioning via PaddleOCR download while holding lock (single writer, safe)
            if lock_acquired:
                log(f"attempting one-time provisioning while holding lock...")
                # PaddleOCR will download missing model to official_models; since we hold lock, no race
                # We already set ocr_kwargs to mobile, so it will download the missing one
            else:
                # We didn't hold lock but cache not ready — this should not happen if runner provisioned before workers
                log(f"ERROR: cache not ready but lock not held — runner should have provisioned before workers. Failing.")
                print(json.dumps({"error": "INCOMPLETE_MODEL_CACHE", "message": f"Mobile models not ready det={det_ready} rec={rec_ready} and lock not held"}), file=sys.stderr)
                sys.exit(3)
        else:
            log(f"using configured mobile models: PP-OCRv5_mobile_det + en_PP-OCRv5_mobile_rec (validated)")

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
