import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  readPatchNotesSeen,
  writePatchNotesSeen,
  readPatchNotesAuto,
  writePatchNotesAuto,
} from '../../services/storage';
import { doitOuvrirAuDemarrage } from './ouverture';
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
  const [visible, setVisible] = useState(() =>
    doitOuvrirAuDemarrage(readPatchNotesSeen(), __APP_VERSION__, readPatchNotesAuto()),
  );
  // true = l'utilisateur a demandé qu'on ne les lui ouvre plus. Durable : ce
  // n'était auparavant vrai que pour la version en cours, et la mise à jour
  // suivante les rouvrait comme si de rien n'était.
  const [dismissed, setDismissed] = useState(() => !readPatchNotesAuto());

  // Cache le modal sans modifier la préférence "ne plus afficher"
  function handleClose() {
    // Fermer vaut pour « lues » : sans cela, les mêmes notes rouvraient au
    // démarrage suivant alors qu'on venait de les parcourir.
    writePatchNotesSeen(__APP_VERSION__);
    setVisible(false);
  }

  // Bascule la préférence "ne plus afficher au démarrage" et la persiste dans le stockage
  function handleToggleDismiss() {
    const refuse = !dismissed;
    writePatchNotesAuto(!refuse);
    // La version lue est notée dans les deux cas : en réactivant l'ouverture
    // automatique, on ne veut pas revoir aussitôt les notes qu'on a sous les
    // yeux — seulement celles de la prochaine version.
    writePatchNotesSeen(__APP_VERSION__);
    setDismissed(refuse);
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
