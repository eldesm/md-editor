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

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  return await window.showDirectoryPicker({ mode: "readwrite" });
}

export async function loadTree(
  dir: FileSystemDirectoryHandle,
  basePath = "",
): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".")) continue;
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
