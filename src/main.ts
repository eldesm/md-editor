import "./style.css";
import { createEditor, setEditorContent } from "./editor";
import {
  pickDirectory,
  loadTree,
  readFile,
  writeFile,
  createFile,
  renameFile,
  type FileNode,
  type TreeNode,
} from "./filesystem";
import { FileTree } from "./file-tree";
import * as storage from "./storage";

const SAVE_DEBOUNCE_MS = 400;
const STORAGE_KEY_DIR = "lastDir";
const STORAGE_KEY_FILE = "lastFile";

const appEl = document.getElementById("app") as HTMLDivElement;
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn") as HTMLButtonElement;
const openFolderBtn = document.getElementById("open-folder-btn") as HTMLButtonElement;
const newFileBtn = document.getElementById("new-file-btn") as HTMLButtonElement;
const refreshBtn = document.getElementById("refresh-btn") as HTMLButtonElement;
const folderNameEl = document.getElementById("folder-name") as HTMLDivElement;
const fileTreeEl = document.getElementById("file-tree") as HTMLDivElement;
const breadcrumbsEl = document.getElementById("breadcrumbs") as HTMLElement;
const saveStatusEl = document.getElementById("save-status") as HTMLSpanElement;
const wordCountEl = document.getElementById("word-count") as HTMLSpanElement;
const editorEl = document.getElementById("editor") as HTMLDivElement;
const docTitleEl = document.getElementById("doc-title") as HTMLInputElement;

let dirHandle: FileSystemDirectoryHandle | null = null;
let tree: TreeNode[] = [];
let activeFile: FileNode | null = null;
let saveTimer: number | null = null;
let suppressChange = false;

const editor = createEditor(editorEl, handleEditorChange);

const fileTree = new FileTree({
  container: fileTreeEl,
  onFileClick: (file) => void openFile(file),
  isActive: (file) => activeFile?.path === file.path,
});

function setSaveStatus(state: "idle" | "saving" | "saved" | "error", text?: string): void {
  saveStatusEl.className = state === "idle" ? "" : state;
  saveStatusEl.textContent =
    text ??
    (state === "saving"
      ? "Saving…"
      : state === "saved"
      ? "Saved"
      : state === "error"
      ? "Save failed"
      : "");
}

function renderBreadcrumbs(): void {
  breadcrumbsEl.innerHTML = "";
  if (!activeFile) {
    const span = document.createElement("span");
    span.className = "crumb";
    span.textContent = "No file open";
    breadcrumbsEl.appendChild(span);
    return;
  }
  const parts = activeFile.path.split("/");
  parts[parts.length - 1] = parts[parts.length - 1].replace(/\.(md|markdown)$/i, "");
  parts.forEach((part, idx) => {
    const isLast = idx === parts.length - 1;
    const crumb = document.createElement("span");
    crumb.className = isLast ? "crumb current" : "crumb";
    crumb.textContent = part;
    breadcrumbsEl.appendChild(crumb);
    if (!isLast) {
      const sep = document.createElement("span");
      sep.className = "crumb-sep";
      sep.textContent = "/";
      breadcrumbsEl.appendChild(sep);
    }
  });
}

function updateWordCount(text: string): void {
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  const chars = text.length;
  wordCountEl.textContent = `${words} words · ${chars} chars`;
}

async function refreshTree(): Promise<void> {
  if (!dirHandle) return;
  tree = await loadTree(dirHandle);
  fileTree.setNodes(tree);
  if (activeFile) fileTree.expandToFile(activeFile.path);
}

function setDocTitle(file: FileNode | null): void {
  if (file) {
    docTitleEl.value = file.name.replace(/\.(md|markdown)$/i, "");
    docTitleEl.disabled = false;
  } else {
    docTitleEl.value = "";
    docTitleEl.disabled = true;
  }
}

async function openFile(file: FileNode): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (activeFile) await saveActive(editor.state.doc.toString());
  }
  activeFile = file;
  const content = await readFile(file.handle);
  suppressChange = true;
  setEditorContent(editor, content);
  suppressChange = false;
  renderBreadcrumbs();
  setDocTitle(file);
  updateWordCount(content);
  setSaveStatus("saved");
  fileTree.expandToFile(file.path);
  fileTree.refresh();
  editor.focus();
  void storage.set(STORAGE_KEY_FILE, file.path);
}

const INVALID_NAME_RE = /[/\\:*?"<>|]/;

async function commitTitleRename(): Promise<void> {
  if (!activeFile || !dirHandle) return;
  const raw = docTitleEl.value.trim();
  const currentBase = activeFile.name.replace(/\.(md|markdown)$/i, "");
  if (raw === "" || raw === currentBase) {
    docTitleEl.value = currentBase;
    return;
  }
  if (INVALID_NAME_RE.test(raw)) {
    window.alert('Bestandsnaam mag geen / \\ : * ? " < > | bevatten.');
    docTitleEl.value = currentBase;
    return;
  }

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
    await saveActive(editor.state.doc.toString());
  }

  const newName = /\.(md|markdown)$/i.test(raw) ? raw : `${raw}.md`;

  try {
    const result = await renameFile(dirHandle, activeFile.path, newName);
    activeFile = {
      kind: "file",
      name: newName,
      handle: result.handle,
      path: result.path,
    };
    await refreshTree();
    renderBreadcrumbs();
    setDocTitle(activeFile);
    await storage.set(STORAGE_KEY_FILE, activeFile.path);
    setSaveStatus("saved");
  } catch (err) {
    console.error(err);
    window.alert(`Hernoemen mislukt: ${(err as Error).message}`);
    docTitleEl.value = currentBase;
  }
}

docTitleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    docTitleEl.blur();
  } else if (e.key === "Escape") {
    e.preventDefault();
    if (activeFile) {
      docTitleEl.value = activeFile.name.replace(/\.(md|markdown)$/i, "");
    }
    docTitleEl.blur();
  }
});

docTitleEl.addEventListener("blur", () => void commitTitleRename());

async function saveActive(content: string): Promise<void> {
  if (!activeFile) return;
  setSaveStatus("saving");
  try {
    await writeFile(activeFile.handle, content);
    setSaveStatus("saved");
  } catch (err) {
    console.error(err);
    setSaveStatus("error", err instanceof Error ? err.message : "Save failed");
  }
}

function handleEditorChange(content: string): void {
  updateWordCount(content);
  if (suppressChange || !activeFile) return;
  setSaveStatus("saving", "Editing…");
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void saveActive(content);
  }, SAVE_DEBOUNCE_MS);
}

async function applyOpenedFolder(
  handle: FileSystemDirectoryHandle,
  options: { restoreLastFile: boolean },
): Promise<void> {
  dirHandle = handle;
  folderNameEl.textContent = handle.name;
  folderNameEl.classList.remove("clickable");
  folderNameEl.style.color = "";
  newFileBtn.disabled = false;
  refreshBtn.disabled = false;
  activeFile = null;
  suppressChange = true;
  setEditorContent(editor, "");
  suppressChange = false;
  renderBreadcrumbs();
  setDocTitle(null);
  updateWordCount("");
  setSaveStatus("idle", "");
  await refreshTree();

  if (options.restoreLastFile) {
    const lastFile = await storage.get<string>(STORAGE_KEY_FILE);
    if (lastFile) {
      const file = findFileByPath(tree, lastFile);
      if (file) await openFile(file);
    }
  }
}

async function handleOpenFolder(): Promise<void> {
  try {
    const handle = await pickDirectory();
    await storage.set(STORAGE_KEY_DIR, handle);
    await storage.del(STORAGE_KEY_FILE);
    await applyOpenedFolder(handle, { restoreLastFile: false });
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      console.error(err);
    }
  }
}

async function tryRestoreLastFolder(): Promise<void> {
  const saved = await storage.get<FileSystemDirectoryHandle>(STORAGE_KEY_DIR);
  if (!saved) return;

  const opts: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };

  let status: PermissionState;
  try {
    status = await saved.queryPermission(opts);
  } catch {
    await storage.del(STORAGE_KEY_DIR);
    return;
  }

  if (status === "granted") {
    await applyOpenedFolder(saved, { restoreLastFile: true });
    return;
  }

  folderNameEl.textContent = `Klik om "${saved.name}" te openen`;
  folderNameEl.classList.add("clickable");
  const reconnect = async () => {
    try {
      const result = await saved.requestPermission(opts);
      if (result === "granted") {
        folderNameEl.removeEventListener("click", reconnect);
        await applyOpenedFolder(saved, { restoreLastFile: true });
      }
    } catch (err) {
      console.error(err);
      await storage.del(STORAGE_KEY_DIR);
      folderNameEl.classList.remove("clickable");
      folderNameEl.textContent = "No folder open";
      folderNameEl.removeEventListener("click", reconnect);
    }
  };
  folderNameEl.addEventListener("click", reconnect);
}

async function handleNewFile(): Promise<void> {
  if (!dirHandle) return;
  const name = window.prompt("New file name", "untitled.md");
  if (!name) return;
  const finalName = /\.(md|markdown)$/i.test(name) ? name : `${name}.md`;
  try {
    await createFile(dirHandle, finalName);
    await refreshTree();
    const created = findFileByPath(tree, finalName);
    if (created) await openFile(created);
  } catch (err) {
    console.error(err);
    window.alert(`Could not create file: ${(err as Error).message}`);
  }
}

function findFileByPath(nodes: TreeNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.kind === "file" && node.path === path) return node;
    if (node.kind === "folder") {
      const found = findFileByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

if (!("showDirectoryPicker" in window)) {
  openFolderBtn.disabled = true;
  folderNameEl.textContent = "Browser ondersteunt geen File System Access";
  folderNameEl.style.color = "#ef4444";
}

function toggleSidebar(): void {
  appEl.classList.toggle("sidebar-collapsed");
}

openFolderBtn.addEventListener("click", () => void handleOpenFolder());
newFileBtn.addEventListener("click", () => void handleNewFile());
refreshBtn.addEventListener("click", () => void refreshTree());
toggleSidebarBtn.addEventListener("click", toggleSidebar);

window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
    e.preventDefault();
    toggleSidebar();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (saveTimer !== null) {
    e.preventDefault();
    e.returnValue = "";
  }
});

renderBreadcrumbs();
updateWordCount("");
void tryRestoreLastFolder();
