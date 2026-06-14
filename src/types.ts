export interface SyncJob {
  id: string;
  local_path: string;
  usb_subfolder: string;
  usb_uuid: string;
}

export interface DeviceInfo {
  uuid: string;
  mount_path: string;
}

export type SyncOperation =
  | { CopyToUsb: { rel_path: string } }
  | { CopyToLocal: { rel_path: string } }
  | { DeleteOnUsb: { rel_path: string } }
  | { DeleteOnLocal: { rel_path: string } }
  | {
      Conflict: {
        rel_path: string;
        local_mtime: number;
        local_size: number;
        usb_mtime: number;
        usb_size: number;
      };
    }
  | { UpToDate: { rel_path: string } };

export interface SyncSummary {
  copy_to_usb: number;
  copy_to_local: number;
  delete: number;
  conflicts: number;
  up_to_date: number;
  operations: SyncOperation[];
}

export interface PreScanResult {
  job_id: string;
  local_path: string;
  usb_mount_path: string;
  usb_subfolder: string;
  summary: SyncSummary;
}

export interface ConflictInfo {
  rel_path: string;
  local_mtime: number;
  local_size: number;
  usb_mtime: number;
  usb_size: number;
}

export type Resolution = 'KeepLocal' | 'KeepUsb' | 'Skip';

export interface ConflictResolutionInput {
  rel_path: string;
  resolution: Resolution;
}

export type View = 'dashboard' | 'new-job' | 'sync-preview' | 'conflict';
