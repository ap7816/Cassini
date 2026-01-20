import type { Game } from "../../types";

export const sampleGames: Game[] = [
  {
    id: "steam-322170",
    title: "Geometry Dash",
    platform: "Steam",
    installed: true,
    lastPlayedAt: "2026-01-10T18:20:00.000Z",
    launchUrl: "steam://rungameid/322170",
  },
  {
    id: "steam-620980",
    title: "Beat Saber",
    platform: "Steam",
    installed: true,
    lastPlayedAt: null,
    launchUrl: "steam://rungameid/620980",
  },
  {
    id: "epic-fortnite",
    title: "Fortnite",
    platform: "Epic",
    installed: true,
    lastPlayedAt: null,
    launchUrl: "com.epicgames.launcher://apps/Fortnite?action=launch&silent=true",
  },
];
