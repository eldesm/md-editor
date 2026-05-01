import { readFileSync } from "node:fs";
import { CspParser } from "csp_evaluator/dist/parser.js";
import { CspEvaluator } from "csp_evaluator/dist/evaluator.js";
import { Severity } from "csp_evaluator/dist/finding.js";

const HTML_PATH = "index.html";
const FAIL_AT = Severity.HIGH_MAYBE;

const html = readFileSync(HTML_PATH, "utf8");
const match = html.match(
  /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i,
);
if (!match) {
  console.error(`No Content-Security-Policy meta tag found in ${HTML_PATH}`);
  process.exit(1);
}

const csp = match[1];
console.log(`Policy: ${csp}\n`);

const parsed = new CspParser(csp).csp;
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
