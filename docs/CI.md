# md-editor — CI/CD Pipeline

Alle automatisering loopt via **GitHub Actions**, zodat configuratie in git zit en versioneerbaar is. Geen handmatige stappen, geen externe dashboards. De workflows staan in `.github/workflows/`.

## 1. Workflows

### 1.1 `deploy.yml` — Deploy to GitHub Pages

**Trigger:** push naar `main`, of handmatig via `workflow_dispatch`.

**Wat het doet:**
1. Checkout van de repo.
2. Node 20 met npm-cache.
3. `npm ci` — exacte versies uit `package-lock.json`.
4. `npm run build` — Vite produceert `dist/`.
5. `dist/` als Pages-artifact uploaden.
6. Job `deploy` publiceert naar de `github-pages` environment → live op `https://eldesm.github.io/md-editor/`.

**Faalt als:** TypeScript-errors, Vite build-errors, of een gefaalde `npm ci`.

### 1.2 `audit.yml` — Security audit

**Trigger:** push naar `main`, PR's naar `main`, en wekelijks (maandag 06:00 UTC) zodat nieuw gepubliceerde issues tegen de huidige codebase getoetst worden zonder code-wijziging.

**Wat het doet:** twee onafhankelijke checks in één job (de tweede draait via `if: always()` ook als de eerste faalt, zodat je in één run beide problemen ziet).

#### 1.2.1 Dependency CVE-check
`npm audit --omit=dev --audit-level=high` vergelijkt elke productie-dependency in `package-lock.json` met de GitHub Advisory Database. De build faalt bij een **high** of **critical** CVE.

- *Waarom `--omit=dev`*: Vite, TypeScript en andere dev-tools zitten niet in de bundle die naar gebruikers gaat. Een CVE daarin is geen productie-risico en zou anders ruis in CI veroorzaken.
- *Waarom wekelijks*: een dependency die vandaag schoon is kan morgen een nieuwe advisory krijgen zonder dat er code-pushes zijn.
- *Beperkingen*: alleen *gepubliceerde* advisories — geen zero-days, geen reachability-analyse. Bij false positives kan een specifieke advisory geüpgrade worden via een `npm overrides`-blok in `package.json`, of als laatste redmiddel via `--audit-level=critical`.

#### 1.2.2 Content-Security-Policy validatie
`node scripts/check-csp.mjs` extraheert de CSP-meta-tag uit `index.html`, parsed 'm met Google's `csp_evaluator` library en faalt bij findings van severity **HIGH_MAYBE** (40) of erger. Detecteert o.a. `unsafe-eval`, `*` als source, ontbrekende `object-src`/`base-uri`, en bekende JSONP-bypass-risks.

- *Threshold*: `Severity.HIGH_MAYBE` (40) — `MEDIUM_MAYBE` (50) findings worden geprint maar laten de build slagen. Pas `FAIL_AT` in het script aan om strikter of losser te zijn.
- *Beperkingen*: valideert alleen het *bedoelde* beleid in de bron. Of de host de policy ook correct serveert (en welke headers er aan toegevoegd worden) is een runtime-check op de gedeployde URL — daarvoor zijn securityheaders.com en Mozilla Observatory bedoeld.

## 2. Aanvullende beveiliging (buiten Actions)

### Dependabot
Aan te zetten via **repo → Settings → Code security**:
- **Alerts** — meldingen in de Security-tab bij nieuwe CVE's.
- **Security updates** — opent automatisch een PR met de patch.
- **Version updates** (optioneel, via `.github/dependabot.yml`) — periodieke upgrade-PR's.

Dependabot vult `audit.yml` aan: de workflow *blokkeert* merges bij een CVE, Dependabot *opent een PR* die het fixt.

## 3. Lokaal reproduceren

```
npm ci                                    # exact dezelfde versies als CI
npm audit --omit=dev --audit-level=high   # dependency CVE-check (1.2.1)
node scripts/check-csp.mjs                # CSP-validatie (1.2.2)
npm run build                             # zelfde build als deploy.yml
```
