import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { readPatchNotesSeen, writePatchNotesSeen } from '../../services/storage';
import { PatchNotesModal } from './PatchNotesModal';

interface PatchNotesCtxType {
  openPatchNotes: () => void;
}

const PatchNotesCtx = createContext<PatchNotesCtxType>({ openPatchNotes: () => {} });

export function PatchNotesProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  // Afficher au démarrage si la version n'a pas encore été vue
  useEffect(() => {
    const seen = readPatchNotesSeen();
    if (seen !== __APP_VERSION__) {
      setVisible(true);
    }
  }, []);

  function handleClose() {
    // Ferme le popup pour cette session ; ne marque PAS la version comme vue
    // → s'affichera à nouveau au prochain lancement
    setVisible(false);
  }

  function handleDismiss() {
    // L'utilisateur ne veut plus voir ce popup au démarrage pour cette version
    writePatchNotesSeen(__APP_VERSION__);
    setVisible(false);
  }

  return (
    <PatchNotesCtx.Provider value={{ openPatchNotes: () => setVisible(true) }}>
      {children}
      {visible && (
        <PatchNotesModal onClose={handleClose} onDismiss={handleDismiss} />
      )}
    </PatchNotesCtx.Provider>
  );
}

export function usePatchNotes(): PatchNotesCtxType {
  return useContext(PatchNotesCtx);
}
