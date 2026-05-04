import { EditorState, EditorSelection, Prec } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, KeyBinding } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { indentOnInput, indentUnit, bracketMatching } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdownLivePreview } from "./live-preview";

export type EditorChangeHandler = (content: string, charsChanged: number) => void;

function toggleWrap(marker: string) {
  return (view: EditorView): boolean => {
    const { state } = view;
    const transaction = state.changeByRange((range) => {
      const { from, to } = range;
      const selected = state.doc.sliceString(from, to);
      const before = state.doc.sliceString(Math.max(0, from - marker.length), from);
      const after = state.doc.sliceString(to, Math.min(state.doc.length, to + marker.length));

      if (before === marker && after === marker) {
        return {
          changes: [
            { from: from - marker.length, to: from },
            { from: to, to: to + marker.length },
          ],
          range: EditorSelection.range(from - marker.length, to - marker.length),
        };
      }
      if (
        selected.length >= marker.length * 2 &&
        selected.startsWith(marker) &&
        selected.endsWith(marker)
      ) {
        return {
          changes: [
            { from, to: from + marker.length },
            { from: to - marker.length, to },
          ],
          range: EditorSelection.range(from, to - marker.length * 2),
        };
      }
      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker },
        ],
        range: EditorSelection.range(from + marker.length, to + marker.length),
      };
    });

    if (transaction.changes.empty) return false;
    view.dispatch(transaction);
    return true;
  };
}

function toggleLink(view: EditorView): boolean {
  const { state } = view;
  const transaction = state.changeByRange((range) => {
    const { from, to } = range;
    const selected = state.doc.sliceString(from, to);
    const linkMatch = selected.match(/^\[(.*)\]\((.*)\)$/);

    if (linkMatch) {
      const text = linkMatch[1];
      return {
        changes: { from, to, insert: text },
        range: EditorSelection.range(from, from + text.length),
      };
    }
    if (from === to) {
      return {
        changes: { from, insert: "[](url)" },
        range: EditorSelection.cursor(from + 1),
      };
    }
    if (/^(https?:\/\/|www\.)/i.test(selected)) {
      return {
        changes: { from, to, insert: `[](${selected})` },
        range: EditorSelection.cursor(from + 1),
      };
    }
    return {
      changes: { from, to, insert: `[${selected}](url)` },
      range: EditorSelection.range(from + selected.length + 3, from + selected.length + 6),
    };
  });

  if (transaction.changes.empty) return false;
  view.dispatch(transaction);
  return true;
}

const markdownShortcuts: KeyBinding[] = [
  { key: "Mod-b", run: toggleWrap("**"), preventDefault: true },
  { key: "Mod-i", run: toggleWrap("_"), preventDefault: true },
  { key: "Mod-e", run: toggleWrap("`"), preventDefault: true },
  { key: "Mod-k", run: toggleLink, preventDefault: true },
];

const proseTheme = EditorView.theme({
  "&": {
    fontFamily:
      '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, sans-serif',
    fontSize: "17px",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
  },
  ".cm-content": {
    fontFamily: "inherit",
    paddingTop: "56px",
    paddingBottom: "240px",
    paddingLeft: "max(28px, calc(50% - var(--content-half)))",
    paddingRight: "max(28px, calc(50% - var(--content-half)))",
    caretColor: "var(--accent)",
  },
});

export function createEditor(parent: HTMLElement, onChange: EditorChangeHandler): EditorView {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      let charsChanged = 0;
      update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        charsChanged += (toA - fromA) + inserted.length;
      });
      onChange(update.state.doc.toString(), charsChanged);
    }
  });

  const tabKeymap = Prec.highest(
    keymap.of([
      { key: "Tab", run: indentMore, preventDefault: true },
      { key: "Shift-Tab", run: indentLess, preventDefault: true },
    ]),
  );

  const state = EditorState.create({
    doc: "",
    extensions: [
      highlightActiveLine(),
      history(),
      indentUnit.of("    "),
      indentOnInput(),
      bracketMatching(),
      highlightSelectionMatches(),
      markdown({ base: markdownLanguage }),
      proseTheme,
      markdownLivePreview,
      tabKeymap,
      keymap.of([...markdownShortcuts, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      EditorView.lineWrapping,
      updateListener,
    ],
  });

  return new EditorView({ state, parent });
}

export function setEditorContent(view: EditorView, content: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  });
}
