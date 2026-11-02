import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { invoke, isTauri } from '@tauri-apps/api/core';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { readLanguage, writeLanguage } from '../services/storage';
import { LANGUES, LANGUE_SOURCE, estLangue, langueDuSysteme, type Langue } from './langues';

export { LANGUES, estLangue, type Langue } from './langues';

/**
 * Traductions, une entrée par langue déclarée.
 *
 * Typées sur le français, langue du texte source : un fichier de langue auquel
 * il manque une clé ne compile pas, une langue déclarée sans fichier non plus.
 * Une traduction oubliée se voit à la compilation, pas chez l'utilisateur.
 */
const TRADUCTIONS: Record<Langue, typeof fr> = { fr, en };

/**
 * Langue à utiliser : celle choisie dans les Paramètres, sinon celle du système
 * si l'interface la parle, sinon l'anglais.
 */
function languePreferee(): Langue {
  const choisie = readLanguage();
  if (estLangue(choisie)) return choisie;
  if (typeof navigator === 'undefined') return LANGUE_SOURCE;
  return langueDuSysteme(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(
    LANGUES.map(({ code }) => [code, { translation: TRADUCTIONS[code] }]),
  ),
  // Provisoire : à l'import de ce module, le stockage n'est pas encore chargé.
  // `appliquerLangueEnregistree` corrige avant le premier rendu.
  lng: languePreferee(),
  // Une clé absente d'une langue s'affiche dans la langue source plutôt que
  // sous la forme de son identifiant.
  fallbackLng: LANGUE_SOURCE,
  supportedLngs: LANGUES.map((l) => l.code),
  interpolation: { escapeValue: false },
});

/**
 * Annonce la langue au document.
 *
 * Sans cet attribut, un lecteur d'écran prononce le texte avec les règles d'une
 * autre langue.
 */
function annoncerLangue(lang: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/**
 * Traduit le menu de la zone de notification.
 *
 * Le code natif le construit au démarrage, avant de connaître la langue. Les
 * libellés lui viennent d'ici, où vivent toutes les traductions : il n'en garde
 * aucune copie qui pourrait diverger.
 */
function traduireMenuZone(): void {
  if (!isTauri()) return;
  invoke('set_tray_labels', { open: i18n.t('tray.open'), quit: i18n.t('tray.quit') })
    // Pas de zone de notification : rien à traduire.
    .catch(() => {});
}

i18n.on('languageChanged', (lang) => {
  annoncerLangue(lang);
  traduireMenuZone();
});

/**
 * Applique la langue retenue, une fois le stockage chargé.
 *
 * Ce module s'exécute à l'import, avant `initStorage` : la langue choisie n'y
 * est pas encore lisible. C'est ce qui faisait repartir l'application en
 * français à chaque lancement, quelle que soit la langue choisie. `main.tsx`
 * appelle cette fonction entre le chargement du stockage et le premier rendu.
 */
export async function appliquerLangueEnregistree(): Promise<void> {
  const langue = languePreferee();
  if (i18n.language !== langue) await i18n.changeLanguage(langue);
  // Répété même sans changement : l'évènement a pu partir avant que ce module
  // ne l'écoute, et le menu natif attend toujours ses libellés.
  annoncerLangue(langue);
  traduireMenuZone();
}

/** Change la langue de l'interface et la retient. */
export function setLanguage(lang: Langue): void {
  void i18n.changeLanguage(lang);
  writeLanguage(lang);
}

/** Langue active de l'interface. */
export function getCurrentLanguage(): Langue {
  return estLangue(i18n.language) ? i18n.language : LANGUE_SOURCE;
}

export default i18n;
