export interface UpdateInfo {
  hasUpdate: boolean;
  currentCommit?: string;
  latestCommit?: string;
  commits?: { sha: string; message: string; date: string }[];
  error?: string;
}

export interface ApplyResult {
  success: boolean;
  message: string;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const res = await fetch("/api/updater/check");
  if (!res.ok) {
    return { hasUpdate: false };
  }
  return res.json();
}

export async function applyUpdate(): Promise<ApplyResult> {
  const res = await fetch("/api/updater/apply", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { success: false, message: data.message || "Update failed" };
  }
  return res.json();
}
