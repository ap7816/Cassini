import { useState, useCallback } from 'react';
import type { DialogState } from '../components/AppDialog/AppDialog';

/**
 * Promise-based in-app dialog hook.
 *
 * Usage:
 *   const { dlgState, closeDialog, prompt, confirm } = useDialog();
 *
 *   // in JSX:
 *   {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}
 *
 *   // in handlers:
 *   const name = await prompt('Nom du dossier :', 'valeur par défaut');
 *   const ok   = await confirm('Supprimer ?', { danger: true });
 */
export function useDialog() {
  const [dlgState, setDlgState] = useState<DialogState | null>(null);

  const closeDialog = useCallback((value: string | boolean | null) => {
    setDlgState(prev => {
      if (prev) (prev.resolve as (v: unknown) => void)(value);
      return null;
    });
  }, []);

  const prompt = useCallback(
    (title: string, defaultValue?: string): Promise<string | null> =>
      new Promise(resolve => setDlgState({ type: 'prompt', title, defaultValue, resolve })),
    [],
  );

  const confirm = useCallback(
    (message: string, options?: { danger?: boolean }): Promise<boolean> =>
      new Promise(resolve =>
        setDlgState({ type: 'confirm', message, danger: options?.danger, resolve }),
      ),
    [],
  );

  return { dlgState, closeDialog, prompt, confirm };
}
