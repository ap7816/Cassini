export type PickedGameFile =
  | { ok: true; path: string }
  | { ok: false; reason: "CANCELLED" | "NOT_TAURI" | "NO_DIALOG_API"; message: string };

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI__);
}

export async function pickGameFile(): Promise<PickedGameFile> {
  if (!isTauri()) {
    return {
      ok: false,
      reason: "NOT_TAURI",
      message: "File picker for .exe/.lnk is only available in the desktop app (Tauri).",
    };
  }

  const w = window as any;
  const dialog = w.__TAURI__?.dialog;

  if (!dialog?.open) {
    return {
      ok: false,
      reason: "NO_DIALOG_API",
      message: "Tauri dialog API is not available (check tauri allowlist/config).",
    };
  }

  const path = await dialog.open({
    multiple: false,
    filters: [{ name: "Executable or Shortcut", extensions: ["exe", "lnk"] }],
  });

  if (!path || typeof path !== "string") {
    return { ok: false, reason: "CANCELLED", message: "User cancelled." };
  }

  return { ok: true, path };
}
