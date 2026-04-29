import { marked } from "marked";
import DOMPurify from "dompurify";

const PRINT_ROOT_ID = "pdf-print-root";
const PRINT_STYLE_ID = "pdf-print-styles";

const PRINT_STYLES = `
  #${PRINT_ROOT_ID} { display: none; }

  @media print {
    @page { margin: 25mm 5mm; }

    * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    html, body {
      background: #ffffff !important;
      height: auto !important;
      margin: 0;
      padding: 0;
    }

    body > :not(#${PRINT_ROOT_ID}) { display: none !important; }

    #${PRINT_ROOT_ID} {
      display: block !important;
      font-family: var(--prose-font);
      font-size: 11pt;
      line-height: 1.55;
      color: var(--fg);
      padding: 0 25mm;
      -webkit-font-smoothing: antialiased;
      counter-reset: h1 h2 h3 h4 h5 h6;
    }
    #${PRINT_ROOT_ID} > *:first-child { margin-top: 0; }

    #${PRINT_ROOT_ID} h1,
    #${PRINT_ROOT_ID} h2,
    #${PRINT_ROOT_ID} h3,
    #${PRINT_ROOT_ID} h4,
    #${PRINT_ROOT_ID} h5,
    #${PRINT_ROOT_ID} h6 {
      font-family: var(--prose-font);
      line-height: 1.25;
      page-break-after: avoid;
      margin-top: 1.4em;
      margin-bottom: 0.3em;
      position: relative;
    }
    #${PRINT_ROOT_ID} h1 { counter-reset: h2 h3 h4 h5 h6; counter-increment: h1; }
    #${PRINT_ROOT_ID} h2 { counter-reset: h3 h4 h5 h6; counter-increment: h2; }
    #${PRINT_ROOT_ID} h3 { counter-reset: h4 h5 h6; counter-increment: h3; }
    #${PRINT_ROOT_ID} h4 { counter-reset: h5 h6; counter-increment: h4; }
    #${PRINT_ROOT_ID} h5 { counter-reset: h6; counter-increment: h5; }
    #${PRINT_ROOT_ID} h6 { counter-increment: h6; }
    #${PRINT_ROOT_ID} h1::before,
    #${PRINT_ROOT_ID} h2::before,
    #${PRINT_ROOT_ID} h3::before,
    #${PRINT_ROOT_ID} h4::before,
    #${PRINT_ROOT_ID} h5::before,
    #${PRINT_ROOT_ID} h6::before {
      position: absolute;
      right: 100%;
      bottom: 0;
      margin-right: 0.5em;
      opacity: 0.45;
      font-weight: normal;
      white-space: nowrap;
    }
    #${PRINT_ROOT_ID} h1::before { content: counter(h1) "."; }
    #${PRINT_ROOT_ID} h2::before { content: counter(h1) "." counter(h2) "."; }
    #${PRINT_ROOT_ID} h3::before { content: counter(h1) "." counter(h2) "." counter(h3) "."; }
    #${PRINT_ROOT_ID} h4::before { content: counter(h1) "." counter(h2) "." counter(h3) "." counter(h4) "."; }
    #${PRINT_ROOT_ID} h5::before { content: counter(h1) "." counter(h2) "." counter(h3) "." counter(h4) "." counter(h5) "."; }
    #${PRINT_ROOT_ID} h6::before { content: counter(h1) "." counter(h2) "." counter(h3) "." counter(h4) "." counter(h5) "." counter(h6) "."; }
    #${PRINT_ROOT_ID} h1 { font-size: 1.7em; font-weight: 700; letter-spacing: -0.01em; color: var(--h1-color); }
    #${PRINT_ROOT_ID} h2 {
      font-size: 1.45em; font-weight: 300; color: var(--h2-color);
      border-bottom: 2px solid var(--border); padding-bottom: 0.15em;
    }
    #${PRINT_ROOT_ID} h3 { font-size: 1.2em; font-weight: 700; color: var(--h3-color); }
    #${PRINT_ROOT_ID} h4 {
      font-size: 1.05em; font-weight: 600; color: var(--h4-color);
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    #${PRINT_ROOT_ID} h5 { font-size: 1em; font-weight: 600; color: var(--h5-color); }
    #${PRINT_ROOT_ID} h6 {
      font-size: 0.92em; font-weight: 600; color: var(--h6-color);
      text-transform: uppercase; letter-spacing: 0.04em;
    }

    #${PRINT_ROOT_ID} p { margin: 0.6em 0; }
    #${PRINT_ROOT_ID} strong { font-weight: 700; color: var(--strong-color); }
    #${PRINT_ROOT_ID} em { font-style: italic; color: var(--em-color); }
    #${PRINT_ROOT_ID} del { text-decoration: line-through; color: var(--fg-muted); }
    #${PRINT_ROOT_ID} a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
    #${PRINT_ROOT_ID} ul,
    #${PRINT_ROOT_ID} ol { padding-left: 1.6em; margin: 0.6em 0; }
    #${PRINT_ROOT_ID} li { margin: 0.15em 0; }
    #${PRINT_ROOT_ID} blockquote {
      margin: 0.8em 0;
      padding: 0.2em 0 0.2em 12px;
      border-left: 3px solid var(--quote-color);
      color: var(--quote-color);
      font-style: italic;
    }
    #${PRINT_ROOT_ID} code {
      font-family: var(--mono-font);
      font-size: 0.88em;
      background: var(--bg-codeblock);
      padding: 1px 6px;
      border-radius: var(--radius-s);
      border: 1px solid var(--border);
      color: #b91c1c;
    }
    #${PRINT_ROOT_ID} pre {
      background: var(--bg-codeblock);
      border: 1px solid var(--border);
      border-radius: var(--radius-s);
      padding: 10px 12px;
      overflow-x: auto;
      font-size: 9.5pt;
      line-height: 1.45;
      page-break-inside: avoid;
    }
    #${PRINT_ROOT_ID} pre code {
      background: transparent;
      border: none;
      padding: 0;
      color: inherit;
      font-size: inherit;
    }
    #${PRINT_ROOT_ID} hr { border: none; border-top: 1px solid var(--border-strong); margin: 1.2em 0; }
    #${PRINT_ROOT_ID} table {
      border-collapse: collapse;
      margin: 0.8em 0;
      width: 100%;
      page-break-inside: avoid;
    }
    #${PRINT_ROOT_ID} th,
    #${PRINT_ROOT_ID} td {
      border: 1px solid var(--border-strong);
      padding: 6px 10px;
      text-align: left;
      vertical-align: top;
    }
    #${PRINT_ROOT_ID} th {
      background: var(--bg-codeblock);
      font-weight: 700;
    }
    #${PRINT_ROOT_ID} img { max-width: 100%; }
  }
`;

function ensureStyleSheet(): void {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = PRINT_STYLES;
  document.head.appendChild(style);
}

function stripFrontmatter(md: string): string {
  const lines = md.split("\n");
  if (lines.length < 2 || lines[0] !== "---") return md;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---" || lines[i] === "...") {
      return lines.slice(i + 1).join("\n").replace(/^\n+/, "");
    }
  }
  return md;
}

export async function exportToPdf(markdown: string, title: string): Promise<void> {
  const rawBody = await marked.parse(stripFrontmatter(markdown), { gfm: true, breaks: false });
  const body = DOMPurify.sanitize(rawBody);

  ensureStyleSheet();

  const previous = document.getElementById(PRINT_ROOT_ID);
  if (previous) previous.remove();

  const printRoot = document.createElement("div");
  printRoot.id = PRINT_ROOT_ID;
  printRoot.innerHTML = body;
  document.body.appendChild(printRoot);

  const oldTitle = document.title;
  document.title = title || "Untitled";

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    window.print();
  } finally {
    printRoot.remove();
    document.title = oldTitle;
  }
}
