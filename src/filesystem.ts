export type FileNode = {
  kind: "file";
  name: string;
  handle: FileSystemFileHandle;
  path: string;
};

export type FolderNode = {
  kind: "folder";
  name: string;
  handle: FileSystemDirectoryHandle;
  path: string;
  children: TreeNode[];
};

export type TreeNode = FileNode | FolderNode;

const MARKDOWN_RE = /\.(md|markdown)$/i;
const BACKUPS_DIR = "_backups";

export function stripMdExt(name: string): string {
  return name.replace(MARKDOWN_RE, "");
}

export function ensureMdExt(name: string): string {
  return MARKDOWN_RE.test(name) ? name : `${name}.md`;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  return await window.showDirectoryPicker({ mode: "readwrite" });
}

export async function loadTree(
  dir: FileSystemDirectoryHandle,
  basePath = "",
): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".") || name === BACKUPS_DIR) continue;
    const path = basePath ? `${basePath}/${name}` : name;
    if (handle.kind === "directory") {
      const children = await loadTree(handle as FileSystemDirectoryHandle, path);
      nodes.push({
        kind: "folder",
        name,
        handle: handle as FileSystemDirectoryHandle,
        path,
        children,
      });
    } else if (handle.kind === "file" && MARKDOWN_RE.test(name)) {
      nodes.push({
        kind: "file",
        name,
        handle: handle as FileSystemFileHandle,
        path,
      });
    }
  }
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

export async function readFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return await file.text();
}

