import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import css from './AppDialog.module.css';

export type DialogState =
  | { type: 'prompt';  title: string; defaultValue?: string; resolve: (v: string | null) => void }
  | { type: 'confirm'; message: string; danger?: boolean;    resolve: (v: boolean) => void };

// Dialogue modal in-app utilisé comme remplacement de window.prompt / window.confirm
export function AppDialog({ state, onClose }: {
  state: DialogState;
  onClose: (value: string | boolean | null) => void;
}) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(
    state.type === 'prompt' ? (state.defaultValue ?? '') : '',
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Donne le focus et sélectionne le texte dans l'input au moment de l'ouverture
  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, []);

  // Ferme le dialogue (annuler) quand l'utilisateur appuie sur Échap
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // Valide la saisie — retourne null si le champ est vide pour un prompt
  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (state.type === 'prompt') {
      const val = inputValue.trim();
      onClose(val.length > 0 ? val : null);
    } else {
      onClose(true);
    }
  }

  // Annule le dialogue : retourne null (prompt) ou false (confirm)
  function handleCancel() {
    onClose(state.type === 'prompt' ? null : false);
  }

  return (
    <div
      className={css.overlay}
      onMouseDown={e => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div className={css.dialog} role="dialog" aria-modal="true">

        {state.type === 'prompt' && (
          <form onSubmit={handleSubmit}>
            <p className={css.title}>{state.title}</p>
            <input
              ref={inputRef}
              className={css.input}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <div className={css.actions}>
              <button type="button" className={css.btnCancel} onClick={handleCancel}>
                {t('dialog.cancel')}
              </button>
              <button type="submit" className={css.btnOk}>
                {t('dialog.ok')}
              </button>
            </div>
          </form>
        )}

        {state.type === 'confirm' && (
          <>
            <p className={css.message}>{state.message}</p>
            <div className={css.actions}>
              <button className={css.btnCancel} onClick={handleCancel}>
                {t('dialog.cancel')}
              </button>
              <button
                autoFocus
                className={`${css.btnOk} ${state.danger ? css.btnDanger : ''}`}
                onClick={() => onClose(true)}
              >
                {t('dialog.confirm')}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
