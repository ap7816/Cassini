import { useEffect, useMemo, useState } from "react";
import type { Game } from "../types";
import { sampleGames } from "../data/sampleGames";
import { loadGamesFromStorage, saveGamesToStorage } from "../services/libraryStorage";
import { exportLibraryToFile, importLibraryFromFile } from "../services/libraryFile";

export function useLibraryGames() {
  // 1) STATE: source de vérité de ta Library (ce que l'UI affiche)
  const [games, setGames] = useState<Game[]>([]);

  // 2) INIT: au 1er rendu seulement, on charge la sauvegarde locale
  // [] = "exécute une seule fois"
  useEffect(() => {
    const storedGames = loadGamesFromStorage();
    setGames(storedGames);
  }, []);

  // 3) AUTO-SAVE: dès que games change, on sauvegarde automatiquement
  // [games] = "re-exécute quand games change"
  useEffect(() => {
    saveGamesToStorage(games);
  }, [games]);

  // 4) DERIVED STATE: infos calculées depuis games (pas stockées en state)
  const isEmpty = games.length === 0;

  const installedCount = useMemo(() => {
    // useMemo évite de recalculer inutilement si games ne change pas
    return games.filter((g) => g.installed).length;
  }, [games]);

  // 5) ACTIONS: seules fonctions qui modifient games (donc l'UI)
  function loadSamples() {
    setGames(sampleGames);
  }


  function toggleInstalled(id: string) {
    setGames((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;

        const nextInstalled = !Boolean(g.installed);

        return {
          ...g,
          installed: nextInstalled,
          launchUrl: nextInstalled ? g.launchUrl : null,
        };
      })
    );
  }

  function clearLibrary() {
    setGames([]);
  }

  function removeGame(id: string) {
    // important: on ne modifie pas "games" directement
    // on crée une nouvelle liste (immutabilité)
    setGames((prev) => prev.filter((g) => g.id !== id));
  }

  // 6) EXPORT/IMPORT: lire/écrire un fichier JSON
  async function exportToFile() {
    // export = on prend games (state) -> fichier JSON
    await exportLibraryToFile(games);
  }

  async function importFromFile() {
    // import = fichier JSON -> array de Game (déjà normalisé dans importLibraryFromFile)
    const importedGames = await importLibraryFromFile();
    if (importedGames.length === 0) return;

    // on remplace la library par le contenu importé
    setGames(importedGames);
  }

  return {
    games,
    isEmpty,
    installedCount,
    loadSamples,
    clearLibrary,
    removeGame,
    toggleInstalled,
    exportToFile,
    importFromFile,
  };
}
