# Roadmap & toekomstige overwegingen

## Security
- **CSP nonces** zou `unsafe-inline` voor styles kunnen elimineren — vereist build-time HTML-rewriting.
- **`report-uri` / `report-to`** voor live CSP-violation-monitoring (in productie zien welke policy-overtredingen er gebeuren). Vereist een rapporteringseindpunt zoals report-uri.com of een eigen Vercel-route.
- **Branch protection op `main`** met required status check op de `audit`-job — zodat een agent of mens de gates niet via een PR-edit kan neutraliseren. Te configureren in GitHub Settings, niet in deze repo. Zie [security.md § Bekende beperkingen](security.md).

## GH Pages: parallelle deploy houden of opruimen
GH Pages draait sinds de Vercel-migratie tijdelijk weer als volwaardige app, omdat `md-editor.elidesmet.nl` op werklaptops met corporate Edge-beleid in beperkte weergave terechtkomt (geen SmartScreen-reputatie). Concrete vervolgstappen liggen klaar:
- **Migratie-pagina opnieuw uitrollen** zodra `md-editor.elidesmet.nl` voldoende reputation heeft of via corporate IT is whitelisted. De code voor `gh-pages/index.html` + cleanup-`sw.js` staat in git history (commit `0d0ab0a` / `429b19b`).
- **Meta-tag CSP verwijderen** uit `index.html` zodra GH Pages niet meer als app dient. De HTTP-header in `vercel.json` is dan de canonical policy.
- **`vite.config.ts` `base`-conditional opruimen** zodra GH Pages niet meer als app-host dient — fallback `/md-editor/` is dan alleen voor lokale dev relevant.
- **`deploy.yml` workflow uitzetten** als laatste stap.

## Features
- **Echte `.docx`** in plaats van het huidige Word-HTML-document met `.doc` extensie (vereist een library als `docx`).
- **Multi-folder support** (meerdere werkmappen tegelijk) — grotere refactor van `dirHandle` van singleton naar collection.
- **Conflict detection** als externe wijzigingen aan een open file ontstaan (nu silent overwrite bij volgende save).
- **HTML export** (naast PDF/Word).
- **Search across files** in de werkmap.
