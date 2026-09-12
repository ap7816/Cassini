import { useContext } from 'react';
import { CalquesContext } from './calquesContext';

/** Ouvre et ferme les calques — doit être utilisé dans CalquesProvider. */
export function useCalques() {
  const ctx = useContext(CalquesContext);
  if (!ctx) throw new Error('useCalques must be used within CalquesProvider');
  return ctx;
}
