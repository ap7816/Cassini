import { useState, useCallback } from 'react';
import type { DialogState } from '../components/AppDialog/AppDialog';

// Hook qui expose des dialogues in-app basés sur des Promises (prompt et confirm)
// Utilisation dans le JSX : {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}
// Utilisation dans les handlers : const name = await prompt('Nom :'); const ok = await confirm('Supprimer ?');
export function useDialog() {
  const [dlgState, setDlgState] = useState<DialogState | null>(null);

  // Résout la Promise en cours et ferme le dialogue
  const closeDialog = useCallback((value: string | boolean | null) => {
    setDlgState(prev => {
      if (prev) (prev.resolve as (v: unknown) => void)(value);
      return null;
    });
  }, []);

  // Ouvre un dialogue de saisie de texte, résout avec la valeur saisie ou null si annulé
  const prompt = useCallback(
    (title: string, defaultValue?: string): Promise<string | null> =>
      new Promise(resolve => setDlgState({ type: 'prompt', title, defaultValue, resolve })),
    [],
  );

  // Ouvre un dialogue de confirmation, résout avec true (confirmer) ou false (annuler)
  const confirm = useCallback(
    (message: string, options?: { danger?: boolean }): Promise<boolean> =>
      new Promise(resolve =>
        setDlgState({ type: 'confirm', message, danger: options?.danger, resolve }),
      ),
    [],
  );

  return { dlgState, closeDialog, prompt, confirm };
}
