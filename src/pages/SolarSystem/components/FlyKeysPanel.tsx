import { useEffect, useState } from 'react';
import {
  DEFAULT_FLY_KEYS,
  FLY_ACTIONS,
  flyKeyLabel,
  SENSIBILITE_DEFAUT,
  SENSIBILITE_MAX,
  SENSIBILITE_MIN,
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
 * qu'elle produit. Le libellé affiché montre les deux quand ils diffèrent
 * (« W / Z »), sans quoi un utilisateur AZERTY lirait des lettres qui ne
 * correspondent à rien sur son clavier.
 */
export function FlyKeysPanel({ settings, onChange }: Props) {
  const { keys } = settings;
  const [ouvert, setOuvert] = useState(false);
  const [enAttente, setEnAttente] = useState<FlyAction | null>(null);

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
      for (const { action } of FLY_ACTIONS) {
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
        Commandes
      </button>
    );
  }

  return (
    <section className={css.panel}>
      <header className={css.head}>
        <span className={css.title}>Déplacement</span>
        <button
          type="button"
          className={css.close}
          onClick={() => {
            setEnAttente(null);
            setOuvert(false);
          }}
          aria-label="Fermer"
        >
          ✕
        </button>
      </header>

      <ul className={css.list}>
        {FLY_ACTIONS.map(({ action, label }) => (
          <li key={action} className={css.row}>
            <span className={css.label}>{label}</span>
            <button
              type="button"
              className={[css.key, enAttente === action ? css.keyWaiting : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setEnAttente(action)}
            >
              {enAttente === action
                ? 'Appuie…'
                : keys[action]
                  ? flyKeyLabel(keys[action])
                  : '—'}
            </button>
          </li>
        ))}
      </ul>

      <div className={css.sensRow}>
        <span className={css.label}>
          Sensibilité
          <span className={css.sensValue}>{settings.sensibilite.toFixed(2)}×</span>
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

      <button
        type="button"
        className={css.reset}
        onClick={() => {
          setEnAttente(null);
          onChange({ keys: { ...DEFAULT_FLY_KEYS }, sensibilite: SENSIBILITE_DEFAUT });
        }}
      >
        Réinitialiser
      </button>

      <p className={css.note}>
        Les touches sont repérées par leur emplacement : WASD et ZQSD désignent
        les mêmes.
      </p>
    </section>
  );
}
