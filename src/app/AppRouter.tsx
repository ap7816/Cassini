import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { SolarSystemPage } from '../pages/SolarSystem/SolarSystemPage';
import { PatchNotesProvider } from '../features/patchNotes/PatchNotesContext';
import { PanneauReglagesProvider } from '../features/settings/context/PanneauReglagesProvider';
import { RouteFallback } from './RouteFallback';

// Le système solaire est la page d'accueil : il reste dans le bundle principal.
//
// Il embarque Three.js, de loin la plus grosse dépendance du projet, et le
// charger à la demande avait tout son sens tant qu'on arrivait ailleurs. En
// page d'accueil, l'import différé ne fait plus qu'ajouter une attente : le
// bundle principal doit d'abord s'exécuter avant même de demander le morceau
// qui contient la scène. Un seul fichier, une seule passe.
//
// Les autres routes restent chargées à la demande.
const LibraryPage = lazy(() =>
  import('../pages/Library/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const LaunchersPage = lazy(() =>
  import('../pages/Launchers/LaunchersPage').then((m) => ({ default: m.LaunchersPage })),
);
const MusicPage = lazy(() =>
  import('../pages/Music/MusicPage').then((m) => ({ default: m.MusicPage })),
);
const SettingsPage = lazy(() =>
  import('../pages/Settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

/** Toutes les routes de l'application, dans un layout commun. */
export function AppRouter() {
  return (
    <PatchNotesProvider>
      <PanneauReglagesProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/solar" replace />} />
            <Route path="/solar" element={<SolarSystemPage />} />

            <Route
              path="/library"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <LibraryPage />
                </Suspense>
              }
            />
            <Route
              path="/launchers"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <LaunchersPage />
                </Suspense>
              }
            />
            <Route
              path="/music"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <MusicPage />
                </Suspense>
              }
            />
            <Route
              path="/settings"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <SettingsPage />
                </Suspense>
              }
            />

            <Route path="*" element={<Navigate to="/solar" replace />} />
          </Route>
        </Routes>
      </PanneauReglagesProvider>
    </PatchNotesProvider>
  );
}
