import "./style.css";
import { createEditor, setEditorContent } from "./editor";
import {
  pickDirectory,
  loadTree,
  readFile,
  writeFile,
  createFile,
  createFolder,
  renameFile,
  renameEntry,
  duplicateEntry,
  deleteEntry,
  moveEntry,
  importFile,
  writeSnapshot,
  pruneSnapshots,
  hasSnapshots,
  listSnapshots,
  readSnapshot,
  stripMdExt,
  ensureMdExt,
  type SnapshotInfo,
  type SnapshotKind,
  type FileNode,
  type TreeNode,
} from "./filesystem";
import { FileTree } from "./file-tree";
import * as storage from "./storage";
import { exportToPdf } from "./export-pdf";
import { exportToWord } from "./export-docx";

const SAVE_DEBOUNCE_MS = 400;
const SNAPSHOT_IDLE_MS = 3 * 60 * 1000;
const SNAPSHOT_CHAR_THRESHOLD = 500;
const SNAPSHOT_MAX = 10;
const STATUS_FLASH_MS = 1500;
const STORAGE_KEY_DIR = "lastDir";
const STORAGE_KEY_FILE = "lastFile";
const STORAGE_KEY_PINS_PREFIX = "pins:";
const IS_MAC = /Mac|iPad|iPhone|iPod/.test(navigator.platform);
const SLOT_LABEL = "Alt+";

const appEl = document.getElementById("app") as HTMLDivElement;
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn") as HTMLButtonElement;
const openFolderBtn = document.getElementById("open-folder-btn") as HTMLButtonElement;
const newFileBtn = document.getElementById("new-file-btn") as HTMLButtonElement;
const newFolderBtn = document.getElementById("new-folder-btn") as HTMLButtonElement;
const revealBtn = document.getElementById("reveal-btn") as HTMLButtonElement;
const collapseToggleBtn = document.getElementById("collapse-toggle-btn") as HTMLButtonElement;
const folderNameEl = document.getElementById("folder-name") as HTMLSpanElement;
const fileTreeEl = document.getElementById("file-tree") as HTMLDivElement;
const breadcrumbsEl = document.getElementById("breadcrumbs") as HTMLElement;
const saveStatusEl = document.getElementById("save-status") as HTMLSpanElement;
const wordCountEl = document.getElementById("word-count") as HTMLSpanElement;
const editorEl = document.getElementById("editor") as HTMLDivElement;
const mainEl = document.getElementById("main") as HTMLElement;
const versionsBtn = document.getElementById("versions-btn") as HTMLButtonElement;
const versionsPopover = document.getElementById("versions-popover") as HTMLDivElement;
const exportPdfBtn = document.getElementById("export-pdf-btn") as HTMLButtonElement;
const exportDocxBtn = document.getElementById("export-docx-btn") as HTMLButtonElement;
const downloadMdBtn = document.getElementById("download-md-btn") as HTMLButtonElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsPopover = document.getElementById("settings-popover") as HTMLDivElement;

let dirHandle: FileSystemDirectoryHandle | null = null;
let tree: TreeNode[] = [];
let activeFile: FileNode | null = null;
let saveTimer: number | null = null;
let snapshotTimer: number | null = null;
let lastSnapshotContent = "";
let charsSinceSnapshot = 0;
let suppressChange = false;
let restoreInFlight = false;
let pendingReconnect: (() => Promise<void>) | null = null;
let pinnedSlots: Record<string, string> = {};

const editor = createEditor(editorEl, handleEditorChange);

