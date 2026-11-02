import { useState, useEffect } from 'react';
import {
  getAmbientEnabled,
  getAmbientVolume,
  setAmbientEnabled,
  setAmbientVolume,
  subscribeAmbient,
} from './ambientPlayer';

export function useAmbientPlayer() {
  const [enabled, setEnabled] = useState(getAmbientEnabled);
  const [volume, setVolume] = useState(getAmbientVolume);

  // Synchronise le state local quand un autre composant modifie les réglages
  useEffect(
    () =>
      subscribeAmbient(() => {
        setEnabled(getAmbientEnabled());
        setVolume(getAmbientVolume());
      }),
    [],
  );

  return {
    enabled,
    volume,
    setEnabled: setAmbientEnabled,
    setVolume: setAmbientVolume,
  };
}
