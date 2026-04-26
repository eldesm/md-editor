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

const SNAPSHOT_RE = /^\.?(.+)\.bak\.(\d{8}-\d{6})$/;

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
): Promise<string> {
  const { parent, baseName } = await getParentDir(root, filePath);
  const backups = await getBackupsDir(parent, true);
  if (!backups) throw new Error("Could not create backups folder");
  const stamp = snapshotTimestamp(new Date());
  const snapshotName = `${baseName}.bak.${stamp}`;
  const handle = await backups.getFileHandle(snapshotName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return snapshotName;
}

export async function hasSnapshots(
  root: FileSystemDirectoryHandle,
  filePath: string,
): Promise<boolean> {
  const { parent, baseName } = await getParentDir(root, filePath);
  const backups = await getBackupsDir(parent, false);
  if (!backups) return false;
  for await (const [name] of backups.entries()) {
    const m = SNAPSHOT_RE.exec(name);
    if (m && m[1] === baseName) return true;
  }
  return false;
}

export type SnapshotInfo = { name: string; date: Date };

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
  for await (const [name] of backups.entries()) {
    const m = SNAPSHOT_RE.exec(name);
    if (m && m[1] === baseName) {
      out.push({ name, date: parseSnapshotStamp(m[2]) });
    }
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
  maxKeep: number,
): Promise<void> {
  const { parent, baseName } = await getParentDir(root, filePath);
  const backups = await getBackupsDir(parent, false);
  if (!backups) return;
  const matches: string[] = [];
  for await (const [name] of backups.entries()) {
    const m = SNAPSHOT_RE.exec(name);
    if (m && m[1] === baseName) matches.push(name);
  }
  if (matches.length <= maxKeep) return;
  matches.sort();
  const toRemove = matches.slice(0, matches.length - maxKeep);
  for (const name of toRemove) {
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
