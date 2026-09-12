import { useContext } from 'react';
import { PanneauReglagesContext } from './panneauReglagesContext';

/** Ouvre les réglages — doit être utilisé dans PanneauReglagesProvider. */
export function usePanneauReglages() {
  const ctx = useContext(PanneauReglagesContext);
  if (!ctx) throw new Error('usePanneauReglages must be used within PanneauReglagesProvider');
  return ctx;
}
