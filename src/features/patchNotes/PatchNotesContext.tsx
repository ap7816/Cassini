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

// Gère l'affichage automatique des notes de mise à jour au démarrage et la préférence "ne plus afficher"
export function PatchNotesProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  // true = l'utilisateur a coché "ne plus afficher au démarrage" pour cette version
  const [dismissed, setDismissed] = useState(
    () => readPatchNotesSeen() === __APP_VERSION__,
  );

  // Affiche le modal si l'utilisateur n'a pas encore ignoré cette version
  useEffect(() => {
    if (readPatchNotesSeen() !== __APP_VERSION__) {
      setVisible(true);
    }
  }, []);

  // Cache le modal sans modifier la préférence "ne plus afficher"
  function handleClose() {
    setVisible(false);
  }

  // Bascule la préférence "ne plus afficher au démarrage" et la persiste dans le stockage
  function handleToggleDismiss() {
    if (dismissed) {
      // Réactiver l'affichage au démarrage pour cette version
      removePatchNotesSeen();
      setDismissed(false);
    } else {
      // Marquer cette version comme "déjà vue" pour ne plus l'afficher automatiquement
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

// Accède aux actions du contexte des notes de mise à jour — principalement pour rouvrir le modal depuis les paramètres
export function usePatchNotes(): PatchNotesCtxType {
  return useContext(PatchNotesCtx);
}
