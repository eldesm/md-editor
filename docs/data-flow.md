# Data flow

## Edit + autosave
1. Gebruiker typt → CodeMirror `updateListener` triggert `handleEditorChange(content, charsChanged)`.
2. `setSaveStatus("saving", "Editing…")`, debounce-timer (400ms) wordt (her)gezet.
3. Bij timer-fire: `writeFile(activeFile.handle, content)` via `FileSystemWritableFileStream`.
4. `setSaveStatus("saved")`.

## Snapshots (versies)
Drie soorten:
- **`char`**: na elke 500 ge-edited karakters (telt insertions+deletions).
- **`idle`**: 3 minuten na laatste edit.
- **`manual`**: `⌘S`/`Ctrl+S`.

Snapshot-bestand: `_backups/<basename>.bak.YYYYMMDD-HHMMSS.<c|i|m>` naast de bron-file. Per soort wordt `pruneSnapshots` aangeroepen die de oudste verwijdert tot er max 10 over zijn.

Versie-popover laadt alle snapshots, sorteert op timestamp (nieuwste eerst), klikken doet:
1. Huidige inhoud als `manual` snapshot opslaan (zodat herstellen reversible is).
2. Snapshot inhoud terugschrijven naar de bron-file.
3. Editor herladen.

## Drop-to-import
1. Externe `.md`/`.markdown` file gedropt op `#main` (drop-handlers in capture phase met `stopPropagation` om CodeMirror's eigen drop-handling te onderscheppen).
2. `Inbox/` folder wordt aangemaakt in de werkmap als die nog niet bestaat.
3. File wordt gekopieerd via `importFile` (unique-name suffix bij conflict).
4. File-tree refresh, geïmporteerde file wordt geopend.

## PDF export
1. `stripFrontmatter(markdown)` → markdown zonder YAML-block.
2. `marked.parse(...)` → HTML string.
3. `DOMPurify.sanitize(html)` → veilige HTML.
4. HTML wordt als `innerHTML` toegekend aan een nieuwe `<div id="pdf-print-root">` in het hoofd-document. Een geïnjecteerde `<style>` verbergt dit element schermbreed en toont het uitsluitend onder `@media print` (alle andere `body > *` worden in print verborgen).
5. `document.fonts.ready` wachten → `window.print()` op het hoofd-window opent de browser-print-dialoog → "Save as PDF".
6. Na print wordt `pdf-print-root` weer verwijderd en de oude `document.title` hersteld (de title wordt tijdelijk op de filename gezet zodat de print-preview en standaard-bestandsnaam kloppen).

Reden voor deze aanpak (in plaats van een hidden iframe): sommige browsers/printers gaven lege output of mislukte print-preview bij iframe `srcdoc` — print via het parent-window omzeilt dat probleem volledig.

## Word export
1. `stripFrontmatter(markdown)` → markdown zonder YAML-block.
2. `marked.parse(...)` → HTML string.
3. `DOMPurify.sanitize(html)` → veilige HTML.
4. Wrappen in een Word-compatibel HTML-document (Office namespaces, inline `<style>` met print-pt sizes en kleuren die overeenkomen met de PDF-export).
5. Blob met MIME `application/msword` + UTF-8 BOM → download triggeren via een tijdelijk `<a download>`-element.

Word opent het `.doc` bestand met behoud van headings, tabellen, lijsten, en de typografische accenten.

## Markdown download
Direct uitschrijven van de huidige editor-buffer als blob (`text/markdown;charset=utf-8`) en downloaden onder de filename van de actieve note. Geen rendering, geen sanitatie — het is een 1-op-1 export van de bron.
