import { marked } from "marked";
import DOMPurify from "dompurify";
import { stripFrontmatter } from "./export-pdf";

const DOCX_STYLES = `
  body {
    font-family: Calibri, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #222222;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: Calibri, Arial, sans-serif;
    line-height: 1.25;
    margin-top: 18pt;
    margin-bottom: 4pt;
  }
  h1 { font-size: 19pt; font-weight: 700; }
  h2 {
    font-size: 16pt; font-weight: 300; color: #222222;
    border-bottom: 2px solid #ebedf0; padding-bottom: 2pt;
  }
  h3 { font-size: 13pt; font-weight: 700; color: #007bc7; }
  h4 {
    font-size: 12pt; font-weight: 600; color: #94710a;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  h5 { font-size: 11pt; font-weight: 600; color: #d52b1e; }
  h6 {
    font-size: 10pt; font-weight: 600; color: #707070;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  p { margin: 6pt 0; }
  strong { font-weight: 700; color: #f092cd; }
  em { font-style: italic; color: #f092cd; }
  del { text-decoration: line-through; color: #707070; }
  a { color: #01689b; text-decoration: underline; }
  ul, ol { padding-left: 24pt; margin: 6pt 0; }
  li { margin: 2pt 0; }
  blockquote {
    margin: 8pt 0;
    padding: 2pt 0 2pt 12pt;
    border-left: 3px solid #76d2b6;
    color: #76d2b6;
    font-style: italic;
  }
  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 10pt;
    background: #f3f4f6;
    padding: 1pt 4pt;
    border: 1px solid #ebedf0;
    color: #b91c1c;
  }
  pre {
    background: #f3f4f6;
    border: 1px solid #ebedf0;
    padding: 8pt 10pt;
    font-family: Consolas, "Courier New", monospace;
    font-size: 9.5pt;
    line-height: 1.45;
  }
  pre code { background: transparent; border: none; padding: 0; color: inherit; font-size: inherit; }
  hr { border: none; border-top: 1px solid #d4d4d4; margin: 12pt 0; }
  table { border-collapse: collapse; margin: 8pt 0; width: 100%; }
  th, td {
    border: 1px solid #d4d4d4;
    padding: 6pt 10pt;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f3f4f6; font-weight: 700; }
  img { max-width: 100%; }
`;

export async function exportToWord(markdown: string, title: string): Promise<void> {
  const rawBody = await marked.parse(stripFrontmatter(markdown), { gfm: true, breaks: false });
  const body = DOMPurify.sanitize(rawBody);

  const safeTitle = (title || "Untitled").replace(/[<>&]/g, "");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="application/vnd.ms-word; charset=utf-8">
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>${DOCX_STYLES}</style>
</head>
<body>${body}</body>
</html>`;

  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title || "Untitled"}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
