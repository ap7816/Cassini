import type { TFunction } from 'i18next';

/**
 * Nom affiché d'une plateforme.
 *
 * Les identifiants sont des noms propres — Steam, Epic, Riot… — qui se lisent
 * tels quels dans toutes les langues, à deux exceptions près : `BattleNet`, qui
 * s'écrit « Battle.net », et `Other`, qui se traduit. Ces deux identifiants
 * s'affichaient bruts, en tête de liste comme sur la fiche d'un jeu.
 */
export function nomPlateforme(platform: string, t: TFunction): string {
  if (!platform || platform === 'Other') return t('filters.other');
  if (platform === 'BattleNet') return t('filters.battlenet');
  return platform;
}
