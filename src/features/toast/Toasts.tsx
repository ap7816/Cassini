import { useTranslation } from 'react-i18next';
import { useToast } from './ToastContext';
import css from './Toasts.module.css';

// Icônes associées à chaque type de toast
const ICONS: Record<string, string> = { success: '✓', error: '✕', info: 'ℹ' };

// Affiche la pile de toasts actifs dans le coin de l'écran — invisible si aucun toast en cours
export function Toasts() {
  const { t } = useTranslation();
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;

  return (
    // `aria-live` sur le conteneur, qui existe avant les messages : une région
    // créée en même temps que son contenu n'est pas annoncée. Les erreurs
    // interrompent la lecture, le reste attend une pause.
    <div className={css.stack} role="status" aria-live="polite">
      {toasts.map(item => (
        <div
          key={item.id}
          className={`${css.toast} ${css[item.kind]}`}
          role={item.kind === 'error' ? 'alert' : undefined}
        >
          <span className={css.icon}>{ICONS[item.kind]}</span>
          <span className={css.msg}>{item.message}</span>
          <button className={css.close} onClick={() => dismiss(item.id)} aria-label={t('patchNotes.close')}>✕</button>
        </div>
      ))}
    </div>
  );
}
