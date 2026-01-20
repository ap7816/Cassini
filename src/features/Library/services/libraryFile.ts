import type { Game } from "../../types";
import { normalizeGames } from "./libraryStorage";

type ExportPayload = {
  version: 1;
  exportedAt: string;
  games: Game[];
};

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI__);
}

function getTauriApis() {
  const w = window as any;
  return {
    dialog: w.__TAURI__?.dialog,
    fs: w.__TAURI__?.fs,
  };
}

export async function exportLibraryToFile(games: Game[]): Promise<void> {
  const payload: ExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    games,
  };

  const json = JSON.stringify(payload, null, 2);

  if (isTauri()) {
    const { dialog, fs } = getTauriApis();
    if (!dialog?.save || !fs?.writeTextFile) {
      throw new Error("Tauri dialog/fs APIs not available.");
    }

    const path = await dialog.save({
      defaultPath: "arctive-library.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!path) return; // user cancelled

    await fs.writeTextFile(path, json);
    return;
  }

  // Browser fallback: download
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "arctive-library.json";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export async function importLibraryFromFile(): Promise<Game[]> {
  if (isTauri()) {
    const { dialog, fs } = getTauriApis();
    if (!dialog?.open || !fs?.readTextFile) {
      throw new Error("Tauri dialog/fs APIs not available.");
    }

    const path = await dialog.open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!path || typeof path !== "string") return [];

    const txt = await fs.readTextFile(path);
    return parseImport(txt);
  }

  // Browser fallback: file picker
  const file = await pickJsonFileInBrowser();
  if (!file) return [];

  const txt = await file.text();
  return parseImport(txt);
}

function parseImport(txt: string): Game[] {
  try {
    const parsed = JSON.parse(txt);

    // support: soit {games: [...]}, soit directement [...]
    const gamesRaw = (parsed && typeof parsed === "object" && "games" in parsed)
      ? (parsed as any).games
      : parsed;

    return normalizeGames(gamesRaw);
  } catch {
    throw new Error("Invalid JSON file.");
  }
}

function pickJsonFileInBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
