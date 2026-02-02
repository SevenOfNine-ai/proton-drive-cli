import { Node, NodeType } from '../types/drive';

/**
 * Check if node is a folder
 */
export function isFolder(node: Node): boolean {
  return node.type === NodeType.FOLDER;
}

/**
 * Check if node is a file
 */
export function isFile(node: Node): boolean {
  return node.type === NodeType.FILE;
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format timestamp for display
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Validate path string
 */
export function validatePath(path: string): boolean {
  // Path should not contain special characters except / - _ . and space
  return /^[a-zA-Z0-9/\-_. ]*$/.test(path);
}

/**
 * Get icon for node type
 */
export function getNodeIcon(node: Node): string {
  return node.type === NodeType.FOLDER ? '📁' : '📄';
}

/**
 * Get file extension from name
 */
export function getExtension(name: string): string {
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1 || lastDot === name.length - 1) {
    return '';
  }
  return name.substring(lastDot + 1).toLowerCase();
}

/**
 * Check if path is absolute
 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/');
}

/**
 * Join path components
 */
export function joinPath(...parts: string[]): string {
  return (
    '/' +
    parts
      .join('/')
      .split('/')
      .filter((p) => p.length > 0)
      .join('/')
  );
}

/**
 * Get directory name from path
 */
export function dirname(path: string): string {
  const parts = path.split('/').filter((p) => p.length > 0);
  if (parts.length <= 1) {
    return '/';
  }
  return '/' + parts.slice(0, -1).join('/');
}

/**
 * Get base name from path
 */
export function basename(path: string): string {
  const parts = path.split('/').filter((p) => p.length > 0);
  if (parts.length === 0) {
    return '';
  }
  return parts[parts.length - 1];
}
