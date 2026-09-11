/**
 * Langues de l'interface.
 *
 * Ajouter une langue : son fichier dans `locales/`, une ligne ici, et son import
 * dans `index.ts`. Rien d'autre — le sélecteur des Paramètres se construit à
 * partir de cette liste, et le compilateur refuse un fichier auquel il manque
 * une clé.
 *
 * Le nom de chaque langue est écrit dans cette langue : on cherche « Deutsch »
 * quand on ne lit pas le français, pas « Allemand ».
 */
export const LANGUES = [
  { code: 'fr', nom: 'Français', drapeau: '🇫🇷' },
  { code: 'en', nom: 'English', drapeau: '🇬🇧' },
] as const;

export type Langue = (typeof LANGUES)[number]['code'];

/** Langue du texte source : celle vers laquelle une clé manquante se replie. */
export const LANGUE_SOURCE: Langue = 'fr';

/**
 * Langue proposée quand celle du système n'est pas disponible.
 *
 * L'anglais plutôt que le français : qui a un Windows en allemand ou en
 * japonais a plus de chances de le lire.
 */
export const LANGUE_INTERNATIONALE: Langue = 'en';

export function estLangue(v: unknown): v is Langue {
  return LANGUES.some((l) => l.code === v);
}

/**
 * Première des langues préférées du système que l'interface sait parler.
 *
 * Seule la langue compte, pas la région : `fr-CA` et `fr-BE` donnent le
 * français.
 */
export function langueDuSysteme(preferees: readonly string[]): Langue {
  for (const p of preferees) {
    const base = p.toLowerCase().split('-')[0];
    if (estLangue(base)) return base;
  }
  return LANGUE_INTERNATIONALE;
}
