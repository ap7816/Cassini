import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formaterNombre } from '../../../i18n/formats';
import {
  DEFAULT_FLY_KEYS,
  FLY_ACTIONS,
  flyKeyLabel,
  lireDispositionClavier,
  SENSIBILITE_DEFAUT,
  SENSIBILITE_MAX,
  SENSIBILITE_MIN,
  VITESSE_DEFAUT,
  VITESSE_MAX,
  VITESSE_MIN,
  type DispositionClavier,
  type FlyAction,
  type FlySettings,
} from '../lib/flyKeys';
import css from './FlyKeysPanel.module.css';

type Props = {
  settings: FlySettings;
  onChange: (next: FlySettings) => void;
};

/**
 * Panneau des commandes de déplacement.
 *
 * La capture se fait sur `KeyboardEvent.code`, comme la lecture dans la scène :
 * ce qui est enregistré est l'emplacement de la touche, pas le caractère
 * qu'elle produit. Le libellé affiché est la lettre que porte la touche sur le
 * clavier de l'utilisateur quand le navigateur sait la donner, et sinon les
 * lettres QWERTY et AZERTY côte à côte (« W / Z »).
 */
export function FlyKeysPanel({ settings, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const { keys } = settings;
  const [ouvert, setOuvert] = useState(false);
  const [enAttente, setEnAttente] = useState<FlyAction | null>(null);
  const [disposition, setDisposition] = useState<DispositionClavier>(null);

  // Lue à l'ouverture : la disposition ne change pas pendant qu'on règle, et
  // l'API n'est pas offerte partout.
  useEffect(() => {
    if (!ouvert) return;
    let annule = false;
    void lireDispositionClavier().then((d) => {
      if (!annule) setDisposition(d);
    });
    return () => {
      annule = true;
    };
  }, [ouvert]);

  // Capture de la prochaine touche. En phase de capture, on intercepte tout :
  // l'écouteur de la scène tournant aussi sur `window`, la touche pressée
  // ferait décoller la caméra pendant qu'on la réaffecte.
  useEffect(() => {
    if (!enAttente) return;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setEnAttente(null);
        return;
      }
      // Une même touche ne peut pas servir deux actions : on libère l'ancienne
      // plutôt que de laisser deux commandes se déclencher ensemble.
      const next = { ...keys };
      for (const action of FLY_ACTIONS) {
        if (next[action] === e.code) next[action] = '';
      }
      next[enAttente!] = e.code;
      onChange({ ...settings, keys: next });
      setEnAttente(null);
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enAttente, keys, settings, onChange]);

  if (!ouvert) {
    return (
      <button type="button" className={css.open} onClick={() => setOuvert(true)}>
        {t('flyKeys.open')}
      </button>
    );
  }

  return (
    <section className={css.panel}>
      <header className={css.head}>
        <span className={css.title}>{t('flyKeys.title')}</span>
        <button
          type="button"
          className={css.close}
          onClick={() => {
            setEnAttente(null);
            setOuvert(false);
          }}
          aria-label={t('common.close')}
        >
          ✕
        </button>
      </header>

      <ul className={css.list}>
        {FLY_ACTIONS.map((action) => (
          <li key={action} className={css.row}>
            <span className={css.label}>{t(`flyKeys.actions.${action}`)}</span>
            <button
              type="button"
              className={[css.key, enAttente === action ? css.keyWaiting : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setEnAttente(action)}
            >
              {enAttente === action
                ? t('flyKeys.waiting')
                : keys[action]
                  ? flyKeyLabel(keys[action], t, disposition)
                  : '—'}
            </button>
          </li>
        ))}
      </ul>

      <div className={css.sensRow}>
        <span className={css.label}>
          {t('flyKeys.sensitivity')}
          <span className={css.sensValue}>{formaterNombre(settings.sensibilite, i18n.language, 2)}×</span>
        </span>
        <input
          type="range"
          className={css.slider}
          min={SENSIBILITE_MIN}
          max={SENSIBILITE_MAX}
          step={0.05}
          value={settings.sensibilite}
          onChange={(e) =>
            onChange({ ...settings, sensibilite: Number(e.target.value) })
          }
        />
      </div>

      <div className={css.sensRow}>
        <span className={css.label}>
          {t('flyKeys.speed')}
          <span className={css.sensValue}>{formaterNombre(settings.vitesse, i18n.language, 2)}×</span>
        </span>
        <input
          type="range"
          className={css.slider}
          min={VITESSE_MIN}
          max={VITESSE_MAX}
          step={0.05}
          value={settings.vitesse}
          onChange={(e) => onChange({ ...settings, vitesse: Number(e.target.value) })}
        />
      </div>

      <button
        type="button"
        className={css.reset}
        onClick={() => {
          setEnAttente(null);
          onChange({
            keys: { ...DEFAULT_FLY_KEYS },
            sensibilite: SENSIBILITE_DEFAUT,
            vitesse: VITESSE_DEFAUT,
          });
        }}
      >
        {t('flyKeys.reset')}
      </button>

      <p className={css.note}>{t('flyKeys.note')}</p>
    </section>
  );
}
