# md-editor — Low-Level Design

## 1. Doel en scope

`md-editor` is een browser-only markdown editor. Notes worden niet op een server bewaard — ze staan rechtstreeks op de schijf van de gebruiker via de **File System Access API**. De app is gedistribueerd als **PWA** (installable web app) en wordt gehost via **GitHub Pages**.

Use cases:
- Snel notes maken en bewerken in een werkmap naar keuze.
- Markdown live previewen (inline rendering, geen split-pane).
- Snapshots maken voor versiehistorie.
- Exporteren naar PDF.
- Externe `.md` bestanden importeren via drag-and-drop.

Niet in scope: synchronisatie tussen apparaten, multi-user collaboratie, server-side opslag, authenticatie.

## 2. Architectuur

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (PWA)                                                │
│                                                              │
│  ┌────────────┐   ┌──────────┐   ┌──────────────────────┐    │
│  │ index.html │ → │ main.ts  │ ← │ CodeMirror 6 (editor)│    │
│  └────────────┘   │  (orch.) │   └──────────────────────┘    │
│                   │          │   ┌──────────────────────┐    │
│                   │          │ ← │ FileTree (sidebar)   │    │
│                   │          │   └──────────────────────┘    │
│                   │          │   ┌──────────────────────┐    │
│                   │          │ ← │ live-preview (CM     │    │
│                   │          │   │   widgets)           │    │
│                   │          │   └──────────────────────┘    │
│                   │          │   ┌──────────────────────┐    │
│                   │          │ → │ export-pdf (iframe)  │    │
│                   │          │   └──────────────────────┘    │
│                   └─────┬────┘                               │
│                         │                                    │
│                         ▼                                    │
│           ┌─────────────────────────────┐                    │
│           │ filesystem.ts (FSA wrapper) │                    │
│           └─────────────┬───────────────┘                    │
│                         │                                    │
│                         ▼                                    │
│           ┌─────────────────────────────┐                    │
│           │ File System Access API      │                    │
│           │   ↓                         │                    │
│           │ Lokale schijf (werkmap)     │                    │
│           └─────────────────────────────┘                    │
│                                                              │
│           ┌─────────────────────────────┐                    │
│           │ storage.ts (IndexedDB)      │                    │
│           │   ← folder handle           │                    │
│           │   ← laatst geopende file    │                    │
│           └─────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────┘
                         ▲
                         │ initial load + auto-update
                         │
              ┌──────────┴──────────┐
              │ GitHub Pages (HTTPS)│
              │   eldesm.github.io/ │
              │   md-editor/        │
              └─────────────────────┘
                         ▲
                         │ deploy on push
                         │
              ┌──────────┴──────────┐
              │ GitHub Actions      │
              │   build + deploy    │
              └─────────────────────┘
