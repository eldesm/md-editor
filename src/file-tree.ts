import type { FileNode, TreeNode } from "./filesystem";

export type FileTreeOptions = {
  container: HTMLElement;
  onFileClick: (file: FileNode) => void;
  isActive: (file: FileNode) => boolean;
};

export class FileTree {
  private expanded = new Set<string>();
  private nodes: TreeNode[] = [];

  constructor(private opts: FileTreeOptions) {}

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

  refresh(): void {
    this.render();
  }

  private render(): void {
    this.opts.container.innerHTML = "";
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
    if (this.opts.isActive(node)) row.classList.add("active");

    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = node.name.replace(/\.(md|markdown)$/i, "");
    row.appendChild(label);

    row.addEventListener("click", () => this.opts.onFileClick(node));

    return row;
  }
}
