// Script de démarrage exécuté pendant l'écran de splash.
//
// Extrait de index.html : un script inline serait bloqué par la CSP
// (`script-src 'self'`), ce qui empêcherait le bundle React de se charger.
// En fichier séparé, Vite le bundle et il est servi depuis l'origine.

import { AMBIENT_TRACKS, randomAmbientIndex } from './features/ambient/tracks';

// Lance la musique d'ambiance dès le splash, seulement si activée
const ambientAudio = document.getElementById('preloader-ambient') as HTMLAudioElement | null;

if (ambientAudio) {
  const enabled = localStorage.getItem('ambient_enabled');
  const volume = parseFloat(localStorage.getItem('ambient_volume') ?? '');

  // Le tirage a lieu ici et non dans le lecteur : c'est ce script qui démarre
  // la lecture, et le lecteur adoptera ensuite cet élément tel quel.
  ambientAudio.src = AMBIENT_TRACKS[randomAmbientIndex()];

  if (enabled !== 'false') {
    ambientAudio.volume = isNaN(volume) ? 0.25 : Math.max(0, Math.min(1, volume));
    ambientAudio.play().catch(() => {
      // Retry sur la première interaction si l'autoplay est bloqué
      window.addEventListener(
        'click',
        () => {
          void ambientAudio.play().catch(() => {});
        },
        { once: true },
      );
    });
  }
}

// Charge le bundle React immédiatement (en parallèle du splash)
void import('./main.tsx');
