import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { abonnerSucces, type CleSucces } from './succes';
import { jouerSonSucces } from './sonSucces';
import css from './NotificationSucces.module.css';

/**
 * La carte qui paraît quand un succès se décroche, et le petit air qui va avec.
 *
 * Elle est montée une fois pour toute l'application : un succès peut tomber
 * depuis la galaxie, et il doit se voir même si l'on vient de passer à une
 * autre page.
 *
 * Elle s'efface d'elle-même au bout de sept secondes — plus long qu'un toast,
 * parce qu'il y a un nom et une explication à lire, et qu'on décroche un succès
 * sept fois dans une vie d'installation.
 */
const DUREE_MS = 7000;

type Carte = { id: number; cle: CleSucces };

export function NotificationSucces() {
  const { t } = useTranslation();
  const [cartes, setCartes] = useState<Carte[]>([]);
  const suivant = useRef(0);

  useEffect(() => {
    return abonnerSucces((cle) => {
      const id = ++suivant.current;
      setCartes((prev) => [...prev.slice(-2), { id, cle }]);
      jouerSonSucces();
      setTimeout(() => {
        setCartes((prev) => prev.filter((c) => c.id !== id));
      }, DUREE_MS);
    });
  }, []);

  if (!cartes.length) return null;

  return (
    // La région existe avant les messages : créée en même temps qu'eux, elle ne
    // serait pas annoncée par un lecteur d'écran. Même raison que pour les
    // toasts — sauf que celle-ci ne presse personne, d'où `polite`.
    <div className={css.pile} role="status" aria-live="polite">
      {cartes.map(({ id, cle }) => (
        <div key={id} className={css.carte}>
          <span className={css.sceau} aria-hidden="true">★</span>
          <div className={css.texte}>
            <div className={css.entete}>{t('succes.debloque')}</div>
            <div className={css.titre}>{t(`succes.${cle}.titre`)}</div>
            <div className={css.detail}>{t(`succes.${cle}.detail`)}</div>
          </div>
          <button
            type="button"
            className={css.fermer}
            onClick={() => setCartes((prev) => prev.filter((c) => c.id !== id))}
            aria-label={t('patchNotes.close')}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
