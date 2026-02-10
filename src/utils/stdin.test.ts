import { extractFilenameFromPath, getParentPath } from './stdin';

describe('extractFilenameFromPath', () => {
  it('extracts filename from path', () => {
    expect(extractFilenameFromPath('/a/b.txt')).toBe('b.txt');
  });

  it('returns null for directory path (trailing slash)', () => {
    expect(extractFilenameFromPath('/a/')).toBeNull();
  });

  it('returns null for root path', () => {
    expect(extractFilenameFromPath('/')).toBeNull();
  });

  it('extracts filename with nested path', () => {
    expect(extractFilenameFromPath('/Documents/Projects/report.pdf')).toBe('report.pdf');
  });

  it('returns null for path without extension and no trailing slash', () => {
    // The function checks for a dot in the last part to determine if it's a filename
    expect(extractFilenameFromPath('/Documents/folder')).toBeNull();
  });
});

describe('getParentPath', () => {
  it('gets parent from file path', () => {
    expect(getParentPath('/a/b.txt')).toBe('/a');
  });

  it('returns path as-is for directory (trailing slash)', () => {
    expect(getParentPath('/a/')).toBe('/a');
  });

  it('returns root for root-level file', () => {
    expect(getParentPath('/b.txt')).toBe('/');
  });

  it('handles nested directory path', () => {
    expect(getParentPath('/Documents/Projects/')).toBe('/Documents/Projects');
  });
});
