import { open } from "@tauri-apps/plugin-dialog";

export type PickedGameFile =
  | { ok: true; path: string }
  | { ok: false; reason: "CANCELLED" | "NOT_AVAILABLE"; message: string };

export async function pickGameFile(): Promise<PickedGameFile> {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Executable or Shortcut", extensions: ["exe", "lnk"] }],
    });

    if (!selected || Array.isArray(selected)) {
      return { ok: false, reason: "CANCELLED", message: "User cancelled." };
    }

    return { ok: true, path: selected };
  } catch {
    return {
      ok: false,
      reason: "NOT_AVAILABLE",
      message: "Dialog plugin not available. Did you add/enable the dialog plugin?",
    };
  }
}
