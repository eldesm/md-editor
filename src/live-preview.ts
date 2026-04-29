import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

const HIDE = Decoration.replace({});

class LinkWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly url: string,
  ) {
    super();
  }
  eq(other: LinkWidget): boolean {
    return this.text === other.text && this.url === other.url;
  }
  toDOM(): HTMLElement {
    const a = document.createElement("a");
    a.textContent = this.text;
    a.href = this.url;
    a.target = "_blank";
    a.rel = "noreferrer noopener";
    a.className = "cm-md-link";
    return a;
  }
}

class HeadingNumberWidget extends WidgetType {
  constructor(private readonly num: string) {
    super();
  }
  eq(other: HeadingNumberWidget): boolean {
    return this.num === other.num;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-heading-number";
    span.textContent = this.num;
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly view: EditorView,
  ) {
    super();
  }
  eq(other: TaskCheckboxWidget): boolean {
    return this.checked === other.checked;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = `cm-md-task-checkbox${this.checked ? " checked" : ""}`;
    span.contentEditable = "false";
    span.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = this.view.posAtDOM(span);
      const line = this.view.state.doc.lineAt(pos);
      const offset = pos - line.from;
      const match = /\[[ xX]\]/.exec(line.text.slice(offset));
      if (!match) return;
      const start = line.from + offset + (match.index ?? 0);
      const end = start + match[0].length;
      this.view.dispatch({
        changes: { from: start, to: end, insert: this.checked ? "[ ]" : "[x]" },
      });
    });
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq(_other: HorizontalRuleWidget): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-hr";
    return span;
  }
  ignoreEvent(): boolean {
    return true;
  }
}

function computeHeadingNumbers(view: EditorView): Map<number, string> {
  const result = new Map<number, string>();
  const counters = [0, 0, 0, 0, 0, 0];
  syntaxTree(view.state).iterate({
    enter: (node) => {
      const m = /^ATXHeading([1-6])$/.exec(node.name);
      if (!m) return undefined;
      const level = parseInt(m[1], 10);
      counters[level - 1]++;
      for (let i = level; i < 6; i++) counters[i] = 0;
      result.set(node.from, counters.slice(0, level).join("."));
      return undefined;
    },
  });
  return result;
}

function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const fromLine = view.state.doc.lineAt(range.from).number;
    const toLine = view.state.doc.lineAt(range.to).number;
    for (let i = fromLine; i <= toLine; i++) lines.add(i);
  }
  return lines;
}

function nodeIsOnActiveLine(
  view: EditorView,
  from: number,
  to: number,
  active: Set<number>,
): boolean {
  const startLine = view.state.doc.lineAt(from).number;
  const endLine = view.state.doc.lineAt(to).number;
  for (let i = startLine; i <= endLine; i++) {
    if (active.has(i)) return true;
  }
  return false;
}

type Pending = { from: number; to: number; deco: Decoration };

function addLineDeco(
  pending: Pending[],
  view: EditorView,
  fromPos: number,
  toPos: number,
  cls: string,
): void {
  let pos = fromPos;
  while (pos <= toPos) {
    const line = view.state.doc.lineAt(pos);
    pending.push({
      from: line.from,
      to: line.from,
      deco: Decoration.line({ class: cls }),
    });
    if (line.to >= toPos) break;
    pos = line.to + 1;
  }
}

function findFrontmatterRange(view: EditorView): { from: number; to: number } | null {
  const doc = view.state.doc;
  if (doc.lines < 2) return null;
  const firstLine = doc.line(1);
  if (firstLine.text !== "---") return null;
  for (let i = 2; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (line.text === "---" || line.text === "...") {
      return { from: firstLine.from, to: line.to };
    }
  }
  return null;
}

