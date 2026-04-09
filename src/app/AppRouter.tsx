import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { LibraryPage } from '../pages/Library/LibraryPage';
import { LaunchersPage } from '../pages/Launchers/LaunchersPage';
import { SettingsPage } from '../pages/Settings/SettingsPage';
import { GamePage } from '../pages/Game/GamePage';
import { MusicPage } from '../pages/Music/MusicPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/launchers" element={<LaunchersPage />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Route>
    </Routes>
  );
}
