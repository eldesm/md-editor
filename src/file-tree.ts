import { stripMdExt, type FileNode, type TreeNode } from "./filesystem";

export type FileTreeOptions = {
  container: HTMLElement;
  onFileClick: (file: FileNode) => void;
  isActive: (file: FileNode) => boolean;
  onContextMenu?: (node: TreeNode, event: MouseEvent) => void;
  onDropMove?: (sourcePath: string, destFolderPath: string) => void;
};

const DRAG_TYPE = "application/x-md-path";

export class FileTree {
  private expanded = new Set<string>();
  private nodes: TreeNode[] = [];

  constructor(private opts: FileTreeOptions) {
    this.attachContainerDropHandlers();
    document.addEventListener("dragend", () => this.clearDragVisuals());
  }

  private clearDragVisuals(): void {
    const c = this.opts.container;
    c.classList.remove("drag-over-root");
    c.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    c.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  }

  private attachContainerDropHandlers(): void {
    const c = this.opts.container;
    c.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    c.addEventListener("dragenter", (e) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
      if ((e.target as HTMLElement)?.closest?.(".tree-row")) return;
      c.classList.add("drag-over-root");
    });
    c.addEventListener("dragleave", (e) => {
      if (!c.contains(e.relatedTarget as Node | null)) {
        c.classList.remove("drag-over-root");
      }
    });
    c.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      c.classList.remove("drag-over-root");
      const sourcePath = e.dataTransfer.getData(DRAG_TYPE);
      if (sourcePath) this.opts.onDropMove?.(sourcePath, "");
    });
  }

  setNodes(nodes: TreeNode[]): void {
    this.nodes = nodes;
    this.render();
  }

  expandToFile(filePath: string): void {
    const parts = filePath.split("/");
    parts.pop();
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      this.expanded.add(cur);
    }
    this.render();
  }

  revealFile(filePath: string): void {
    this.expandToFile(filePath);
    const row = this.opts.container.querySelector<HTMLElement>(
      `[data-path="${CSS.escape(filePath)}"]`,
    );
    if (row) row.scrollIntoView({ block: "nearest" });
  }

  collapseAll(): void {
    this.expanded.clear();
    this.render();
  }

  expandAll(): void {
    const collect = (nodes: TreeNode[]): void => {
      for (const n of nodes) {
        if (n.kind === "folder") {
          this.expanded.add(n.path);
          collect(n.children);
        }
      }
    };
    collect(this.nodes);
    this.render();
  }

  hasAnyExpanded(): boolean {
    return this.expanded.size > 0;
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.opts.container.replaceChildren();
    if (this.nodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      empty.textContent = "Geen markdown-bestanden gevonden";
      this.opts.container.appendChild(empty);
      return;
    }
    for (const node of this.nodes) {
      this.opts.container.appendChild(this.renderNode(node, 0));
    }
  }

  private renderNode(node: TreeNode, depth: number): HTMLElement {
    if (node.kind === "folder") return this.renderFolder(node, depth);
    return this.renderFile(node, depth);
  }

  private renderFolder(node: TreeNode & { kind: "folder" }, depth: number): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "tree-folder";

    const row = document.createElement("div");
    row.className = "tree-row tree-folder-row";
    row.style.paddingLeft = `${depth * 14 + 6}px`;
    row.dataset.path = node.path;
    row.draggable = true;

    const isOpen = this.expanded.has(node.path);

    const chevron = document.createElement("span");
    chevron.className = "tree-chevron";
    chevron.innerHTML = isOpen
      ? `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3l3 4 3-4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    row.appendChild(chevron);

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = node.name;
    row.appendChild(label);

    row.addEventListener("click", () => {
      if (this.expanded.has(node.path)) this.expanded.delete(node.path);
      else this.expanded.add(node.path);
      this.render();
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.opts.onContextMenu?.(node, e);
    });
    this.attachDragSource(row, node.path);
    this.attachDropTarget(row, node.path);

    wrap.appendChild(row);

    if (isOpen) {
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "tree-children";
      for (const child of node.children) {
        childrenWrap.appendChild(this.renderNode(child, depth + 1));
      }
      wrap.appendChild(childrenWrap);
    }

    return wrap;
  }

  private renderFile(node: FileNode, depth: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "tree-row tree-file-row";
    row.style.paddingLeft = `${depth * 14 + 22}px`;
    row.dataset.path = node.path;
    row.draggable = true;
    if (this.opts.isActive(node)) row.classList.add("active");

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = stripMdExt(node.name);
    row.appendChild(label);

    row.addEventListener("click", () => this.opts.onFileClick(node));
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.opts.onContextMenu?.(node, e);
    });
    this.attachDragSource(row, node.path);

    const parentPath = node.path.split("/").slice(0, -1).join("/");
    this.attachDropTarget(row, parentPath);

    return row;
  }

  private attachDragSource(row: HTMLElement, path: string): void {
    row.addEventListener("dragstart", (e) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData(DRAG_TYPE, path);
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
    });
  }

  private attachDropTarget(row: HTMLElement, destFolderPath: string): void {
    row.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("dragenter", (e) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", (e) => {
      if (!row.contains(e.relatedTarget as Node | null)) {
        row.classList.remove("drag-over");
      }
    });
    row.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove("drag-over");
      const sourcePath = e.dataTransfer.getData(DRAG_TYPE);
      if (sourcePath) this.opts.onDropMove?.(sourcePath, destFolderPath);
    });
  }
}
