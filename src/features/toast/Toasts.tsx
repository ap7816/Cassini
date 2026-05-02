import { useToast } from './ToastContext';
import css from './Toasts.module.css';

const ICONS: Record<string, string> = { success: '✓', error: '✕', info: 'ℹ' };

export function Toasts() {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;

  return (
    <div className={css.stack}>
      {toasts.map(t => (
        <div key={t.id} className={`${css.toast} ${css[t.kind]}`}>
          <span className={css.icon}>{ICONS[t.kind]}</span>
          <span className={css.msg}>{t.message}</span>
          <button className={css.close} onClick={() => dismiss(t.id)} aria-label="Fermer">✕</button>
        </div>
      ))}
    </div>
  );
}
