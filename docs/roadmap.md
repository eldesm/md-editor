# Roadmap & toekomstige overwegingen

## Security
- **CSP nonces** zou `unsafe-inline` voor styles kunnen elimineren — vereist build-time HTML-rewriting.
- **`report-uri` / `report-to`** voor live CSP-violation-monitoring (in productie zien welke policy-overtredingen er gebeuren). Vereist een rapporteringseindpunt zoals report-uri.com of een eigen Vercel-route.
- **Branch protection op `main`** met required status check op de `audit`-job — zodat een agent of mens de gates niet via een PR-edit kan neutraliseren. Te configureren in GitHub Settings, niet in deze repo. Zie [security.md § Bekende beperkingen](security.md).

## GH Pages decommissioning
- **Meta-tag CSP verwijderen** uit `index.html` zodra alle bekende gebruikers zijn overgestapt naar `md-editor.elidesmet.nl`. De HTTP-header in `vercel.json` is de canonical policy.
- **Redirect-pagina** op `eldesm.github.io/md-editor/` die naar de nieuwe URL stuurt (en de service worker daar unregistert), zodat oude PWA-installs vloeiend overgaan.
- **`deploy.yml` workflow uitzetten** wanneer GH Pages niet meer nodig is.

## Features
- **Echte `.docx`** in plaats van het huidige Word-HTML-document met `.doc` extensie (vereist een library als `docx`).
- **Multi-folder support** (meerdere werkmappen tegelijk) — grotere refactor van `dirHandle` van singleton naar collection.
- **Conflict detection** als externe wijzigingen aan een open file ontstaan (nu silent overwrite bij volgende save).
- **HTML export** (naast PDF/Word).
- **Search across files** in de werkmap.