const fileTree = new FileTree({
  container: fileTreeEl,
  onFileClick: (file) => void openFile(file),
  isActive: (file) => activeFile?.path === file.path,
  onContextMenu: (node, event) => showContextMenu(node, event),
  onDropMove: (sourcePath, destFolderPath) =>
    void handleDropMove(sourcePath, destFolderPath),
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
  breadcrumbsEl.replaceChildren();
  if (!activeFile) {
    const span = document.createElement("span");
    span.className = "crumb";
    span.textContent = "No file open";
    breadcrumbsEl.appendChild(span);
    return;
  }
  const parts = activeFile.path.split("/");
  parts[parts.length - 1] = stripMdExt(parts[parts.length - 1]);
  parts.forEach((part, idx) => {
    const isLast = idx === parts.length - 1;
    const crumb = document.createElement("span");
    crumb.className = isLast ? "crumb current" : "crumb";
    crumb.textContent = part;
    if (isLast) {
      crumb.contentEditable = "true";
      crumb.spellcheck = false;
      crumb.addEventListener("keydown", handleTitleKeydown);
      crumb.addEventListener("blur", handleTitleBlur);
    }
    breadcrumbsEl.appendChild(crumb);
    if (!isLast) {
      const sep = document.createElement("span");
      sep.className = "crumb-sep";
      sep.textContent = "/";
      breadcrumbsEl.appendChild(sep);
    }
  });
}

function handleTitleKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement;
  if (e.key === "Enter") {
    e.preventDefault();
    target.blur();
  } else if (e.key === "Escape") {
    e.preventDefault();
    if (activeFile) {
      target.textContent = stripMdExt(activeFile.name);
    }
    target.blur();
  }
}

function handleTitleBlur(e: FocusEvent): void {
  void commitTitleRename(e.target as HTMLElement);
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
  updateCollapseToggleUI();
}

async function openFile(file: FileNode): Promise<void> {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (activeFile) await saveActive(editor.state.doc.toString());
  }
  clearSnapshotTimer();
  closeVersionsPopover();
  activeFile = file;
  const content = await readFile(file.handle);
  lastSnapshotContent = content;
  charsSinceSnapshot = 0;
  suppressChange = true;
  setEditorContent(editor, content);
  suppressChange = false;
  renderBreadcrumbs();
  updateWordCount(content);
  setSaveStatus("saved");
  versionsBtn.disabled = false;
  exportPdfBtn.disabled = false;
  exportDocxBtn.disabled = false;
  downloadMdBtn.disabled = false;
  revealBtn.disabled = false;
  fileTree.expandToFile(file.path);
  fileTree.refresh();
  updateCollapseToggleUI();
  editor.focus();
  void storage.set(STORAGE_KEY_FILE, file.path);

  if (dirHandle) {
    try {
      if (!(await hasSnapshots(dirHandle, file.path))) {
        await writeSnapshot(dirHandle, file.path, content, "manual");
      }
    } catch (err) {
      console.error("Initial snapshot failed:", err);
    }
  }
}

const INVALID_NAME_RE = /[/\\:*?"<>|]/;

async function commitTitleRename(target: HTMLElement): Promise<void> {
  if (!activeFile || !dirHandle) return;
  const raw = (target.textContent || "").trim();
  const currentBase = stripMdExt(activeFile.name);
  if (raw === "" || raw === currentBase) {
    target.textContent = currentBase;
    return;
  }
  if (INVALID_NAME_RE.test(raw)) {
    window.alert('Bestandsnaam mag geen / \\ : * ? " < > | bevatten.');
    target.textContent = currentBase;
    return;
  }

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
    await saveActive(editor.state.doc.toString());
  }

  const newName = ensureMdExt(raw);

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
    await storage.set(STORAGE_KEY_FILE, activeFile.path);
    setSaveStatus("saved");
  } catch (err) {
    console.error(err);
    window.alert(`Hernoemen mislukt: ${(err as Error).message}`);
    target.textContent = currentBase;
  }
}

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

async function takeSnapshot(kind: SnapshotKind): Promise<void> {
  if (!activeFile || !dirHandle) return;
  const content = editor.state.doc.toString();
  if (kind !== "manual" && content === lastSnapshotContent) return;
  try {
    await writeSnapshot(dirHandle, activeFile.path, content, kind);
    await pruneSnapshots(dirHandle, activeFile.path, kind, SNAPSHOT_MAX);
    lastSnapshotContent = content;
    if (kind === "manual") {
      setSaveStatus("saved", "Snapshot saved");
      window.setTimeout(() => setSaveStatus("saved"), STATUS_FLASH_MS);
    }
  } catch (err) {
    console.error("Snapshot failed:", err);
    if (kind === "manual") {
      setSaveStatus("error", "Snapshot failed");
    }
  }
}

