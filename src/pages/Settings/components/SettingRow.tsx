import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import css from './SettingRow.module.css';

type Props = {
  /** Clé i18n du libellé. */
  labelKey: string;
  /** Clé i18n de l'explication, optionnelle. */
  hintKey?: string;
  /**
   * Explication personnalisée, quand elle contient autre chose que du texte
   * (un lien par exemple). `hintKey` reste alors utile pour la recherche.
   */
  hint?: ReactNode;
  /** Recherche courante, en minuscules. Vide = tout afficher. */
  query: string;
  children: ReactNode;
};

/**
 * Une ligne de réglage : libellé, explication, et son contrôle à droite.
 *
 * Le filtrage par recherche est porté par la ligne elle-même. Auparavant
 * chaque réglage répétait sa condition `matches(...)` à trois endroits — une
 * fois pour la ligne et deux fois pour les séparateurs qui l'entourent — ce
 * qui multipliait les occasions d'oublier une clé.
 *
 * Les séparateurs sont désormais gérés en CSS (`.row + .row`) : une ligne
 * masquée par la recherche disparaît de la fratrie, et le trait suit.
 */
export function SettingRow({ labelKey, hintKey, hint, query, children }: Props) {
  const { t } = useTranslation();

  if (query) {
    const haystack = [labelKey, hintKey]
      .filter((k): k is string => Boolean(k))
      .map((k) => t(k).toLowerCase());
    if (!haystack.some((s) => s.includes(query))) return null;
  }

  const hintContent = hint ?? (hintKey ? t(hintKey) : null);

  return (
    <div className={css.row}>
      <div>
        <div className={css.label}>{t(labelKey)}</div>
        {hintContent && <div className={css.hint}>{hintContent}</div>}
      </div>
      {children}
    </div>
  );
}
