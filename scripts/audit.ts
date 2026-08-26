/**
 * npm run audit — production readiness checks
 */
import fs from "fs";
import path from "path";

type Check = { name: string; pass: boolean; note: string };
const checks: Check[] = [];

function check(name: string, pass: boolean, note: string) {
  checks.push({ name, pass, note });
  const icon = pass ? "✓" : "✗";
  console.log(`${icon} ${name}: ${pass ? "PASS" : "FAIL"} — ${note}`);
}

const root = process.cwd();

// required files
check("README.md", fs.existsSync(path.join(root, "README.md")), "exists");
check("AGENTS.md", fs.existsSync(path.join(root, "AGENTS.md")), "exists");
check("TODO.md", fs.existsSync(path.join(root, "TODO.md")), "exists");
check("docs/ARCHITECTURE.md", fs.existsSync(path.join(root, "docs/ARCHITECTURE.md")), "exists");
check("docs/AI_PIPELINE.md", fs.existsSync(path.join(root, "docs/AI_PIPELINE.md")), "exists");
check("docs/TESTING.md", fs.existsSync(path.join(root, "docs/TESTING.md")), "exists");
check("docs/LIMITATIONS.md", fs.existsSync(path.join(root, "docs/LIMITATIONS.md")), "exists");
check("docs/SYSTEM_AUDIT.md", fs.existsSync(path.join(root, "docs/SYSTEM_AUDIT.md")), "audit exists");
check("docs/AUTH_SETUP.md", fs.existsSync(path.join(root, "docs/AUTH_SETUP.md")), "auth setup");
check("docs/SECURITY.md", fs.existsSync(path.join(root, "docs/SECURITY.md")), "security");
check(".env.example", fs.existsSync(path.join(root, ".env.example")), "example placeholders");
check("opencode.json", fs.existsSync(path.join(root, "opencode.json")), "agent config");

// env config
const example = fs.existsSync(path.join(root, ".env.example")) ? fs.readFileSync(path.join(root, ".env.example"), "utf-8") : "";
check("AI_PROVIDER not mock in example", example.includes("AI_PROVIDER=opencode-zen"), "default is zen");
check("No hardcoded secret in example", !example.match(/sk-[A-Za-z0-9]{20,}/), "no real key");
check(".env ignored", (() => {
  try {
    const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf-8");
    return gi.includes(".env") && gi.includes("!.env.example");
  } catch { return false; }
})(), ".env ignored, example allowed");

// no mock in prod path (allow mock only in providers/mock.ts and tests)
const srcFiles = getFiles(path.join(root, "src"));
let mockInProd = false;
for (const f of srcFiles) {
  const norm = f.replace(/\\/g, "/");
  if (norm.includes("providers/mock.ts") || norm.includes("factory.ts") || norm.includes("tests/") || norm.includes("fixtures/")) continue;
  const content = fs.readFileSync(f, "utf-8");
  if (content.includes("MockAIProvider")) {
    mockInProd = true;
    console.log(`  mock usage in ${path.relative(root, f)}`);
  }
}
check("No mock in prod", !mockInProd, "mock only in factory/tests");

// build artifacts
check("pdf-lib installed", (() => { try { require("pdf-lib"); return true; } catch { return false; }})(), "pdf-lib");
check("@supabase/ssr installed", fs.existsSync(path.join(root, "node_modules/@supabase/ssr")), "supabase ssr");

// secrets scan
let secretFound = false;
for (const f of srcFiles) {
  const c = fs.readFileSync(f, "utf-8");
  if (c.match(/sk-[A-Za-z0-9_-]{20,}/) && !c.includes("REPLACE") && !c.includes("sk-REPLACE")) {
    secretFound = true;
    console.log(`  secret? ${path.relative(root, f)}`);
  }
  if (c.includes("NEXT_PUBLIC_AI_API_KEY") || c.includes("NEXT_PUBLIC_OPENCODE_API_KEY")) {
    secretFound = true;
    console.log(`  NEXT_PUBLIC leak ${path.relative(root, f)}`);
  }
}
check("No hardcoded secrets in src", !secretFound, "none");

// summary
const pass = checks.filter(c => c.pass).length;
const fail = checks.filter(c => !c.pass).length;
console.log(`\nAudit: ${pass} pass, ${fail} fail of ${checks.length}`);
if (fail > 0) {
  console.log("Fix failures before production. See docs/PRODUCTION_READINESS.md");
  process.exit(1);
} else {
  console.log("Audit PASS (static checks). Still need runtime checks: ai:smoke-test, assessment:smoke-test, Supabase, Google OAuth.");
}

function getFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...getFiles(p));
    else if (e.isFile() && (p.endsWith(".ts") || p.endsWith(".tsx"))) out.push(p);
  }
  return out;
}
