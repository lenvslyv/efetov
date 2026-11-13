export interface StoredFile {
  name: string;
  folder: string;
  author: string;
  date: string;
  comment: string;
}

export interface FileTreeNode {
  files: StoredFile[];
  folders: Record<string, FileTreeNode>;
}

export function normalizeFolder(path: string): string {
  return path.split("/").map(part => part.trim()).filter(Boolean).join(" / ");
}

export function listFolders(files: StoredFile[], extra: string[] = []): string[] {
  const paths = new Set<string>();
  const add = (path: string) => {
    const acc: string[] = [];
    path
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        acc.push(part);
        paths.add(acc.join(" / "));
      });
  };
  extra.forEach(add);
  files.forEach((file) => add(file.folder));
  return [...paths].sort((left, right) => left.localeCompare(right, "ru"));
}

export function groupFiles(files: StoredFile[], folders: string[] = []): FileTreeNode {
  const root: FileTreeNode = { files: [], folders: {} };
  const ensure = (path: string) => {
    let node = root;
    path
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        node.folders[part] = node.folders[part] || { files: [], folders: {} };
        node = node.folders[part];
      });
    return node;
  };
  folders.forEach((path) => ensure(path));
  files.forEach((file) => {
    ensure(file.folder).files.push(file);
  });
  return root;
}