function buildDecorations(view: EditorView): DecorationSet {
  const active = activeLines(view);
  const pending: Pending[] = [];
  const headingNumbers = computeHeadingNumbers(view);
  const frontmatter = findFrontmatterRange(view);

  if (frontmatter) {
    const startLine = view.state.doc.lineAt(frontmatter.from);
    const endLine = view.state.doc.lineAt(frontmatter.to);
    for (let n = startLine.number; n <= endLine.number; n++) {
      const line = view.state.doc.line(n);
      const isFence = n === startLine.number || n === endLine.number;
      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({
          class: `cm-md-frontmatter-line${isFence ? " cm-md-frontmatter-fence" : ""}`,
        }),
      });
    }
  }

  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (
          frontmatter &&
          node.from >= frontmatter.from &&
          node.to <= frontmatter.to
        ) {
          return;
        }

        const onActive = nodeIsOnActiveLine(view, node.from, node.to, active);

        // Whole-line headings
        const headingMatch = /^ATXHeading([1-6])$/.exec(node.name);
        if (headingMatch) {
          const level = headingMatch[1];
          const line = view.state.doc.lineAt(node.from);
          pending.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ class: `cm-md-h${level}-line` }),
          });
          if (!onActive) {
            const num = headingNumbers.get(node.from);
            if (num) {
              pending.push({
                from: line.from,
                to: line.from,
                deco: Decoration.widget({
                  widget: new HeadingNumberWidget(num),
                  side: -1,
                }),
              });
            }
          }
          return;
        }

        // Inline styling spans
        if (node.name === "StrongEmphasis" && node.from < node.to) {
          pending.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: "cm-md-bold" }),
          });
          return;
        }
        if (node.name === "Emphasis" && node.from < node.to) {
          pending.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: "cm-md-italic" }),
          });
          return;
        }
        if (node.name === "Strikethrough" && node.from < node.to) {
          pending.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: "cm-md-strike" }),
          });
          return;
        }
        if (node.name === "InlineCode" && node.from < node.to) {
          pending.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: "cm-md-inline-code" }),
          });
          return;
        }

        // Block-level structures
        if (node.name === "Blockquote") {
          addLineDeco(pending, view, node.from, node.to, "cm-md-quote-line");
          return;
        }
        if (node.name === "FencedCode") {
          addLineDeco(pending, view, node.from, node.to, "cm-md-codeblock-line");
          // First and last line are the ``` fences
          const firstLine = view.state.doc.lineAt(node.from);
          const lastLine = view.state.doc.lineAt(node.to);
          pending.push({
            from: firstLine.from,
            to: firstLine.from,
            deco: Decoration.line({ class: "cm-md-codeblock-fence" }),
          });
          if (lastLine.from !== firstLine.from) {
            pending.push({
              from: lastLine.from,
              to: lastLine.from,
              deco: Decoration.line({ class: "cm-md-codeblock-fence" }),
            });
          }
          return;
        }
        if (node.name === "HorizontalRule") {
          const line = view.state.doc.lineAt(node.from);
          pending.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ class: "cm-md-hr-line" }),
          });
          if (!onActive) {
            pending.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new HorizontalRuleWidget() }),
            });
          }
          return;
        }

        // List markers: keep as plain text with subtle muted styling
        if (node.name === "ListMark" && node.from < node.to) {
          pending.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: "cm-md-list-mark" }),
          });
          return;
        }

        // Task checkboxes: [ ] / [x]
        if (node.name === "TaskMarker" && node.from < node.to) {
          const text = view.state.sliceDoc(node.from, node.to);
          const checked = /\[[xX]\]/.test(text);
          pending.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({
              widget: new TaskCheckboxWidget(checked, view),
            }),
          });
          return;
        }

        // Markdown markers: hide when not on active line, style subtly when revealed
        if (
          node.name === "HeaderMark" ||
          node.name === "EmphasisMark" ||
          node.name === "CodeMark" ||
          node.name === "StrikethroughMark" ||
          node.name === "QuoteMark"
        ) {
          if (node.from >= node.to) return;
          if (onActive) {
            pending.push({
              from: node.from,
              to: node.to,
              deco: Decoration.mark({ class: "cm-md-marker" }),
            });
          } else {
            let to = node.to;
            if (node.name === "HeaderMark" || node.name === "QuoteMark") {
              const next = view.state.sliceDoc(node.to, node.to + 1);
              if (next === " ") to = node.to + 1;
            }
            pending.push({ from: node.from, to, deco: HIDE });
          }
          return;
        }

        // Links: replace whole [text](url) with widget when not active
        if (node.name === "Link" && !onActive) {
          const link = parseLink(view, node.from, node.to);
          if (link) {
            pending.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new LinkWidget(link.text, link.url) }),
            });
          }
          return;
        }
      },
    });
  }

  pending.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  for (const p of pending) builder.add(p.from, p.to, p.deco);
  return builder.finish();
}

const LINK_RE = /^\[([^\]]*)\]\(([^)]+)\)$/;

function parseLink(
  view: EditorView,
  from: number,
  to: number,
): { text: string; url: string } | null {
  const m = LINK_RE.exec(view.state.sliceDoc(from, to));
  return m ? { text: m[1], url: m[2] } : null;
}

export const markdownLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
