import { createContext, useContext, useState, type ReactNode } from 'react';
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
  // Visibilité calculée dès l'initialisation plutôt que via un effet : écrire
  // l'état depuis un effet imposait un second rendu au démarrage, et faisait
  // apparaître le modal après coup au lieu d'être présent d'emblée.
  const [visible, setVisible] = useState(() => readPatchNotesSeen() !== __APP_VERSION__);
  // true = l'utilisateur a coché « ne plus afficher au démarrage » pour cette version
  const [dismissed, setDismissed] = useState(
    () => readPatchNotesSeen() === __APP_VERSION__,
  );

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
