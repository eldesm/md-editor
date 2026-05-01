import { readFileSync } from "node:fs";
import { CspParser } from "csp_evaluator/dist/parser.js";
import { CspEvaluator } from "csp_evaluator/dist/evaluator.js";
import { Severity } from "csp_evaluator/dist/finding.js";

const FAIL_AT = Severity.HIGH_MAYBE;

function findCsp() {
  try {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    for (const rule of config.headers ?? []) {
      const csp = (rule.headers ?? []).find(
        (h) => h.key.toLowerCase() === "content-security-policy",
      );
      if (csp) return { source: "vercel.json", csp: csp.value };
    }
  } catch {}

  try {
    const html = readFileSync("index.html", "utf8");
    const m = html.match(
      /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i,
    );
    if (m) return { source: "index.html", csp: m[1] };
  } catch {}

  return null;
}

const found = findCsp();
if (!found) {
  console.error(
    "No Content-Security-Policy found in vercel.json (header) or index.html (meta).",
  );
  process.exit(1);
}

console.log(`Source: ${found.source}`);
console.log(`Policy: ${found.csp}\n`);

const parsed = new CspParser(found.csp).csp;
const findings = new CspEvaluator(parsed).evaluate();

const severityName = (n) =>
  Object.entries(Severity).find(([, v]) => v === n)?.[0] ?? `?(${n})`;

const fails = findings.filter((f) => f.severity <= FAIL_AT);
const warns = findings.filter((f) => f.severity > FAIL_AT);

for (const f of warns) {
  console.log(`  [${severityName(f.severity)}] ${f.directive}: ${f.description}`);
}
for (const f of fails) {
  console.log(`  [${severityName(f.severity)}] ${f.directive}: ${f.description}`);
}

if (fails.length > 0) {
  console.error(
    `\n${fails.length} finding(s) at severity ${severityName(FAIL_AT)} or worse — failing.`,
  );
  process.exit(1);
}
console.log("\nCSP passed.");
