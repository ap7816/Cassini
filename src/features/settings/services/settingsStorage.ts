import type { AppSettings } from '../../types';
import { readSettingsRaw, writeSettingsRaw, STORAGE_KEYS } from '../../../services/storage';
import { invoke } from '@tauri-apps/api/core';
import { estModeTheme } from '../theme';
import { VOLUME_EVENEMENT_DEFAUT } from '../../evenements/musiqueEvenement';

// Valeurs par défaut utilisées si le stockage est vide ou corrompu
const DEFAULT_SETTINGS: AppSettings = {
  backgroundImageDataUrl: null,
  accentColor: '#e5e7eb',
  bgOverlayOpacity: 0.55,
  sgdbKeySet: false,
  autostart: false,
  runInBackground: false,
  cielVivant: true,
  evenementsCiel: true,
  musiquesEvenements: { supernova: null, cometeBleue: null, trouNoir: null },
  volumesEvenements: {
    supernova: VOLUME_EVENEMENT_DEFAUT,
    cometeBleue: VOLUME_EVENEMENT_DEFAUT,
    trouNoir: VOLUME_EVENEMENT_DEFAUT,
  },
  echelleRendu: 1,
  limiteIPS: 0,
  afficherIPS: false,
  debordement: true,
  densiteCiel: 1,
  // Masquées : la galaxie est la bibliothèque et la barre est la liste des
  // launchers. Ces réglages rappellent les pages une à une.
  showLibrary: false,
  showLaunchers: false,
  planetSizeByPlaytime: false,
  startSystem: 'auto',
  themeMode: 'dark',
};

