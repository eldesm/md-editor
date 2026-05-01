# md-editor — Documentatie

`md-editor` is een browser-only markdown editor (PWA, GitHub Pages). Notes blijven op de schijf van de gebruiker via de File System Access API. Geen backend, geen telemetrie.

## Inhoud

| Document | Onderwerp |
|---|---|
| [architecture.md](architecture.md) | Doel, scope, architectuur-diagram en module-overzicht. |
| [data-flow.md](data-flow.md) | Edit/autosave, snapshots, drop-import, PDF/Word/MD export. |
| [persistence.md](persistence.md) | File System Access API, IndexedDB, externe browser-interfaces. |
| [build.md](build.md) | Lokale build, productie-bundle, PWA install-flow, browser-support. |
| [CI.md](CI.md) | GitHub Actions workflows: deploy en security audit. |
| [security.md](security.md) | Threat model, mitigaties, Content-Security-Policy. |
| [security-status.md](security-status.md) | Auto-gegenereerd statusrapport van de laatste audit-run. |
| [roadmap.md](roadmap.md) | Toekomstige overwegingen en open punten. |
| [security-actions-blueprint.md](security-actions-blueprint.md) | Ontwerp voor een toekomstige centrale `security-actions`-repo, voor wanneer er een tweede PWA bijkomt. |
