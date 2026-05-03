import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  readPatchNotesSeen,
  writePatchNotesSeen,
  removePatchNotesSeen,
} from '../../services/storage';
import { PatchNotesModal } from './PatchNotesModal';

interface PatchNotesCtxType {
  openPatchNotes: () => void;
}

const PatchNotesCtx = createContext<PatchNotesCtxType>({ openPatchNotes: () => {} });

export function PatchNotesProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  // true = l'utilisateur a cliqué "Ne plus afficher" pour cette version
  const [dismissed, setDismissed] = useState(
    () => readPatchNotesSeen() === __APP_VERSION__,
  );

  // Afficher au démarrage si la version n'a pas encore été ignorée
  useEffect(() => {
    if (readPatchNotesSeen() !== __APP_VERSION__) {
      setVisible(true);
    }
  }, []);

  function handleClose() {
    setVisible(false);
  }

  function handleToggleDismiss() {
    if (dismissed) {
      // Réactiver l'affichage au démarrage
      removePatchNotesSeen();
      setDismissed(false);
    } else {
      // Désactiver l'affichage au démarrage pour cette version
      writePatchNotesSeen(__APP_VERSION__);
      setDismissed(true);
    }
  }

  return (
    <PatchNotesCtx.Provider value={{ openPatchNotes: () => setVisible(true) }}>
      {children}
      {visible && (
        <PatchNotesModal
          dismissed={dismissed}
          onClose={handleClose}
          onToggleDismiss={handleToggleDismiss}
        />
      )}
    </PatchNotesCtx.Provider>
  );
}

export function usePatchNotes(): PatchNotesCtxType {
  return useContext(PatchNotesCtx);
}
