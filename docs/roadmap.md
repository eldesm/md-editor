# Roadmap & toekomstige overwegingen

- **Custom-host migratie** (Cloudflare Pages / Netlify / Vercel) zou een echte CSP-HTTP-header mogelijk maken inclusief `frame-ancestors`, HSTS en violation-reporting. Zie [security.md](security.md).
- **CSP nonces** zou `unsafe-inline` voor styles kunnen elimineren — vereist build-time HTML-rewriting.
- **`frame-src 'none'`** sluiten nu de iframe-aanpak weg is, in plaats van `'self'`.
- **Echte `.docx`** in plaats van het huidige Word-HTML-document met `.doc` extensie (vereist een library als `docx`).
- **Multi-folder support** (meerdere werkmappen tegelijk) zou een grotere refactor zijn van `dirHandle` van singleton naar collection.
- **Conflict detection** als externe wijzigingen aan een open file ontstaan (nu silent overwrite bij volgende save).
- **HTML export** (naast PDF/Word).
- **Search across files** in de werkmap.