```

## 3. Module-overzicht

| Module | Verantwoordelijkheid |
|---|---|
| `src/main.ts` | App-orchestration: state (active file, dir handle), event-handlers, save-debouncing, snapshot-scheduling, drop-to-import. |
| `src/editor.ts` | CodeMirror 6 setup: extensions, theme, change-listener, `setEditorContent` helper. |
| `src/live-preview.ts` | CodeMirror `ViewPlugin` met decorators/widgets voor inline rendering van headings, links, task-checkboxes etc. Rendert via `textContent` op DOM-elementen — nooit `innerHTML` van user-content. |
| `src/file-tree.ts` | Sidebar-tree met expand/collapse, click-to-open, context-menu, intra-tree drag-and-drop (custom MIME `application/x-md-path`). |
| `src/filesystem.ts` | Wrapper rond File System Access API. Ondersteunt: `loadTree`, `readFile`, `writeFile`, `createFile`, `createFolder`, `renameEntry`, `duplicateEntry`, `deleteEntry`, `moveEntry`, `importFile`, snapshot-functies. |
| `src/storage.ts` | Tiny IndexedDB key-value store (`md-editor` → `kv`). Gebruikt voor het persisteren van de folder-handle en laatst geopend bestand. |
| `src/export-pdf.ts` | Markdown → HTML (via `marked`) → sanitize (`DOMPurify`) → laad in hidden iframe (`srcdoc`) → `iframe.contentWindow.print()`. |
| `src/style.css` | Globale styles, theme-variabelen, drag-feedback, drop-overlay. |

## 4. Data flow

### Edit + autosave
1. Gebruiker typt → CodeMirror `updateListener` triggert `handleEditorChange(content, charsChanged)`.
2. `setSaveStatus("saving", "Editing…")`, debounce-timer (400ms) wordt (her)gezet.
3. Bij timer-fire: `writeFile(activeFile.handle, content)` via `FileSystemWritableFileStream`.
4. `setSaveStatus("saved")`.

### Snapshots (versies)
Drie soorten:
- **`char`**: na elke 500 ge-edited karakters (telt insertions+deletions).
- **`idle`**: 3 minuten na laatste edit.
- **`manual`**: `⌘S`/`Ctrl+S`.

Snapshot-bestand: `_backups/<basename>.bak.YYYYMMDD-HHMMSS.<c|i|m>` naast de bron-file. Per soort wordt `pruneSnapshots` aangeroepen die de oudste verwijdert tot er max 10 over zijn.

Versie-popover laadt alle snapshots, sorteert op timestamp (nieuwste eerst), klikken doet:
1. Huidige inhoud als `manual` snapshot opslaan (zodat herstellen reversible is).
2. Snapshot inhoud terugschrijven naar de bron-file.
3. Editor herladen.

### Drop-to-import
1. Externe `.md`/`.markdown` file gedropt op `#main` (drop-handlers in capture phase met `stopPropagation` om CodeMirror's eigen drop-handling te onderscheppen).
2. `Inbox/` folder wordt aangemaakt in de werkmap als die nog niet bestaat.
3. File wordt gekopieerd via `importFile` (unique-name suffix bij conflict).
4. File-tree refresh, geïmporteerde file wordt geopend.

### PDF export
1. `marked.parse(markdown)` → HTML string.
2. `DOMPurify.sanitize(html)` → veilige HTML.
3. HTML wordt in een hidden `<iframe>` geladen via `srcdoc` (same-origin).
4. `iframe.contentWindow.print()` opent de browser-print-dialoog → "Save as PDF".

## 5. Persistence

### File System Access API (notes)
- `showDirectoryPicker({ mode: "readwrite" })` vraagt om gebruikerspermissie voor de werkmap.
- Folder-handle wordt **structured-cloned** in IndexedDB (browser-feature, geen serialisatie).
- Bij volgende app-start: handle wordt opgehaald, permission gecheckt (`queryPermission`), evt. opnieuw gevraagd (`requestPermission`).
- Snapshots in `_backups/` subfolder per parent-directory (geen flat snapshot-store).
- `_backups/` en bestanden beginnend met `.` worden gefilterd uit de tree-view.

### IndexedDB (`md-editor` / `kv`)
| Key | Waarde | Doel |
|---|---|---|
| `lastDir` | `FileSystemDirectoryHandle` | Werkmap herstellen bij start. |
| `lastFile` | `string` (path) | Laatst geopende file heropenen. |

Geen andere persistence (geen localStorage, geen cookies).

## 6. Externe interfaces

| Interface | Gebruik |
|---|---|
| **File System Access API** | Lezen/schrijven van notes en snapshots. Vereist Chrome/Edge/Opera (geen Firefox/Safari op dit moment). |
| **IndexedDB** | Folder-handle persistence. Universele browser-support. |
| **Service Worker** | Offline caching (workbox via `vite-plugin-pwa`). Strategy: precache van alle build-assets, `autoUpdate`. |
| **Web App Manifest** | PWA install metadata (`display: standalone`, icons, theme-color). |
| **`window.print()`** | PDF export via browser print-dialoog. |
| **GitHub Pages** | Static hosting van de built bundle. |

Geen API calls naar externe services. Geen telemetrie. Geen analytics.

## 7. Build & deploy

### Lokaal
```
npm install
npm run dev      # vite dev server op :5173
npm run build    # productie-bundle in dist/
```

