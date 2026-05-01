# Centrale `security-actions` repo — blueprint

Vooruitkijkend ontwerp voor wanneer er een tweede (of derde) PWA bijkomt en het zinvol wordt om security-checks niet meer per project te dupliceren.

## Uitgangspunt: niet-invasief

De centrale repo screent consumer-repos **zonder hen te wijzigen**. Geen workflows, geen scripts, geen extra dependencies, geen `overrides`-blokken — niks dat in de consumer-repo geknutseld hoeft te worden. Alle screening-logica leeft in de centrale repo.

Reden: minimaliseert onderhoud per consumer, voorkomt dat een PR in een consumer-repo de gates kan afzwakken (zoals besproken in [security.md § Bekende beperkingen](security.md)), en houdt elke consumer-repo schoon en project-eigen.

## Architectuur

```
┌─────────────────────────────────────┐
│ eldesm/security-actions             │
│                                     │
│  consumers.yml                      │
│   - eldesm/md-editor                │
│   - eldesm/<future-app>             │
│                                     │
│  scripts/                           │
│    check-csp.mjs       (generic)    │
│    audit-deps.mjs      (generic)    │
│    aggregate-status.mjs             │
│                                     │
│  .github/workflows/                 │
│    scan-all.yml  (cron, dispatch)   │
│                                     │
│  OVERVIEW.md  (auto-generated)      │
└──────────────┬──────────────────────┘
               │ gh api / git clone
               │ (read-only PAT or GitHub App)
               ▼
   ┌───────────┴───────────┐
   │                       │
┌──▼──────────┐    ┌───────▼────────┐
│ md-editor   │    │ <future-app>   │
│ (unchanged) │    │ (unchanged)    │
└─────────────┘    └────────────────┘
```

De centrale workflow draait op cron + dispatch:
1. Leest `consumers.yml` → lijst van repos.
2. Per repo: shallow clone, lees `vercel.json` / `index.html` voor CSP, lees `package-lock.json` voor `npm audit --json`, run `csp_evaluator` over de policy.
3. Schrijft per consumer een sectie in `OVERVIEW.md` (severity-counts, blocking findings, last-run timestamp).
4. Committed `OVERVIEW.md` terug naar centrale repo (`[skip ci]`).
5. Optioneel: opent een issue in de centrale repo (niet de consumer) bij nieuwe blocking findings.

## Wat verhuist (en wat blijft)

| Component | Centraal | Consumer |
|---|---|---|
| `scripts/check-csp.mjs` | ✓ | — |
| `scripts/security-report.mjs` (per consumer-output) | als `aggregate-status.mjs` | — |
| `audit.yml` workflow | als `scan-all.yml`, cron-driven | — |
| `codeql.yml` | ⚠ blijft per repo | ✓ (CodeQL vereist code-context die het centrale model niet heeft) |
| `vercel.json` | template kan in de centrale repo staan ter referentie | ✓ wordt door Vercel uit de consumer-repo gelezen |
| Status-rapport | `OVERVIEW.md` (alle consumers) | — |
| `npm overrides`-blokken | — | ✓ blijven in de consumer want `package-lock.json` daar wordt gebouwd |

CodeQL is de uitzondering: het analyseert *code* en moet draaien in de context van de repo zelf, dus dat blijft een lokale workflow. Wel kan de centrale repo de CodeQL-resultaten via `gh api` ophalen en samenvatten in `OVERVIEW.md`.

## Niet-invasief vs blokkerend

Een 100% niet-invasief model **rapporteert** maar **blokkeert niet**: een consumer-PR met een nieuwe CVE kan gemerged worden, want er is geen status-check in de consumer-repo. De centrale cron-run vangt het de volgende ochtend op en zet de status op rood.

Wil je toch PR-blokkering, dan zijn er twee opties zonder de consumer te raken:

1. **GitHub Repository Rulesets met "required workflow"** — op org-niveau af te dwingen dat de centrale `scan-all.yml` slaagt voor merge in alle gekozen repos. Werkt op personal accounts beperkt; op org-accounts standaard practice.
2. **GitHub App** die `pull_request`-events ontvangt en zelf een check-run posts (de "checks API"). Code in centrale repo, geen workflow-file in consumer. Iets meer setup (App registreren), maar volledig niet-invasief en wel blokkerend.

## Authenticatie

De centrale repo heeft read-toegang nodig op de consumer-repos. Twee paden:

- **Personal Access Token (fine-grained)** met `repo:read` op specifieke repos. Eenvoudig, beperkt tot één gebruiker.
- **GitHub App** in de gebruikersaccount geïnstalleerd op de consumer-repos. Beter voor lange termijn, herstart-veilig, fijnmazigere permissies.

Voor één persoon met handvol repos: PAT voldoet. Bij meer mensen of een org: GitHub App.

## Migratie-volgorde (wanneer dit te doen)

Niet nu. Begin pas als er een tweede consumer-PWA is en je merkt dat je dezelfde checks copy-paste. Dan:

1. Repo `eldesm/security-actions` aanmaken.
2. `scripts/check-csp.mjs` en `scripts/security-report.mjs` uit deze repo kopiëren, parametriseren (paths/options als CLI-flags of env-vars).
3. `consumers.yml` met `eldesm/md-editor` als enige eerste entry.
4. `scan-all.yml` schrijven die over consumers itereert en `OVERVIEW.md` produceert.
5. Test: één run, vergelijk output met deze repo's `docs/security-status.md` (moet equivalent zijn voor md-editor).
6. Tweede consumer toevoegen aan `consumers.yml`. Geen wijziging in deze repo nodig — dat is precies het punt.
7. **Pas later**: `docs/security-status.md` en `scripts/security-report.mjs` uit deze repo verwijderen wanneer de centrale `OVERVIEW.md` ze vervangt. Tot die tijd: laat ze parallel draaien als verificatie dat het centrale model dezelfde resultaten geeft.

## Geschatte effort

- Minimal viable (read-only screen + OVERVIEW.md): **1 dag** voor iemand die de huidige scripts al kent.
- Plus dashboard / per-consumer tabs: **+0,5 dag**.
- Plus GitHub App voor PR-blocking: **+1 dag**.
