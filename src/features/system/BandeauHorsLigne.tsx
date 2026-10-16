import { useTranslation } from 'react-i18next';
import { useEnLigne } from './useReseau';
import css from './BandeauHorsLigne.module.css';

/**
 * L'avertissement de réseau.
 *
 * Sans réseau, les jaquettes ne peuvent pas arriver et la bibliothèque se
 * remplit de lettres sur fond coloré. Rien dans l'application ne le disait : on
 * croyait à une panne de l'application, et actualiser n'y changeait rien.
 *
 * Il dit aussi ce qui va se passer — les images reviendront d'elles-mêmes —,
 * parce qu'un avertissement qui ne dit que le problème laisse l'utilisateur
 * chercher la manœuvre à faire. Il n'y en a aucune.
 *
 * Monté au niveau de l'application, et sans prise à la souris : c'est un
 * voyant, pas un dialogue.
 */
export function BandeauHorsLigne() {
  const { t } = useTranslation();
  const enLigne = useEnLigne();
  if (enLigne) return null;

  return (
    <div className={css.bandeau} role="status" aria-live="polite">
      <span className={css.voyant} aria-hidden="true" />
      <span className={css.titre}>{t('reseau.horsLigneTitre')}</span>
      <span className={css.detail}>{t('reseau.horsLigneDetail')}</span>
    </div>
  );
}