### Productie
- `vite-plugin-pwa` genereert `dist/manifest.webmanifest`, `dist/sw.js`, `dist/registerSW.js`.
- `base: "/md-editor/"` zodat alle URLs werken onder `eldesm.github.io/md-editor/`.
- Iconen in `public/icons/` worden 1-op-1 gekopieerd; iconen in `icons/` (gebruikt door CSS) worden door Vite verwerkt en gehasht.

### CI/CD
`.github/workflows/deploy.yml`:
1. `actions/checkout` + `setup-node@20` + `npm ci` + `npm run build`.
2. `actions/upload-pages-artifact` met `dist/`.
3. `actions/deploy-pages` publiceert naar de Pages-environment.
Triggers: push naar `main`, of handmatig (`workflow_dispatch`).

### PWA install-flow
1. Gebruiker bezoekt `https://eldesm.github.io/md-editor/` in Chrome/Edge.
2. Browser leest manifest, toont install-prompt in de adresbalk.
3. Geïnstalleerde app draait standalone (eigen venster, dock/desktop icoon).
4. Service worker cached alle assets → werkt offline na eerste bezoek.

## 8. Security

### Threat model
Single-user note-taking app, geen backend, geen multi-user data. Gevoelige data (notes) blijft op de schijf van de gebruiker.

### Mitigaties
| Risico | Mitigatie |
|---|---|
| XSS via markdown content (live preview) | CodeMirror widgets gebruiken `textContent`/`setAttribute`, nooit `innerHTML` van content. |
| XSS via PDF export | `marked` output gaat door `DOMPurify.sanitize` voor het in de iframe komt. |
| Data leak naar externe servers | Geen externe network calls. CSP `default-src 'self'` + `connect-src 'self'` blokkeren onbedoelde uitgaande requests. |
| Filesystem misbruik | File System Access API sandbox: app heeft alleen toegang tot de door de gebruiker expliciet gekozen werkmap. |
| Compromised dependencies | Build-time deps zitten niet in productie-bundle. `package-lock.json` pinpt versies. |
| Compromised GitHub-account → kwaadaardige deploy | Externe mitigaties: GitHub 2FA, branch protection op `main`, PR-review-vereiste. |

### Content-Security-Policy
Aanwezig als `<meta http-equiv="Content-Security-Policy">` in `index.html`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';   (CodeMirror gebruikt inline styles)
img-src 'self' data:;                (geinlinede icons als data-URLs)
font-src 'self' data:;
connect-src 'self';
worker-src 'self';
manifest-src 'self';
frame-src 'self';                    (PDF-export iframe srcdoc = same-origin)
object-src 'none';
base-uri 'self';
form-action 'none';
```

### Bekende beperkingen
- CSP staat `unsafe-inline` toe voor styles — vereist door CodeMirror. Niet vermijdbaar zonder CodeMirror te forken of nonces server-side te genereren (niet mogelijk bij static hosting).
- Geen Subresource Integrity (alle assets zijn same-origin).
- Geen automated security scanning in CI (overweegrn: Dependabot, `npm audit` als CI-step).

## 9. Browser-support

| Feature | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| File System Access API | ✓ | ✓ | ✗ | ✗ |
| Service Worker / PWA install | ✓ | ✓ | ✓ (geen install) | ✓ (beperkt) |
| IndexedDB | ✓ | ✓ | ✓ | ✓ |

**Conclusie:** de app vereist Chrome of Edge voor volledige functionaliteit. Bij ontbreken van File System Access API toont de app een waarschuwing en disabled de "Open folder"-knop.

## 10. Toekomstige overwegingen

- **CSP nonces** zou `unsafe-inline` voor styles kunnen elimineren — vereist build-time HTML-rewriting.
- **Multi-folder support** (meerdere werkmappen tegelijk) zou een grotere refactor zijn van `dirHandle` van singleton naar collection.
- **Conflict detection** als externe wijzigingen aan een open file ontstaan (nu silent overwrite bij volgende save).
- **Markdown export naar HTML** (naast PDF).
- **Search across files** in de werkmap.
