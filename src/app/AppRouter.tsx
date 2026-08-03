import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { LibraryPage } from '../pages/Library/LibraryPage';
import { LaunchersPage } from '../pages/Launchers/LaunchersPage';
import { SettingsPage } from '../pages/Settings/SettingsPage';
import { MusicPage } from '../pages/Music/MusicPage';
import { SolarSystemPage } from '../pages/SolarSystem/SolarSystemPage';
import { PatchNotesProvider } from '../features/patchNotes/PatchNotesContext';

// Définit toutes les routes de l'application dans un layout commun avec sidebar et mini-player
export function AppRouter() {
  return (
    <PatchNotesProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/library" replace />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/launchers" element={<LaunchersPage />} />
          <Route path="/music" element={<MusicPage />} />
<Route path="/settings" element={<SettingsPage />} />
          <Route path="/solar" element={<SolarSystemPage />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Route>
      </Routes>
    </PatchNotesProvider>
  );
}
