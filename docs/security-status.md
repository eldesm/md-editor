# Security status

Laatst bijgewerkt: **2026-08-10 07:22 UTC** ([run](https://github.com/eldesm/md-editor/actions/runs/31365586674))

Automatisch gegenereerd door `scripts/security-report.mjs` via de [Security audit workflow](../.github/workflows/audit.yml). Niet handmatig wijzigen — een nieuwe run overschrijft het.

## 1. Dependency CVE's (productie-bundle)

Bron: `npm audit --omit=dev --json`

| Severity | Aantal |
|---|---|
| Critical | 0 |
| High | 0 |
| Moderate | 1 |
| Low | 0 |
| Info | 0 |

**Status: schoon.** Geen blokkerende kwetsbaarheden.

## 2. Content-Security-Policy

Bron: `scripts/check-csp.mjs` met Google's `csp_evaluator`. Faaldrempel: `HIGH_MAYBE` (40).

Gelezen uit: `vercel.json (HTTP header)`

| Severity | Aantal |
|---|---|
| HIGH | 0 |
| SYNTAX | 0 |
| MEDIUM | 0 |
| HIGH_MAYBE | 0 |
| STRICT_CSP | 0 |
| MEDIUM_MAYBE | 1 |
| INFO | 0 |

**Status: schoon.** Geen blokkerende findings.

### Bevindingen

- **MEDIUM_MAYBE** `script-src`: 'self' can be problematic if you host JSONP, AngularJS or user uploaded files.

## 3. Volgende automatische run

Wekelijkse cron-run: maandag 06:00 UTC. Daarnaast bij elke push naar `main` en bij PR's tegen `main`.
