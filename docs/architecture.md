# Architectuur

## 1. Doel en scope

`md-editor` is een browser-only markdown editor. Notes worden niet op een server bewaard — ze staan rechtstreeks op de schijf van de gebruiker via de **File System Access API**. De app is gedistribueerd als **PWA** (installable web app) en wordt gehost via **GitHub Pages**.

Use cases:
- Snel notes maken en bewerken in een werkmap naar keuze.
- Markdown live previewen (inline rendering, geen split-pane).
- Snapshots maken voor versiehistorie.
- Exporteren naar PDF, Word (`.doc`), of de ruwe markdown downloaden.
- Externe `.md` bestanden importeren via drag-and-drop.

Niet in scope: synchronisatie tussen apparaten, multi-user collaboratie, server-side opslag, authenticatie.

## 2. Architectuur-diagram

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
│                   │          │ → │ export-pdf (print)   │    │
│                   │          │   ├──────────────────────┤    │
│                   │          │ → │ export-docx (.doc)   │    │
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
| `src/main.ts` | App-orchestration: state (active file, dir handle), event-handlers, save-debouncing, snapshot-scheduling, drop-to-import, download/export-handlers. Zet `document.title` met `__APP_VERSION__` (gedefinieerd in `vite.config.ts` op basis van `package.json`). |
| `src/editor.ts` | CodeMirror 6 setup: extensions, theme, change-listener, `setEditorContent` helper. |
| `src/live-preview.ts` | CodeMirror `ViewPlugin` met decorators/widgets voor inline rendering van headings, links, task-checkboxes, en YAML frontmatter (als distinct block). Rendert via `textContent` op DOM-elementen — nooit `innerHTML` van user-content. |
| `src/file-tree.ts` | Sidebar-tree met expand/collapse, click-to-open, context-menu, intra-tree drag-and-drop (custom MIME `application/x-md-path`). |
| `src/filesystem.ts` | Wrapper rond File System Access API. Ondersteunt: `loadTree`, `readFile`, `writeFile`, `createFile`, `createFolder`, `renameEntry`, `duplicateEntry`, `deleteEntry`, `moveEntry`, `importFile`, snapshot-functies. |
| `src/storage.ts` | Tiny IndexedDB key-value store (`md-editor` → `kv`). Gebruikt voor het persisteren van de folder-handle en laatst geopend bestand. |
| `src/export-pdf.ts` | Markdown → HTML (via `marked`) → sanitize (`DOMPurify`) → injecteert een `#pdf-print-root` in het hoofd-document met print-only CSS → `window.print()` op het hoofd-window. Exporteert ook `stripFrontmatter` voor hergebruik. |
| `src/export-docx.ts` | Markdown → HTML (via `marked`) → sanitize (`DOMPurify`) → wrap in een Word-compatibel HTML-document met inline styles → blob met MIME `application/msword` → trigger download als `.doc`. |
| `src/style.css` | Globale styles, theme-variabelen, drag-feedback, drop-overlay, frontmatter-block styling. |