function scheduleSnapshot(): void {
  if (snapshotTimer !== null) clearTimeout(snapshotTimer);
  snapshotTimer = window.setTimeout(() => {
    snapshotTimer = null;
    void takeSnapshot("idle");
  }, SNAPSHOT_IDLE_MS);
}

function clearSnapshotTimer(): void {
  if (snapshotTimer !== null) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
}

function handleEditorChange(content: string, charsChanged: number): void {
  updateWordCount(content);
  if (suppressChange || !activeFile) return;
  setSaveStatus("saving", "Editing…");
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void saveActive(content);
  }, SAVE_DEBOUNCE_MS);
  charsSinceSnapshot += charsChanged;
  if (charsSinceSnapshot >= SNAPSHOT_CHAR_THRESHOLD) {
    charsSinceSnapshot = 0;
    void takeSnapshot("char");
  }
  scheduleSnapshot();
}

async function applyOpenedFolder(
  handle: FileSystemDirectoryHandle,
  options: { restoreLastFile: boolean },
): Promise<void> {
  pendingReconnect = null;
  dirHandle = handle;
  folderNameEl.textContent = handle.name;
  folderNameEl.style.color = "";
  newFileBtn.disabled = false;
  newFolderBtn.disabled = false;
  collapseToggleBtn.disabled = false;
  clearSnapshotTimer();
  closeVersionsPopover();
  activeFile = null;
  lastSnapshotContent = "";
  charsSinceSnapshot = 0;
  suppressChange = true;
  setEditorContent(editor, "");
  suppressChange = false;
  versionsBtn.disabled = true;
  exportPdfBtn.disabled = true;
  exportDocxBtn.disabled = true;
  downloadMdBtn.disabled = true;
  revealBtn.disabled = true;
  renderBreadcrumbs();
  updateWordCount("");
  setSaveStatus("idle", "");
  await refreshTree();
  await loadPinnedSlots();

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
  pendingReconnect = async () => {
    try {
      const result = await saved.requestPermission(opts);
      if (result === "granted") {
        await applyOpenedFolder(saved, { restoreLastFile: true });
      }
    } catch (err) {
      console.error(err);
      await storage.del(STORAGE_KEY_DIR);
      folderNameEl.textContent = "No folder open";
      pendingReconnect = null;
    }
  };
}

