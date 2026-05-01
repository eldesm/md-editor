# Persistence & externe interfaces

## File System Access API (notes)
- `showDirectoryPicker({ mode: "readwrite" })` vraagt om gebruikerspermissie voor de werkmap.
- Folder-handle wordt **structured-cloned** in IndexedDB (browser-feature, geen serialisatie).
- Bij volgende app-start: handle wordt opgehaald, permission gecheckt (`queryPermission`), evt. opnieuw gevraagd (`requestPermission`).
- Snapshots in `_backups/` subfolder per parent-directory (geen flat snapshot-store).
- `_backups/` en bestanden beginnend met `.` worden gefilterd uit de tree-view.

## IndexedDB (`md-editor` / `kv`)

| Key | Waarde | Doel |
|---|---|---|
| `lastDir` | `FileSystemDirectoryHandle` | Werkmap herstellen bij start. |
| `lastFile` | `string` (path) | Laatst geopende file heropenen. |

Geen andere persistence (geen localStorage, geen cookies).

## Externe interfaces

| Interface | Gebruik |
|---|---|
| **File System Access API** | Lezen/schrijven van notes en snapshots. Vereist Chrome/Edge/Opera (geen Firefox/Safari op dit moment). |
| **IndexedDB** | Folder-handle persistence. Universele browser-support. |
| **Service Worker** | Offline caching (workbox via `vite-plugin-pwa`). Strategy: precache van alle build-assets, `autoUpdate`. |
| **Web App Manifest** | PWA install metadata (`display: standalone`, icons, theme-color). |
| **`window.print()`** | PDF export via browser print-dialoog (in-place op het hoofd-document, geen iframe). |
| **Blob + `<a download>`** | Word- en markdown-export naar de Downloads-folder van de gebruiker. |
| **GitHub Pages** | Static hosting van de built bundle. |

Geen API calls naar externe services. Geen telemetrie. Geen analytics.