export async function writeFile(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function createFile(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle> {
  return await dir.getFileHandle(name, { create: true });
}

export async function createFolder(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return await dir.getDirectoryHandle(name, { create: true });
}

async function getParentDir(
  root: FileSystemDirectoryHandle,
  filePath: string,
): Promise<{ parent: FileSystemDirectoryHandle; baseName: string }> {
  const parts = filePath.split("/");
  const baseName = parts.pop();
  if (!baseName) throw new Error("Invalid path");
  let parent = root;
  for (const segment of parts) {
    parent = await parent.getDirectoryHandle(segment);
  }
  return { parent, baseName };
}

function snapshotTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export type SnapshotKind = "char" | "idle" | "manual";

const KIND_TO_TAG: Record<SnapshotKind, string> = {
  char: "c",
  idle: "i",
  manual: "m",
};

const TAG_TO_KIND: Record<string, SnapshotKind> = {
  c: "char",
  i: "idle",
  m: "manual",
};

const SNAPSHOT_RE = /^\.?(.+)\.bak\.(\d{8}-\d{6})(?:\.([cim]))?$/;

async function getBackupsDir(
  parent: FileSystemDirectoryHandle,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(BACKUPS_DIR, { create });
  } catch (err) {
    if ((err as DOMException).name === "NotFoundError") return null;
    throw err;
  }
}

export async function writeSnapshot(
  root: FileSystemDirectoryHandle,
  filePath: string,
  content: string,
  kind: SnapshotKind,
): Promise<string> {
  const { parent, baseName } = await getParentDir(root, filePath);
  const backups = await getBackupsDir(parent, true);
  if (!backups) throw new Error("Could not create backups folder");
  const stamp = snapshotTimestamp(new Date());
  const snapshotName = `${baseName}.bak.${stamp}.${KIND_TO_TAG[kind]}`;
  const handle = await backups.getFileHandle(snapshotName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return snapshotName;
}

async function* iterateSnapshotEntries(
  backups: FileSystemDirectoryHandle,
  baseName: string,
): AsyncGenerator<{ name: string; stamp: string; kind: SnapshotKind }> {
  for await (const [name] of backups.entries()) {
    const m = SNAPSHOT_RE.exec(name);
    if (m && m[1] === baseName) {
      const kind = m[3] ? TAG_TO_KIND[m[3]] : "manual";
      yield { name, stamp: m[2], kind };
    }
  }
}

export async function hasSnapshots(
  root: FileSystemDirectoryHandle,
  filePath: string,
): Promise<boolean> {
  const { parent, baseName } = await getParentDir(root, filePath);
  const backups = await getBackupsDir(parent, false);
  if (!backups) return false;
  for await (const _ of iterateSnapshotEntries(backups, baseName)) return true;
  return false;
}

export type SnapshotInfo = { name: string; date: Date; kind: SnapshotKind };

function parseSnapshotStamp(stamp: string): Date {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return new Date(0);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

export async function listSnapshots(
  root: FileSystemDirectoryHandle,
  filePath: string,
): Promise<SnapshotInfo[]> {
  const { parent, baseName } = await getParentDir(root, filePath);
  const backups = await getBackupsDir(parent, false);
  if (!backups) return [];
  const out: SnapshotInfo[] = [];
  for await (const { name, stamp, kind } of iterateSnapshotEntries(backups, baseName)) {
    out.push({ name, date: parseSnapshotStamp(stamp), kind });
  }
  out.sort((a, b) => b.date.getTime() - a.date.getTime());
  return out;
}

export async function readSnapshot(
  root: FileSystemDirectoryHandle,
  filePath: string,
  snapshotName: string,
): Promise<string> {
  const { parent } = await getParentDir(root, filePath);
  const backups = await getBackupsDir(parent, false);
  if (!backups) throw new Error("No backups folder");
  const handle = await backups.getFileHandle(snapshotName);
  const file = await handle.getFile();
  return await file.text();
}

export async function pruneSnapshots(
  root: FileSystemDirectoryHandle,
  filePath: string,
  kind: SnapshotKind,
  maxKeep: number,
): Promise<void> {
  const { parent, baseName } = await getParentDir(root, filePath);
  const backups = await getBackupsDir(parent, false);
  if (!backups) return;
  const matches: { name: string; stamp: string }[] = [];
  for await (const entry of iterateSnapshotEntries(backups, baseName)) {
    if (entry.kind === kind) matches.push({ name: entry.name, stamp: entry.stamp });
  }
  if (matches.length <= maxKeep) return;
  matches.sort((a, b) => a.stamp.localeCompare(b.stamp));
  const toRemove = matches.slice(0, matches.length - maxKeep);
  for (const { name } of toRemove) {
    await backups.removeEntry(name);
  }
}

export async function renameFile(
  root: FileSystemDirectoryHandle,
  filePath: string,
  newName: string,
): Promise<{ handle: FileSystemFileHandle; path: string }> {
  const parts = filePath.split("/");
  const oldName = parts.pop();
  if (!oldName) throw new Error("Invalid path");

  let parent = root;
  for (const segment of parts) {
    parent = await parent.getDirectoryHandle(segment);
  }

  if (newName === oldName) {
    const handle = await parent.getFileHandle(oldName);
    return { handle, path: filePath };
  }

  // Refuse if the target already exists
  try {
    await parent.getFileHandle(newName);
    throw new Error(`A file named "${newName}" already exists in this folder`);
  } catch (err) {
    if ((err as DOMException).name !== "NotFoundError") throw err;
  }

  const oldHandle = await parent.getFileHandle(oldName);
  const file = await oldHandle.getFile();
  const content = await file.text();

  const newHandle = await parent.getFileHandle(newName, { create: true });
  const writable = await newHandle.createWritable();
  await writable.write(content);
  await writable.close();

  await parent.removeEntry(oldName);

  const newPath = parts.length ? `${parts.join("/")}/${newName}` : newName;
  return { handle: newHandle, path: newPath };
}

async function entryExists(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (err) {
    const errName = (err as DOMException).name;
    if (errName === "TypeMismatchError") return true;
    if (errName !== "NotFoundError") throw err;
  }
  try {
    await dir.getDirectoryHandle(name);
    return true;
  } catch (err) {
    if ((err as DOMException).name !== "NotFoundError") throw err;
  }
  return false;
}

async function getEntry(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<{ handle: FileSystemFileHandle | FileSystemDirectoryHandle; isFile: boolean }> {
  try {
    return { handle: await dir.getFileHandle(name), isFile: true };
  } catch (err) {
    const errName = (err as DOMException).name;
    if (errName !== "NotFoundError" && errName !== "TypeMismatchError") throw err;
  }
  return { handle: await dir.getDirectoryHandle(name), isFile: false };
}

async function copyDirectoryRecursive(
  src: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, h] of src.entries()) {
    if (h.kind === "file") {
      const file = await (h as FileSystemFileHandle).getFile();
      const newHandle = await dest.getFileHandle(name, { create: true });
      const w = await newHandle.createWritable();
      await w.write(file);
      await w.close();
    } else {
      const newSub = await dest.getDirectoryHandle(name, { create: true });
      await copyDirectoryRecursive(h as FileSystemDirectoryHandle, newSub);
    }
  }
}

function splitStemExt(name: string, isFile: boolean): { stem: string; ext: string } {
  if (!isFile) return { stem: name, ext: "" };
  const m = /^(.+)(\.[^.]+)$/.exec(name);
  if (m) return { stem: m[1], ext: m[2] };
  return { stem: name, ext: "" };
}

async function findUniqueName(
  parent: FileSystemDirectoryHandle,
  baseName: string,
  isFile: boolean,
): Promise<string> {
  const { stem, ext } = splitStemExt(baseName, isFile);
  let candidate = `${stem} (kopie)${ext}`;
  let n = 2;
  while (await entryExists(parent, candidate)) {
    candidate = `${stem} (kopie ${n})${ext}`;
    n++;
  }
  return candidate;
}

export async function duplicateEntry(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<string> {
  const { parent, baseName } = await getParentDir(root, path);
  const { handle, isFile } = await getEntry(parent, baseName);
  const newName = await findUniqueName(parent, baseName, isFile);
  if (isFile) {
    const file = await (handle as FileSystemFileHandle).getFile();
    const newHandle = await parent.getFileHandle(newName, { create: true });
    const w = await newHandle.createWritable();
    await w.write(file);
    await w.close();
  } else {
    const newDir = await parent.getDirectoryHandle(newName, { create: true });
    await copyDirectoryRecursive(handle as FileSystemDirectoryHandle, newDir);
  }
  const parentPath = path.split("/").slice(0, -1).join("/");
  return parentPath ? `${parentPath}/${newName}` : newName;
}

export async function renameEntry(
  root: FileSystemDirectoryHandle,
  path: string,
  newName: string,
): Promise<string> {
  const { parent, baseName } = await getParentDir(root, path);
  if (newName === baseName) return path;
  if (await entryExists(parent, newName)) {
    throw new Error(`"${newName}" bestaat al in deze folder`);
  }
  const { handle, isFile } = await getEntry(parent, baseName);
  if (isFile) {
    const file = await (handle as FileSystemFileHandle).getFile();
    const newHandle = await parent.getFileHandle(newName, { create: true });
    const w = await newHandle.createWritable();
    await w.write(file);
    await w.close();
    await parent.removeEntry(baseName);
  } else {
    const newDir = await parent.getDirectoryHandle(newName, { create: true });
    await copyDirectoryRecursive(handle as FileSystemDirectoryHandle, newDir);
    await parent.removeEntry(baseName, { recursive: true });
  }
  const parentPath = path.split("/").slice(0, -1).join("/");
  return parentPath ? `${parentPath}/${newName}` : newName;
}

export async function deleteEntry(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  const { parent, baseName } = await getParentDir(root, path);
  await parent.removeEntry(baseName, { recursive: true });
}

async function resolveFolderHandle(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle> {
  if (!path) return root;
  let current = root;
  for (const segment of path.split("/")) {
    current = await current.getDirectoryHandle(segment);
  }
  return current;
}

export async function importFile(
  root: FileSystemDirectoryHandle,
  folderName: string,
  file: File,
): Promise<string> {
  const folder = await root.getDirectoryHandle(folderName, { create: true });
  const baseName = file.name;
  const finalName = (await entryExists(folder, baseName))
    ? await findUniqueName(folder, baseName, true)
    : baseName;
  const handle = await folder.getFileHandle(finalName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
  return `${folderName}/${finalName}`;
}

export async function moveEntry(
  root: FileSystemDirectoryHandle,
  srcPath: string,
  destFolderPath: string,
): Promise<string> {
  const srcParts = srcPath.split("/");
  const baseName = srcParts.pop();
  if (!baseName) throw new Error("Invalid path");
  const srcParentPath = srcParts.join("/");

  if (srcParentPath === destFolderPath) return srcPath;
  if (destFolderPath === srcPath || destFolderPath.startsWith(`${srcPath}/`)) {
    throw new Error("Een map kan niet in zichzelf verplaatst worden");
  }

  const srcParent = await resolveFolderHandle(root, srcParentPath);
  const destParent = await resolveFolderHandle(root, destFolderPath);

  if (await entryExists(destParent, baseName)) {
    throw new Error(`"${baseName}" bestaat al in de doelmap`);
  }

  const { handle, isFile } = await getEntry(srcParent, baseName);
  if (isFile) {
    const file = await (handle as FileSystemFileHandle).getFile();
    const newHandle = await destParent.getFileHandle(baseName, { create: true });
    const w = await newHandle.createWritable();
    await w.write(file);
    await w.close();
    await srcParent.removeEntry(baseName);
  } else {
    const newDir = await destParent.getDirectoryHandle(baseName, { create: true });
    await copyDirectoryRecursive(handle as FileSystemDirectoryHandle, newDir);
    await srcParent.removeEntry(baseName, { recursive: true });
  }

  return destFolderPath ? `${destFolderPath}/${baseName}` : baseName;
}
