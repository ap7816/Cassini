import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  TAGS_MAX,
  TAGS_PROPOSES,
  TAG_LONGUEUR_MAX,
  ajouterTag,
  estTagPropose,
  retirerTag,
} from '../../features/library/services/tags';
import css from './Tags.module.css';

/**
 * Libellé d'un tag.
 *
 * Les tags proposés sont rangés sous un identifiant (`enCours`) et traduits à
 * l'affichage : changer la langue ne laisse pas un « En cours » dans une
 * interface anglaise. Un tag libre s'affiche tel qu'il a été écrit.
 */
export function libelleTag(tag: string, t: TFunction): string {
  return estTagPropose(tag) ? t(`tags.${tag}`) : tag;
}

/** Tags d'un jeu, sans possibilité de les changer. */
export function ListeTags({ tags, className }: { tags: readonly string[]; className?: string }) {
  const { t } = useTranslation();
  if (tags.length === 0) return null;
  return (
    <ul className={className ? `${css.liste} ${className}` : css.liste}>
      {tags.map((tag) => (
        <li key={tag} className={css.tag}>
          {libelleTag(tag, t)}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
  /** Tags déjà posés ailleurs dans la bibliothèque, proposés en premier. */
  connus?: readonly string[];
};

/**
 * Pose et retire les tags d'un jeu.
 *
 * Le choix s'ouvre dans le flux plutôt qu'en surcouche : la fiche comme la
 * carte de la bibliothèque ont des bords qui rogneraient un panneau flottant.
 */
export function EditeurTags({ tags, onChange, connus = [] }: Props) {
  const { t } = useTranslation();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState('');
  const idChoix = useId();

  const porte = (tag: string) => tags.some((x) => x.toLowerCase() === tag.toLowerCase());
  const suggestions = [...TAGS_PROPOSES, ...connus].filter(
    (tag, i, tout) => !porte(tag) && tout.findIndex((x) => x.toLowerCase() === tag.toLowerCase()) === i,
  );
  const plein = tags.length >= TAGS_MAX;

  function poser(tag: string) {
    const suivant = ajouterTag(tags, tag);
    setSaisie('');
    if (suivant.length !== tags.length) onChange(suivant);
  }

  return (
    <div className={css.editeur}>
      <ul className={css.liste}>
        {tags.map((tag) => (
          <li key={tag} className={`${css.tag} ${css.tagRetirable}`}>
            {libelleTag(tag, t)}
            <button
              type="button"
              className={css.retirer}
              onClick={() => onChange(retirerTag(tags, tag))}
              aria-label={t('tags.remove', { tag: libelleTag(tag, t) })}
            >
              ✕
            </button>
          </li>
        ))}
        {!plein && (
          <li>
            <button
              type="button"
              className={css.ajouter}
              onClick={() => setOuvert((v) => !v)}
              aria-expanded={ouvert}
              aria-controls={idChoix}
            >
              {t('tags.add')}
            </button>
          </li>
        )}
      </ul>

      {ouvert && !plein && (
        <div id={idChoix} className={css.choix}>
          {suggestions.length > 0 && (
            <ul className={css.liste}>
              {suggestions.map((tag) => (
                <li key={tag}>
                  <button type="button" className={css.suggestion} onClick={() => poser(tag)}>
                    {libelleTag(tag, t)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className={css.saisie}
            onSubmit={(e) => {
              e.preventDefault();
              poser(saisie);
            }}
          >
            <input
              className={css.champ}
              value={saisie}
              maxLength={TAG_LONGUEUR_MAX}
              placeholder={t('tags.placeholder')}
              aria-label={t('tags.own')}
              onChange={(e) => setSaisie(e.target.value)}
            />
            <button type="submit" className={css.valider} disabled={!saisie.trim()}>
              {t('tags.addOwn')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
