import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { CspParser } from "csp_evaluator/dist/parser.js";
import { CspEvaluator } from "csp_evaluator/dist/evaluator.js";
import { Severity } from "csp_evaluator/dist/finding.js";

const REPORT_PATH = "docs/security-status.md";
const FAIL_AT = Severity.HIGH_MAYBE;

const sevName = (n) =>
  Object.entries(Severity).find(([, v]) => v === n)?.[0] ?? `?(${n})`;

function runAudit() {
  try {
    const out = execSync("npm audit --omit=dev --json", { encoding: "utf8" });
    return JSON.parse(out);
  } catch (err) {
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

function findCsp() {
  try {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    for (const rule of config.headers ?? []) {
      const csp = (rule.headers ?? []).find(
        (h) => h.key.toLowerCase() === "content-security-policy",
      );
      if (csp) return { source: "vercel.json (HTTP header)", csp: csp.value };
    }
  } catch {}

  try {
    const html = readFileSync("index.html", "utf8");
    const m = html.match(
      /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i,
    );
    if (m) return { source: "index.html (meta-tag)", csp: m[1] };
  } catch {}

  return null;
}

function evaluateCsp() {
  const found = findCsp();
  if (!found) return { source: null, csp: null, findings: [] };
  const parsed = new CspParser(found.csp).csp;
  return {
    source: found.source,
    csp: found.csp,
    findings: new CspEvaluator(parsed).evaluate(),
  };
}

const audit = runAudit();
const { source: cspSource, csp, findings: cspFindings } = evaluateCsp();
const now = new Date()
  .toISOString()
  .replace("T", " ")
  .replace(/:\d{2}\.\d+Z$/, " UTC");

const v = audit.metadata?.vulnerabilities ?? {};
const blockingDeps = (v.high ?? 0) + (v.critical ?? 0);

const cspGrouped = {};
for (const f of cspFindings) {
  const k = sevName(f.severity);
  cspGrouped[k] = (cspGrouped[k] ?? 0) + 1;
}
const cspBlocking = cspFindings.filter((f) => f.severity <= FAIL_AT);

const runUrl =
  process.env.GITHUB_SERVER_URL &&
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

let md = "# Security status\n\n";
md += `Laatst bijgewerkt: **${now}**`;
if (runUrl) md += ` ([run](${runUrl}))`;
md += "\n\n";
md += "Automatisch gegenereerd door `scripts/security-report.mjs` via de [Security audit workflow](../.github/workflows/audit.yml). Niet handmatig wijzigen — een nieuwe run overschrijft het.\n\n";

md += "## 1. Dependency CVE's (productie-bundle)\n\n";
md += "Bron: `npm audit --omit=dev --json`\n\n";
md += "| Severity | Aantal |\n|---|---|\n";
for (const sev of ["critical", "high", "moderate", "low", "info"]) {
  md += `| ${sev[0].toUpperCase()}${sev.slice(1)} | ${v[sev] ?? 0} |\n`;
}
md += "\n";
md +=
  blockingDeps > 0
    ? `**Status: ${blockingDeps} blokkerende finding(s)** (high/critical) — CI faalt totdat dit opgelost is.\n\n`
    : "**Status: schoon.** Geen blokkerende kwetsbaarheden.\n\n";

md += "## 2. Content-Security-Policy\n\n";
md += `Bron: \`scripts/check-csp.mjs\` met Google's \`csp_evaluator\`. Faaldrempel: \`${sevName(FAIL_AT)}\` (${FAIL_AT}).\n\n`;
if (!csp) {
  md += "**Status: geen CSP gevonden in `vercel.json` of `index.html`.**\n\n";
} else {
  md += `Gelezen uit: \`${cspSource}\`\n\n`;
  md += "| Severity | Aantal |\n|---|---|\n";
  for (const sev of [
    "HIGH",
    "SYNTAX",
    "MEDIUM",
    "HIGH_MAYBE",
    "STRICT_CSP",
    "MEDIUM_MAYBE",
    "INFO",
  ]) {
    md += `| ${sev} | ${cspGrouped[sev] ?? 0} |\n`;
  }
  md += "\n";
  md +=
    cspBlocking.length > 0
      ? `**Status: ${cspBlocking.length} blokkerende finding(s).** CI faalt totdat dit opgelost is.\n\n`
      : "**Status: schoon.** Geen blokkerende findings.\n\n";

  if (cspFindings.length > 0) {
    md += "### Bevindingen\n\n";
    for (const f of cspFindings) {
      md += `- **${sevName(f.severity)}** \`${f.directive}\`: ${f.description}\n`;
    }
    md += "\n";
  }
}

md += "## 3. Volgende automatische run\n\n";
md += "Wekelijkse cron-run: maandag 06:00 UTC. Daarnaast bij elke push naar `main` en bij PR's tegen `main`.\n";

writeFileSync(REPORT_PATH, md);
console.log(`Wrote ${REPORT_PATH}`);