// Vérifie qu'une valeur est un objet non-null (guard de type pour le parsing JSON)
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// Charge les paramètres depuis le stockage persistant, en validant chaque champ individuellement
export function loadSettings(): AppSettings {
  const raw = readSettingsRaw();
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_SETTINGS;

    const bg =
      typeof parsed.backgroundImageDataUrl === 'string' ? parsed.backgroundImageDataUrl : null;
    const accentColor =
      typeof parsed.accentColor === 'string' ? parsed.accentColor : DEFAULT_SETTINGS.accentColor;
    const bgOverlayOpacity =
      typeof parsed.bgOverlayOpacity === 'number'
        ? parsed.bgOverlayOpacity
        : DEFAULT_SETTINGS.bgOverlayOpacity;
    const autostart = typeof parsed.autostart === 'boolean' ? parsed.autostart : false;
    const runInBackground =
      typeof parsed.runInBackground === 'boolean' ? parsed.runInBackground : false;
    const cielVivant = typeof parsed.cielVivant === 'boolean' ? parsed.cielVivant : true;
    const evenementsCiel =
      typeof parsed.evenementsCiel === 'boolean' ? parsed.evenementsCiel : true;
    // Un morceau par événement — et l'ancien réglage unique, s'il traîne
    // encore, devient celui des trois : personne ne doit avoir à le rechoisir.
    const ancienne =
      typeof parsed.musiqueEvenement === 'string' && parsed.musiqueEvenement
        ? parsed.musiqueEvenement
        : null;
    const lue = isRecord(parsed.musiquesEvenements) ? parsed.musiquesEvenements : {};
    const unMorceau = (cle: string): string | null =>
      typeof lue[cle] === 'string' && lue[cle] ? (lue[cle] as string) : ancienne;
    const musiquesEvenements = {
      supernova: unMorceau('supernova'),
      cometeBleue: unMorceau('cometeBleue'),
      trouNoir: unMorceau('trouNoir'),
    };
    // Un volume par événement, borné : ces valeurs viennent d'un fichier qu'on
    // peut éditer à la main, et un volume de dix ne veut rien dire.
    const lus = isRecord(parsed.volumesEvenements) ? parsed.volumesEvenements : {};
    const unVolume = (cle: string): number =>
      typeof lus[cle] === 'number' && Number.isFinite(lus[cle])
        ? Math.min(1, Math.max(0, lus[cle] as number))
        : VOLUME_EVENEMENT_DEFAUT;
    const volumesEvenements = {
      supernova: unVolume('supernova'),
      cometeBleue: unVolume('cometeBleue'),
      trouNoir: unVolume('trouNoir'),
    };
    // Bornés à la relecture : ceux-là viennent d'un fichier qu'on peut éditer à
    // la main, et une échelle de rendu de mille mettrait la carte à genoux.
    //
    // `finesse` était un plafond de densité de pixels, de 1 à 2, et non une
    // part de la résolution native : sur la plupart des écrans les deux valeurs
    // donnaient le même rendu. Les installations existantes repartent donc de
    // 100 %, c'est-à-dire de ce qu'elles avaient à l'écran.
    const echelleRendu =
      typeof parsed.echelleRendu === 'number' && Number.isFinite(parsed.echelleRendu)
        ? Math.min(2, Math.max(0.5, parsed.echelleRendu))
        : 1;
    const limiteIPS =
      typeof parsed.limiteIPS === 'number' && Number.isFinite(parsed.limiteIPS)
        ? Math.min(360, Math.max(0, Math.round(parsed.limiteIPS)))
        : 0;
    const afficherIPS = parsed.afficherIPS === true;
    const debordement = typeof parsed.debordement === 'boolean' ? parsed.debordement : true;
    const densiteCiel =
      typeof parsed.densiteCiel === 'number' && Number.isFinite(parsed.densiteCiel)
        ? Math.min(1.6, Math.max(0.3, parsed.densiteCiel))
        : 1;

    return {
      backgroundImageDataUrl: bg,
      accentColor,
      bgOverlayOpacity,
      // Renseigné après coup par migrateAndCheckKey()
      sgdbKeySet: false,
      autostart,
      runInBackground,
      cielVivant,
      evenementsCiel,
      musiquesEvenements,
      volumesEvenements,
      echelleRendu,
      limiteIPS,
      afficherIPS,
      debordement,
      densiteCiel,
      // Absentes d'une entrée écrite avant ces réglages : masquées, comme pour
      // une installation neuve.
      showLibrary: parsed.showLibrary === true,
      showLaunchers: parsed.showLaunchers === true,
      planetSizeByPlaytime: parsed.planetSizeByPlaytime === true,
      startSystem:
        typeof parsed.startSystem === 'string' &&
        parsed.startSystem.length > 0 &&
        parsed.startSystem.length <= 128
          ? parsed.startSystem
          : 'auto',
      themeMode: estModeTheme(parsed.themeMode) ? parsed.themeMode : 'dark',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Sérialise les paramètres et les écrit dans le stockage persistant.
// `sgdbKeySet` est un état dérivé du coffre système : on ne le persiste pas,
// pour qu'il ne puisse jamais diverger de la réalité.
export function saveSettings(settings: AppSettings): void {
  const { sgdbKeySet: _omit, ...persisted } = settings;
  void _omit;
  writeSettingsRaw(JSON.stringify(persisted));
}

// Déplace une éventuelle clé stockée en clair (versions ≤ 1.2.0) vers le
// coffre système, puis l'efface définitivement du stockage applicatif.
// Retourne true si une clé est disponible après l'opération.
export async function migrateAndCheckKey(): Promise<boolean> {
  const raw = readSettingsRaw();

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isRecord(parsed)) {
        // `rawgApiKey` est le nom qu'avait ce champ avant le passage à
        // SteamGridDB. Il est relu tel quel : renommer la lecture ferait
        // perdre sa clé à toute installation antérieure à ce changement.
        const legacy =
          typeof parsed.sgdbApiKey === 'string'
            ? parsed.sgdbApiKey
            : typeof parsed.rawgApiKey === 'string'
              ? parsed.rawgApiKey
              : '';

        if (legacy.trim()) {
          await invoke('set_sgdb_key', { key: legacy.trim() });
          // Réécrit les réglages sans la clé — plus aucune trace en clair
          delete parsed.sgdbApiKey;
          delete parsed.rawgApiKey;
          writeSettingsRaw(JSON.stringify(parsed));
          // Purge aussi les copies miroir de localStorage, sous les deux
          // nommages : une installation ancienne peut n'avoir que l'ancien.
          try {
            window.localStorage?.removeItem(STORAGE_KEYS.settings);
            window.localStorage?.removeItem('arctive.settings.v1');
          } catch {
            /* quota ou mode privé : sans conséquence ici */
          }
        }
      }
    } catch {
      /* réglages illisibles : rien à migrer */
    }
  }

  try {
    return await invoke<boolean>('has_sgdb_key');
  } catch {
    return false;
  }
}