async function handleNewFile(): Promise<void> {
  if (!dirHandle) return;
  const name = window.prompt("New file name", "untitled.md");
  if (!name) return;
  const finalName = ensureMdExt(name);
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

async function handleNewFolder(): Promise<void> {
  if (!dirHandle) return;
  const name = window.prompt("New folder name");
  if (!name) return;
  const trimmed = name.trim();
  if (trimmed === "" || INVALID_NAME_RE.test(trimmed)) {
    window.alert('Foldernaam mag geen / \\ : * ? " < > | bevatten.');
    return;
  }
  try {
    await createFolder(dirHandle, trimmed);
    await refreshTree();
  } catch (err) {
    console.error(err);
    window.alert(`Could not create folder: ${(err as Error).message}`);
  }
}

function handleReveal(): void {
  if (!activeFile) return;
  fileTree.revealFile(activeFile.path);
}

function updateCollapseToggleUI(): void {
  const iconEl = collapseToggleBtn.querySelector<HTMLSpanElement>(".btn-icon");
  if (fileTree.hasAnyExpanded()) {
    if (iconEl) iconEl.className = "btn-icon btn-icon-collapse";
    collapseToggleBtn.title = "Collapse all";
    collapseToggleBtn.setAttribute("aria-label", "Collapse all");
  } else {
    if (iconEl) iconEl.className = "btn-icon btn-icon-expand";
    collapseToggleBtn.title = "Expand all";
    collapseToggleBtn.setAttribute("aria-label", "Expand all");
  }
}

function handleCollapseToggle(): void {
  if (fileTree.hasAnyExpanded()) fileTree.collapseAll();
  else fileTree.expandAll();
  updateCollapseToggleUI();
}

function pinsKey(): string | null {
  return dirHandle ? `${STORAGE_KEY_PINS_PREFIX}${dirHandle.name}` : null;
}

async function loadPinnedSlots(): Promise<void> {
  const key = pinsKey();
  if (!key) {
    pinnedSlots = {};
    return;
  }
  const saved = await storage.get<Record<string, string>>(key);
  pinnedSlots = saved ?? {};
}

async function savePinnedSlots(): Promise<void> {
  const key = pinsKey();
  if (!key) return;
  await storage.set(key, pinnedSlots);
}

async function pinCurrentToSlot(slot: string): Promise<void> {
  if (!activeFile) {
    setSaveStatus("idle", `No file to pin to ${SLOT_LABEL}${slot}`);
    window.setTimeout(() => setSaveStatus("saved"), STATUS_FLASH_MS);
    return;
  }
  pinnedSlots[slot] = activeFile.path;
  await savePinnedSlots();
  setSaveStatus("saved", `Pinned to ${SLOT_LABEL}${slot}`);
  window.setTimeout(() => setSaveStatus("saved"), STATUS_FLASH_MS);
}

async function openPinnedSlot(slot: string): Promise<void> {
  const path = pinnedSlots[slot];
  if (!path) return;
  const file = findFileByPath(tree, path);
  if (!file) {
    setSaveStatus("error", `${SLOT_LABEL}${slot} target missing`);
    window.setTimeout(() => setSaveStatus("saved"), STATUS_FLASH_MS);
    return;
  }
  if (activeFile?.path === path) return;
  await openFile(file);
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

function formatRelative(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "zojuist";
  if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
  if (diff < 172800) return "gisteren";
  return `${Math.floor(diff / 86400)} dagen geleden`;
}

function formatStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function closeVersionsPopover(): void {
  versionsPopover.hidden = true;
  versionsPopover.replaceChildren();
}

function setVersionsMessage(text: string): void {
  const msg = document.createElement("div");
  msg.className = "version-empty";
  msg.textContent = text;
  versionsPopover.replaceChildren(msg);
}

function renderVersions(snaps: SnapshotInfo[], activeName?: string): void {
  if (snaps.length === 0) {
    setVersionsMessage("No versions yet");
    return;
  }
  versionsPopover.replaceChildren();
  for (const snap of snaps) {
    const item = document.createElement("div");
    item.className = snap.name === activeName ? "version-item active" : "version-item";

    const rel = document.createElement("span");
    rel.className = "version-relative";
    rel.textContent = formatRelative(snap.date);
    item.appendChild(rel);

    const stamp = document.createElement("span");
    stamp.className = "version-stamp";
    stamp.textContent = formatStamp(snap.date);
    item.appendChild(stamp);

    item.addEventListener("click", () => void restoreSnapshot(snap));
    versionsPopover.appendChild(item);
  }
}

async function openVersionsPopover(): Promise<void> {
  if (!activeFile || !dirHandle) return;
  setVersionsMessage("Loading…");
  versionsPopover.hidden = false;
  try {
    const snaps = await listSnapshots(dirHandle, activeFile.path);
    renderVersions(snaps);
  } catch (err) {
    console.error(err);
    setVersionsMessage("Could not load");
  }
}

function closeSettingsPopover(): void {
  settingsPopover.hidden = true;
  settingsPopover.replaceChildren();
}

function buildSettingsPopover(): void {
  const mod = "Ctrl+";
  const sections: { title: string; rows: { key: string; desc: string }[] }[] = [
    {
      title: "Formatting",
      rows: [
        { key: `${mod}B`, desc: "Bold (toggle)" },
        { key: `${mod}I`, desc: "Italic (toggle)" },
        { key: `${mod}E`, desc: "Inline code (toggle)" },
        { key: `${mod}K`, desc: "Link (toggle)" },
      ],
    },
    {
      title: "Document pinning",
      rows: [
        { key: `${SLOT_LABEL}1…9`, desc: "Open pinned document" },
        { key: `${SLOT_LABEL}Shift+1…9`, desc: "Pin current document to that slot" },
      ],
    },
    {
      title: "Other",
      rows: [
        { key: `${mod}S`, desc: "Manual snapshot" },
        { key: `${mod}\\`, desc: "Toggle sidebar" },
        { key: "Drag .md", desc: "Import into Inbox" },
      ],
    },
  ];

  settingsPopover.replaceChildren();
  for (const section of sections) {
    const wrap = document.createElement("div");
    wrap.className = "settings-section";

    const title = document.createElement("div");
    title.className = "settings-section-title";
    title.textContent = section.title;
    wrap.appendChild(title);

    for (const row of section.rows) {
      const r = document.createElement("div");
      r.className = "settings-row";
      const k = document.createElement("span");
      k.className = "settings-key";
      k.textContent = row.key;
      const d = document.createElement("span");
      d.className = "settings-desc";
      d.textContent = row.desc;
      r.appendChild(k);
      r.appendChild(d);
      wrap.appendChild(r);
    }
    settingsPopover.appendChild(wrap);
  }

  const footer = document.createElement("div");
  footer.className = "settings-footer";
  footer.textContent = `md-editor ${__APP_VERSION__}`;
  settingsPopover.appendChild(footer);
}

function openSettingsPopover(): void {
  closeVersionsPopover();
  buildSettingsPopover();
  settingsPopover.hidden = false;
}

async function restoreSnapshot(snap: SnapshotInfo): Promise<void> {
  if (restoreInFlight || !activeFile || !dirHandle) return;
  restoreInFlight = true;
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  clearSnapshotTimer();
  try {
    const currentContent = editor.state.doc.toString();
    if (currentContent !== lastSnapshotContent) {
      await writeSnapshot(dirHandle, activeFile.path, currentContent, "manual");
      await pruneSnapshots(dirHandle, activeFile.path, "manual", SNAPSHOT_MAX);
    }
    const restored = await readSnapshot(dirHandle, activeFile.path, snap.name);
    suppressChange = true;
    setEditorContent(editor, restored);
    suppressChange = false;
    lastSnapshotContent = restored;
    charsSinceSnapshot = 0;
    updateWordCount(restored);
    await saveActive(restored);
    setSaveStatus("saved", `Restored ${formatStamp(snap.date)}`);
    window.setTimeout(() => setSaveStatus("saved"), STATUS_FLASH_MS);
    if (!versionsPopover.hidden) {
      const snaps = await listSnapshots(dirHandle, activeFile.path);
      renderVersions(snaps, snap.name);
    }
  } catch (err) {
    console.error(err);
    window.alert(`Restore mislukt: ${(err as Error).message}`);
  } finally {
    restoreInFlight = false;
  }
}

async function flushPendingSave(): Promise<void> {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  await saveActive(editor.state.doc.toString());
}

function clearActiveFileState(): void {
  activeFile = null;
  lastSnapshotContent = "";
  charsSinceSnapshot = 0;
  clearSnapshotTimer();
  closeVersionsPopover();
  suppressChange = true;
  setEditorContent(editor, "");
  suppressChange = false;
  versionsBtn.disabled = true;
  exportPdfBtn.disabled = true;
  exportDocxBtn.disabled = true;
  downloadMdBtn.disabled = true;
  revealBtn.disabled = true;
  renderBreadcrumbs();
  updateWordCount("");
  setSaveStatus("idle", "");
}

async function reattachActiveAfterPathChange(
  oldPath: string,
  newPath: string,
): Promise<void> {
  if (!activeFile) return;
  let nextPath: string | null = null;
  if (activeFile.path === oldPath) nextPath = newPath;
  else if (activeFile.path.startsWith(`${oldPath}/`)) {
    nextPath = newPath + activeFile.path.slice(oldPath.length);
  }
  if (!nextPath) return;
  const updated = findFileByPath(tree, nextPath);
  if (updated) {
    activeFile = updated;
    renderBreadcrumbs();
    await storage.set(STORAGE_KEY_FILE, nextPath);
  }
}

function closeContextMenu(): void {
  document.querySelector(".context-menu")?.remove();
}

function showContextMenu(node: TreeNode, event: MouseEvent): void {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;

  const items: { label: string; danger?: boolean; action: () => Promise<void> }[] = [
    { label: "Duplicate", action: () => handleDuplicate(node) },
    { label: "Rename", action: () => handleRename(node) },
    { label: "Delete", danger: true, action: () => handleDelete(node) },
  ];

  for (const it of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = it.danger ? "context-menu-item danger" : "context-menu-item";
    btn.textContent = it.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeContextMenu();
      void it.action();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${window.innerHeight - rect.height - 4}px`;
  }
}

async function handleDuplicate(node: TreeNode): Promise<void> {
  if (!dirHandle) return;
  try {
    if (activeFile && (activeFile.path === node.path || activeFile.path.startsWith(`${node.path}/`))) {
      await flushPendingSave();
    }
    await duplicateEntry(dirHandle, node.path);
    await refreshTree();
  } catch (err) {
    console.error(err);
    window.alert(`Dupliceren mislukt: ${(err as Error).message}`);
  }
}

async function handleRename(node: TreeNode): Promise<void> {
  if (!dirHandle) return;
  const isFile = node.kind === "file";
  const currentDisplay = isFile ? stripMdExt(node.name) : node.name;
  const raw = window.prompt("Nieuwe naam", currentDisplay);
  if (raw === null) return;
  const trimmed = raw.trim();
  if (!trimmed) return;
  if (INVALID_NAME_RE.test(trimmed)) {
    window.alert('Naam mag geen / \\ : * ? " < > | bevatten.');
    return;
  }
  const newName = isFile ? ensureMdExt(trimmed) : trimmed;
  if (newName === node.name) return;

  const touchesActive =
    activeFile && (activeFile.path === node.path || activeFile.path.startsWith(`${node.path}/`));
  if (touchesActive) await flushPendingSave();

  try {
    const newPath = await renameEntry(dirHandle, node.path, newName);
    await refreshTree();
    await reattachActiveAfterPathChange(node.path, newPath);
  } catch (err) {
    console.error(err);
    window.alert(`Hernoemen mislukt: ${(err as Error).message}`);
  }
}

async function handleDelete(node: TreeNode): Promise<void> {
  if (!dirHandle) return;
  const what =
    node.kind === "file"
      ? `"${stripMdExt(node.name)}"`
      : `de map "${node.name}" en alles erin`;
  if (!window.confirm(`${what} verwijderen?`)) return;

  const touchesActive =
    activeFile && (activeFile.path === node.path || activeFile.path.startsWith(`${node.path}/`));

  try {
    if (touchesActive && saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await deleteEntry(dirHandle, node.path);
    if (touchesActive) {
      clearActiveFileState();
      await storage.del(STORAGE_KEY_FILE);
    }
    await refreshTree();
  } catch (err) {
    console.error(err);
    window.alert(`Verwijderen mislukt: ${(err as Error).message}`);
  }
}

async function handleDropMove(sourcePath: string, destFolderPath: string): Promise<void> {
  if (!dirHandle) return;
  const srcParent = sourcePath.split("/").slice(0, -1).join("/");
  if (srcParent === destFolderPath) return;
  if (destFolderPath === sourcePath || destFolderPath.startsWith(`${sourcePath}/`)) {
    window.alert("Een map kan niet in zichzelf verplaatst worden");
    return;
  }

  const touchesActive =
    activeFile && (activeFile.path === sourcePath || activeFile.path.startsWith(`${sourcePath}/`));
  if (touchesActive) await flushPendingSave();

  try {
    const newPath = await moveEntry(dirHandle, sourcePath, destFolderPath);
    await refreshTree();
    if (destFolderPath) fileTree.expandToFile(newPath);
    await reattachActiveAfterPathChange(sourcePath, newPath);
  } catch (err) {
    console.error(err);
    window.alert(`Verplaatsen mislukt: ${(err as Error).message}`);
  }
}

const INBOX_FOLDER = "Inbox";
const MD_RE = /\.(md|markdown)$/i;
let dragDepth = 0;

function hasExternalFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes("Files") ?? false;
}

async function handleExternalDrop(files: FileList): Promise<void> {
  if (!dirHandle) {
    window.alert("Open eerst een werkmap voor je een bestand dropt.");
    return;
  }
  const mdFiles = Array.from(files).filter((f) => MD_RE.test(f.name));
  if (mdFiles.length === 0) {
    window.alert("Alleen .md/.markdown bestanden worden geïmporteerd.");
    return;
  }
  await flushPendingSave();
  let lastPath: string | null = null;
  try {
    for (const file of mdFiles) {
      lastPath = await importFile(dirHandle, INBOX_FOLDER, file);
    }
    await refreshTree();
    if (lastPath) {
      const opened = findFileByPath(tree, lastPath);
      if (opened) await openFile(opened);
    }
  } catch (err) {
    console.error(err);
    window.alert(`Importeren mislukt: ${(err as Error).message}`);
  }
}

mainEl.addEventListener(
  "dragenter",
  (e) => {
    if (!hasExternalFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth++;
    mainEl.classList.add("import-drag-over");
  },
  true,
);
mainEl.addEventListener(
  "dragover",
  (e) => {
    if (!hasExternalFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  },
  true,
);
mainEl.addEventListener(
  "dragleave",
  (e) => {
    if (!hasExternalFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) mainEl.classList.remove("import-drag-over");
  },
  true,
);
mainEl.addEventListener(
  "drop",
  (e) => {
    if (!hasExternalFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    mainEl.classList.remove("import-drag-over");
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) void handleExternalDrop(files);
  },
  true,
);

versionsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (versionsPopover.hidden) {
    void openVersionsPopover();
  } else {
    closeVersionsPopover();
  }
});

document.addEventListener("click", (e) => {
  if (versionsPopover.hidden) return;
  const target = e.target as Node;
  if (!versionsPopover.contains(target) && !versionsBtn.contains(target)) {
    closeVersionsPopover();
  }
});

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (settingsPopover.hidden) {
    openSettingsPopover();
  } else {
    closeSettingsPopover();
  }
});

document.addEventListener("click", (e) => {
  if (settingsPopover.hidden) return;
  const target = e.target as Node;
  if (!settingsPopover.contains(target) && !settingsBtn.contains(target)) {
    closeSettingsPopover();
  }
});

document.addEventListener("mousedown", (e) => {
  const menu = document.querySelector(".context-menu");
  if (menu && !menu.contains(e.target as Node)) closeContextMenu();
});
document.addEventListener("scroll", closeContextMenu, true);

openFolderBtn.addEventListener("click", () => {
  if (pendingReconnect) {
    const fn = pendingReconnect;
    pendingReconnect = null;
    void fn();
  } else {
    void handleOpenFolder();
  }
});
newFileBtn.addEventListener("click", () => void handleNewFile());
newFolderBtn.addEventListener("click", () => void handleNewFolder());
revealBtn.addEventListener("click", handleReveal);
collapseToggleBtn.addEventListener("click", handleCollapseToggle);
toggleSidebarBtn.addEventListener("click", toggleSidebar);
exportPdfBtn.addEventListener("click", () => {
  if (!activeFile) return;
  const title = stripMdExt(activeFile.name);
  void exportToPdf(editor.state.doc.toString(), title).catch((err) => {
    console.error(err);
    window.alert(`Export mislukt: ${(err as Error).message}`);
  });
});
exportDocxBtn.addEventListener("click", () => {
  if (!activeFile) return;
  const title = stripMdExt(activeFile.name);
  void exportToWord(editor.state.doc.toString(), title).catch((err) => {
    console.error(err);
    window.alert(`Export mislukt: ${(err as Error).message}`);
  });
});
downloadMdBtn.addEventListener("click", () => {
  if (!activeFile) return;
  const blob = new Blob([editor.state.doc.toString()], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ensureMdExt(activeFile.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
    e.preventDefault();
    toggleSidebar();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    void takeSnapshot("manual");
  } else if (
    /^Digit[1-9]$/.test(e.code) &&
    (IS_MAC
      ? e.metaKey && !e.ctrlKey && !e.altKey
      : e.altKey && !e.ctrlKey && !e.metaKey)
  ) {
    e.preventDefault();
    const slot = e.code.slice(5);
    if (e.shiftKey) void pinCurrentToSlot(slot);
    else void openPinnedSlot(slot);
  } else if (e.key === "Escape" && !versionsPopover.hidden) {
    closeVersionsPopover();
  } else if (e.key === "Escape" && !settingsPopover.hidden) {
    closeSettingsPopover();
  } else if (e.key === "Escape") {
    closeContextMenu();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (saveTimer !== null) {
    e.preventDefault();
    e.returnValue = "";
  }
});

document.title = `md-editor ${__APP_VERSION__}`;
renderBreadcrumbs();
updateWordCount("");
void tryRestoreLastFolder();

