import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePiegeFocus } from '../../hooks/useFocus';
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
  const fenetreRef = useRef<HTMLDivElement>(null);
  usePiegeFocus(fenetreRef);

  // Donne le focus et sélectionne le texte dans l'input au moment de l'ouverture
  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, []);

  // Ferme le dialogue (annuler) quand l'utilisateur appuie sur Échap.
  //
  // L'effet dépend explicitement de ce qu'il utilise : sans tableau de
  // dépendances, l'écouteur était retiré puis réenregistré à chaque rendu du
  // dialogue, y compris à chaque frappe dans le champ de saisie.
  const isPrompt = state.type === 'prompt';
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose(isPrompt ? null : false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPrompt, onClose]);

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

  // Rendu dans `document.body` et non sur place : l'overlay est en
  // `position: fixed`, et un ancêtre porteur d'un `transform` devient son bloc
  // conteneur — le dialogue se retrouve alors enfermé dans l'élément appelant,
  // voire rogné si celui-ci masque son débordement. C'est le cas de la carte
  // de détail du système solaire, repositionnée par transform à chaque frame.
  // Les événements React continuent de remonter l'arbre des composants.
  return createPortal(
    <div
      className={css.overlay}
      onMouseDown={e => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div
        ref={fenetreRef}
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={state.type === 'prompt' ? state.title : state.message}
      >

        {state.type === 'prompt' && (
          <form onSubmit={handleSubmit}>
            <p className={css.title}>{state.title}</p>
            <input
              ref={inputRef}
              className={css.input}
              aria-label={state.title}
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
    </div>,
    document.body,
  );
}
