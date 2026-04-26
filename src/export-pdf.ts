import { marked } from "marked";

const PRINT_STYLES = `
  @page { margin: 25mm 5mm; }
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  html, body {
    background: #ffffff !important;
    height: auto !important;
  }
  body {
    font-family: var(--prose-font);
    font-size: 11pt;
    line-height: 1.55;
    color: var(--fg);
    margin: 0;
    padding: 0 25mm;
    -webkit-font-smoothing: antialiased;
  }
  body > *:first-child { margin-top: 0; }
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--prose-font);
    line-height: 1.25;
    page-break-after: avoid;
    margin-top: 1.4em;
    margin-bottom: 0.3em;
    position: relative;
  }
  body { counter-reset: h1 h2 h3 h4 h5 h6; }
  h1 { counter-reset: h2 h3 h4 h5 h6; counter-increment: h1; }
  h2 { counter-reset: h3 h4 h5 h6; counter-increment: h2; }
  h3 { counter-reset: h4 h5 h6; counter-increment: h3; }
  h4 { counter-reset: h5 h6; counter-increment: h4; }
  h5 { counter-reset: h6; counter-increment: h5; }
  h6 { counter-increment: h6; }
  h1::before,
  h2::before,
  h3::before,
  h4::before,
  h5::before,
  h6::before {
    position: absolute;
    right: 100%;
    bottom: 0;
    margin-right: 0.5em;
    opacity: 0.45;
    font-weight: normal;
    white-space: nowrap;
  }
  h1::before { content: counter(h1) "."; }
  h2::before { content: counter(h1) "." counter(h2) "."; }
  h3::before { content: counter(h1) "." counter(h2) "." counter(h3) "."; }
  h4::before { content: counter(h1) "." counter(h2) "." counter(h3) "." counter(h4) "."; }
  h5::before { content: counter(h1) "." counter(h2) "." counter(h3) "." counter(h4) "." counter(h5) "."; }
  h6::before { content: counter(h1) "." counter(h2) "." counter(h3) "." counter(h4) "." counter(h5) "." counter(h6) "."; }
  h1 { font-size: 2em; font-weight: 700; letter-spacing: -0.01em; color: var(--h1-color); }
  h2 {
    font-size: 1.45em; font-weight: 300; font-style: italic; color: var(--h2-color);
    border-bottom: 2px solid var(--border); padding-bottom: 0.15em;
  }
  h3 { font-size: 1.2em; font-weight: 700; color: var(--h3-color); }
  h4 {
    font-size: 1.05em; font-weight: 600; color: var(--h4-color);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  h5 { font-size: 1em; font-weight: 600; color: var(--h5-color); }
  h6 {
    font-size: 0.92em; font-weight: 600; color: var(--h6-color);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  p { margin: 0.6em 0; }
  strong { font-weight: 700; color: var(--strong-color); }
  em { font-style: italic; color: var(--em-color); }
  del { text-decoration: line-through; color: var(--fg-muted); }
  a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  ul, ol { padding-left: 1.6em; margin: 0.6em 0; }
  li { margin: 0.15em 0; }
  blockquote {
    margin: 0.8em 0;
    padding: 0.2em 0 0.2em 12px;
    border-left: 3px solid var(--quote-color);
    color: var(--quote-color);
    font-style: italic;
  }
  code {
    font-family: var(--mono-font);
    font-size: 0.88em;
    background: var(--bg-codeblock);
    padding: 1px 6px;
    border-radius: var(--radius-s);
    border: 1px solid var(--border);
    color: #b91c1c;
  }
  pre {
    background: var(--bg-codeblock);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    padding: 10px 12px;
    overflow-x: auto;
    font-size: 9.5pt;
    line-height: 1.45;
    page-break-inside: avoid;
  }
  pre code {
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
    font-size: inherit;
  }
  hr { border: none; border-top: 1px solid var(--border-strong); margin: 1.2em 0; }
  table { border-collapse: collapse; margin: 0.8em 0; }
  th, td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
  th { background: var(--bg-codeblock); }
  img { max-width: 100%; }
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function collectDocumentStyles(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        parts.push(rule.cssText);
      }
    } catch {
      // Cross-origin sheet — skip
    }
  }
  return parts.join("\n");
}

export async function exportToPdf(markdown: string, title: string): Promise<void> {
  const body = await marked.parse(markdown, { gfm: true, breaks: false });
  const docTitle = title || "Untitled";
  const baseStyles = collectDocumentStyles();
  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(docTitle)}</title>
<base href="${escapeHtml(window.location.href)}">
<style>${baseStyles}</style>
<style>${PRINT_STYLES}</style>
</head>
<body>
${body}
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    iframe.srcdoc = html;
  });

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    throw new Error("Could not access print window");
  }

  // Wait for fonts to load inside the iframe before printing
  if (win.document.fonts && win.document.fonts.ready) {
    await win.document.fonts.ready;
  }

  win.focus();
  win.print();

  window.setTimeout(() => iframe.remove(), 1000);
}
