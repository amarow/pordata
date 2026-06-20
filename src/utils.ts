import { invoke } from "@tauri-apps/api/core";

export function openFolder(path: string) {
  invoke("open_in_file_manager", { path }).catch(() => {});
}
