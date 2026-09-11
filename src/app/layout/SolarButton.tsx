import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import css from './SolarButton.module.css';

/** Durée de l'animation de lancement, alignée sur le keyframe `solarLaunch`. */
const LAUNCH_MS = 520;

/**
 * Entrée vers le système solaire. La navigation attend la fin de l'animation
 * pour que le geste se voie — la page cible charge son chunk pendant ce temps.
 */
export function SolarButton({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [launching, setLaunching] = useState(false);

  return (
    <button
      type="button"
      className={[css.btn, launching ? css.btnLaunching : '', active ? css.btnActive : '']
        .filter(Boolean)
        .join(' ')}
      onClick={() => {
        if (launching) return;
        setLaunching(true);
        setTimeout(() => {
          setLaunching(false);
          navigate('/solar');
        }, LAUNCH_MS);
      }}
      title={t('nav.solarSystem')}
    >
      <span className={css.btnOrbit} aria-hidden="true" />
      <span className={css.btnIcon}>🪐</span>
      <span className={css.btnLabel}>{t('nav.solarSystem')}</span>
    </button>
  );
}
