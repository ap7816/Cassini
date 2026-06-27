// Singleton Web Audio API — connexion différée au premier clic utilisateur.
// createMediaElementSource reroute l'audio via l'AudioContext : si ce contexte
// est créé hors interaction, il démarre "suspended" et coupe le son.
// En le créant pendant un événement utilisateur, il démarre directement "running".

let _ctx: AudioContext | null = null;
let _analyser: AnalyserNode | null = null;

export function connectMusicAnalyser(el: HTMLAudioElement): void {
  if (_analyser) return;

  const connect = () => {
    if (_analyser) return;
    try {
      _ctx = new AudioContext();
      _analyser = _ctx.createAnalyser();
      _analyser.fftSize = 512;
      _analyser.smoothingTimeConstant = 0.8;
      const src = _ctx.createMediaElementSource(el);
      src.connect(_analyser);
      _analyser.connect(_ctx.destination);
    } catch {
      // Si la connexion échoue, le visualizer reste inactif mais la musique joue
      _analyser = null;
      _ctx = null;
    }
  };

  // Premier clic ou touche = geste utilisateur → AudioContext démarre "running"
  window.addEventListener('click',   connect, { once: true, capture: true });
  window.addEventListener('keydown', connect, { once: true, capture: true });
}

export function getAnalyser(): AnalyserNode | null { return _analyser; }

export function resumeCtx(): void {
  if (_ctx?.state === 'suspended') void _ctx.resume();
}
