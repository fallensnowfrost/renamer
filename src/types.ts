export type SortMode = "natural" | "modified" | "created";
export type Status = "ready" | "warning" | "unchanged";
export type RenameKind = "folder" | "file" | "text-cleanup";

export interface FolderStats {
  imageCount: number;
  videoCount: number;
  totalBytes: number;
  suffix: string;
}

export interface MediaFile {
  name: string;
  path: string;
  extension: string;
  kind: "image" | "video";
  size: number;
  modifiedTime: number;
  createdTime: number;
  targetName: string;
  targetPath: string;
  status: Status;
  warnings: string[];
}

export interface ScanGroup {
  id: string;
  path: string;
  parentPath: string;
  originalName: string;
  targetFolderName: string;
  targetFolderPath: string;
  theme: string;
  confidence: "high" | "low";
  themeWarnings: string[];
  folderStats: FolderStats;
  files: MediaFile[];
  depth: number;
  status: Status;
  warnings: string[];
}

export interface ScanResult {
  rootPath: string;
  personName: string;
  sortMode: SortMode;
  groups: ScanGroup[];
}

export interface RenameOperation {
  kind: RenameKind;
  from: string;
  to: string;
  label: string;
}

export interface RenameLog {
  createdAt: string;
  operations: RenameOperation[];
  skipped?: RenameSkip[];
}

export interface RenameSkip {
  operation: RenameOperation;
  reason: string;
}

export interface RenamerApi {
  selectFolder: () => Promise<string | null>;
  scan: (options: { rootPath: string; personName: string; sortMode: SortMode }) => Promise<ScanResult>;
  apply: (payload: { operations: RenameOperation[] }) => Promise<RenameLog>;
  undo: () => Promise<RenameLog>;
  exportLog: (payload: unknown) => Promise<string | null>;
  onProgress?: (callback: (progress: ProgressState) => void) => () => void;
}

export interface ProgressState {
  phase: "idle" | "scan" | "apply" | "complete" | "indeterminate";
  current: number;
  total: number;
  label: string;
}

declare global {
  interface Window {
    renamerApi?: RenamerApi;
  }
}
