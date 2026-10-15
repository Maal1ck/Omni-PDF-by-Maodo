export type ToolCategory = 'all' | 'organize' | 'to-pdf' | 'from-pdf' | 'edit-security';

export type ToolId =
  | 'merge'
  | 'split'
  | 'organize'
  | 'compress'
  | 'rotate'
  | 'jpg-to-pdf'
  | 'word-to-pdf'
  | 'excel-to-pdf'
  | 'text-to-pdf'
  | 'pdf-to-jpg'
  | 'pdf-to-word'
  | 'pdf-to-excel'
  | 'pdf-to-text'
  | 'watermark'
  | 'page-numbers';

export interface ToolDefinition {
  id: ToolId;
  title: string;
  shortDesc: string;
  category: ToolCategory;
  acceptTypes: string;
  acceptLabel: string;
  multiple: boolean;
  badge?: string;
  color: string;
  iconName: string;
}

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  pageCount?: number;
  previewUrl?: string;
  dataUrl?: string;
}

export interface PageThumb {
  pageNumber: number; // display order in current page stream
  sourceFileIndex?: number;
  sourcePageNumber?: number;
  sourceFileName?: string;
  thumbnailUrl: string;
  rotation: number; // 0, 90, 180, 270
  isDeleted?: boolean;
}

export interface ProcessResult {
  fileName: string;
  blob: Blob;
  downloadUrl: string;
  size: number;
  itemCount?: number;
  details?: string;
}

export interface ProcessHistoryItem {
  id: string;
  toolId: ToolId;
  toolTitle: string;
  fileName: string;
  size: number;
  downloadUrl: string;
  timestamp: number;
}
