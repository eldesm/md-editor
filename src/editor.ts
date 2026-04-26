import { EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { indentOnInput, indentUnit, bracketMatching } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { markdownLivePreview } from "./live-preview";

export type EditorChangeHandler = (content: string, charsChanged: number) => void;

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
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
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
