import { useContext } from 'react';
import { AppSettingsContext } from './appSettingsContext';

// Accède au contexte des paramètres de l'application — doit être utilisé dans AppSettingsProvider
export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
