import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUCCES, abonnerSucces, succesDecroches } from './succes';
import css from './ListeSucces.module.css';

/**
 * Le journal des observations : ce qu'on a vu passer, et ce qui manque.
 *
 * Un registre de bord plutôt qu'une liste de trophées — numéro, intitulé, filet
 * de conduite, verdict. Ce qui n'a pas encore été vu n'a pas d'histoire à
 * raconter : il porte son état, et la place reste ouverte. Rien n'est caché, le
 * nom d'une observation disant déjà ce qu'il y a à voir ; le masquer ne ferait
 * pas un mystère, seulement une liste de cases vides.
 *
 * La jauge est segmentée, un bloc par observation. Un bloc qui s'allume veut
 * dire quelque chose ; une barre qui avance de quatorze pour cent, non.
 *
 * Elle s'abonne, parce qu'un succès peut tomber pendant qu'on la regarde : la
 * galaxie continue de tourner derrière les paramètres.
 */
export function ListeSucces() {
  const { t } = useTranslation();
  const [decroches, setDecroches] = useState(() => new Set(succesDecroches()));

  useEffect(
    () =>
      abonnerSucces(() => {
        setDecroches(new Set(succesDecroches()));
      }),
    [],
  );

  return (
    <>
      <div className={css.entete}>
        <span className={css.compte}>{String(decroches.size).padStart(2, '0')}</span>
        <span className={css.sur}>/ {String(SUCCES.length).padStart(2, '0')}</span>
        <div className={css.jauge} aria-hidden="true">
          {SUCCES.map((cle) => (
            <span
              key={cle}
              className={decroches.has(cle) ? `${css.bloc} ${css.blocPlein}` : css.bloc}
            />
          ))}
        </div>
      </div>

      <ol className={`${css.liste} cascade`}>
        {SUCCES.map((cle, i) => {
          const vu = decroches.has(cle);
          return (
            <li key={cle} className={vu ? css.entree : `${css.entree} ${css.attente}`}>
              <div className={css.ligne}>
                <span className={css.index}>{String(i + 1).padStart(3, '0')}</span>
                <span className={css.nom}>{t(`succes.${cle}.titre`)}</span>
                <span className={css.filet} aria-hidden="true" />
                <span className={css.etat}>
                  {t(vu ? 'settings.succesObserve' : 'settings.succesAttente')}
                </span>
              </div>
              {vu && <div className={css.detail}>{t(`succes.${cle}.detail`)}</div>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
