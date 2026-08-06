import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { LibraryPage } from '../pages/Library/LibraryPage';
import { PatchNotesProvider } from '../features/patchNotes/PatchNotesContext';
import { RouteFallback } from './RouteFallback';

// La bibliothèque est la page d'accueil : elle reste dans le bundle principal
// pour s'afficher sans aller-retour réseau supplémentaire.
//
// Les autres routes sont chargées à la demande. Le système solaire embarque
// Three.js, de loin la plus grosse dépendance du projet : tout charger d'avance
// imposait ce poids à chaque démarrage, y compris aux utilisateurs qui ne
// visitent jamais cette page.
const LaunchersPage = lazy(() =>
  import('../pages/Launchers/LaunchersPage').then((m) => ({ default: m.LaunchersPage })),
);
const MusicPage = lazy(() =>
  import('../pages/Music/MusicPage').then((m) => ({ default: m.MusicPage })),
);
const SettingsPage = lazy(() =>
  import('../pages/Settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const SolarSystemPage = lazy(() =>
  import('../pages/SolarSystem/SolarSystemPage').then((m) => ({ default: m.SolarSystemPage })),
);

/** Toutes les routes de l'application, dans un layout commun. */
export function AppRouter() {
  return (
    <PatchNotesProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />

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
          <Route
            path="/solar"
            element={
              <Suspense fallback={<RouteFallback />}>
                <SolarSystemPage />
              </Suspense>
            }
          />

          <Route path="*" element={<Navigate to="/library" replace />} />
        </Route>
      </Routes>
    </PatchNotesProvider>
  );
}
