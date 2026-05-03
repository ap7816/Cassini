export type SectionType = 'new' | 'fix' | 'perf' | 'change';

export interface ChangeSection {
  type: SectionType;
  items: string[];
}

export interface ChangeEntry {
  version: string;
  date: string; // 'YYYY-MM-DD'
  sections: ChangeSection[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    version: '1.1.0',
    date: '2026-05-03',
    sections: [
      {
        type: 'new',
        items: [
          'Métadonnées audio : titre, artiste, album et durée lus directement depuis les fichiers (MP3, FLAC, WAV, OGG, M4A, Opus)',
          'Pochettes d\'album style YouTube Music — image plein format sur la carte, texte en dessous, durée incrustée',
          'Ombres de texte renforcées sur les pochettes claires pour une lisibilité optimale',
          'Support complet du format .opus',
          'Notes de mise à jour à chaque nouvelle version (vous lisez la première !)',
        ],
      },
      {
        type: 'perf',
        items: [
          'Chargement en lot côté Rust (rayon) — toutes les métadonnées lues en parallèle en une seule requête IPC',
          'Pochettes chargées à la demande via IntersectionObserver (marge 200 px) — plus aucun blocage de l\'interface',
          'Limiteur de concurrence : 4 appels simultanés maximum pour les pochettes',
          'Barre de progression pendant l\'analyse des métadonnées',
          'Cache de session 300 entrées (éviction FIFO) pour éviter les re-lectures',
        ],
      },
      {
        type: 'fix',
        items: [
          'Erreurs TypeScript pré-existantes corrigées (CI stabilisé)',
          'Chaîne de probe lofty corrigée (incompatibilité LoftyError / io::Error)',
        ],
      },
    ],
  },
  {
    version: '1.0.51',
    date: '2026-04-15',
    sections: [
      {
        type: 'new',
        items: [
          'Dialogs intégrés (prompt, confirm) remplaçant les alertes natives du navigateur',
          'Système de toasts pour les notifications et retours d\'action',
          'Bannière de mise à jour en bas d\'écran avec progression du téléchargement',
          'Mini-player persistant avec pochette, artiste et contrôle du volume',
          'Dossiers de musique : couleur personnalisable via clic droit',
          'Glisser-déposer de pistes entre dossiers',
        ],
      },
      {
        type: 'change',
        items: [
          'Cache des durées de pistes survit aux navigations entre pages',
          'Tri des pistes par nom, durée ou extension avec direction configurable',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-01',
    sections: [
      {
        type: 'new',
        items: [
          'Bibliothèque de jeux avec scan automatique Steam, Epic Games et Battle.net',
          'Lecteur de musique intégré avec navigation par arborescence de dossiers',
          'Détection automatique des lanceurs installés',
          'Image de fond personnalisable et couleur d\'accent',
          'Lancement automatique au démarrage de Windows',
          'Mode arrière-plan (barre des tâches) lors de la fermeture',
          'Support multilingue : Français / English',
        ],
      },
    ],
  },
];
