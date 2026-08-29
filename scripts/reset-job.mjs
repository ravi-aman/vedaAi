import fs from 'fs';
import path from 'path';
import os from 'os';
const PERSIST_DIR = path.join(os.tmpdir(), "veda-ai", "persist");
const jobId = "f064702a-2364-49d8-b500-a2aa5b86fad9";
const safe = jobId.replace(/[^a-zA-Z0-9-]/g, "");
const jobFile = path.join(PERSIST_DIR, `job-${safe}.json`);
const raw = fs.readFileSync(jobFile, 'utf-8');
const job = JSON.parse(raw);
console.log('before', job.status, job.currentStage, job.error?.message?.slice(0,120));
job.status = "UPLOADED";
job.currentStage = "UPLOADED";
job.error = undefined;
job.progress = job.progress || {};
job.progress.stageStates = {
  VALIDATING: "completed",
  PREPROCESSING: "completed",
  OCR_SUBMITTED: "completed",
  OCR_PROCESSING: "completed",
  OCR_COMPLETED: "completed",
  VISION: "completed",
  FUSION: "completed",
  EXTRACTING: "failed",
  STRUCTURING: "pending",
  MATCHING: "pending",
  LOCALIZING: "pending",
  VALIDATING_RESULT: "pending",
  COMPLETED: "pending"
};
job.updatedAt = new Date().toISOString();
// clear ocr attempt so it can retry extracting without re-ocr
fs.writeFileSync(jobFile, JSON.stringify(job, null, 2), 'utf-8');
console.log('after reset', job.status, job.currentStage);
// also check result persist
const resultFile = path.join(PERSIST_DIR, `result-${safe}.json`);
if (fs.existsSync(resultFile)) {
  console.log('removing old result file');
  fs.unlinkSync(resultFile);
}
console.log('done');
