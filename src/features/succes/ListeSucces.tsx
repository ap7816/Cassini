import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUCCES, abonnerSucces, succesDecroches } from './succes';
import css from './ListeSucces.module.css';

/**
 * Les sept succès, décrochés ou non.
 *
 * Rien n'est caché : le nom d'un succès dit ce qu'il faut voir pour l'avoir, et
 * le masquer ne ferait pas un mystère, seulement une liste de cases vides. Ceux
 * qui manquent sont éteints, pas secrets — c'est ce qui en fait une liste de
 * choses à voir plutôt qu'un tableau de chasse.
 *
 * Elle s'abonne, parce qu'un succès peut tomber pendant qu'on la regarde : la
 * galaxie continue de tourner derrière les paramètres.
 */
export function ListeSucces() {
  const { t } = useTranslation();
  const [decroches, setDecroches] = useState(() => new Set(succesDecroches()));

  useEffect(
    () => abonnerSucces(() => { setDecroches(new Set(succesDecroches())); }),
    [],
  );

  const part = (decroches.size / SUCCES.length) * 100;

  return (
    <>
      <div className={css.compte}>
        <span className={css.chiffre}>{decroches.size}</span>
        <span className={css.total}>/ {SUCCES.length}</span>
      </div>
      <div className={css.jauge}>
        <div className={css.jaugePleine} style={{ width: `${part}%` }} />
      </div>

      <div className={css.liste}>
        {SUCCES.map((cle) => {
          const eu = decroches.has(cle);
          return (
            <div key={cle} className={eu ? css.ligne : `${css.ligne} ${css.eteint}`}>
              <span className={css.sceau} aria-hidden="true">{eu ? '★' : '☆'}</span>
              <div className={css.texte}>
                <div className={css.titre}>{t(`succes.${cle}.titre`)}</div>
                <div className={css.detail}>
                  {eu ? t(`succes.${cle}.detail`) : t('settings.succesPasEncore')}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
