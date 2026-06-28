// Analyse audio via AudioBufferSourceNode (fetch → decodeAudioData → analyser).
// Évite createMediaElementSource (CORS) et l'élément shadow (problèmes de sync).

let _ctx:    AudioContext      | null = null;
let _analyser: AnalyserNode    | null = null;
let _source:  AudioBufferSourceNode | null = null;
let _buffer:  AudioBuffer      | null = null;
let _mainEl:  HTMLAudioElement | null = null;
let _isPlaying = false;
let _loadId  = 0; // annule les chargements obsolètes

function ensureCtx(): AudioContext {
  if (_ctx) return _ctx;
  _ctx      = new AudioContext();
  _analyser = _ctx.createAnalyser();
  _analyser.fftSize              = 2048;
  _analyser.smoothingTimeConstant = 0.78;
  // GainNode silencieux : le graphe reste actif (analyser fonctionne) sans sortie audio
  const silence = _ctx.createGain();
  silence.gain.value = 0;
  _analyser.connect(silence);
  silence.connect(_ctx.destination);
  return _ctx;
}

function stopSource(): void {
  if (_source) {
    _source.onended = null;
    _source.disconnect();
    try { _source.stop(); } catch { /* déjà arrêté */ }
    _source = null;
  }
}

function startSource(offset: number): void {
  if (!_ctx || !_analyser || !_buffer) return;
  stopSource();
  const src = _ctx.createBufferSource();
  src.buffer = _buffer;
  src.connect(_analyser);
  src.start(0, Math.max(0, Math.min(offset, _buffer.duration - 0.01)));
  src.onended = () => { if (_source === src) _source = null; };
  _source = src;
}

export function initMusicAnalyser(mainEl: HTMLAudioElement): void {
  _mainEl = mainEl;

  mainEl.addEventListener('play', () => {
    if (!_buffer) return;
    if (_ctx?.state === 'suspended') void _ctx.resume();
    startSource(mainEl.currentTime);
  });
  mainEl.addEventListener('pause',  stopSource);
  mainEl.addEventListener('ended',  stopSource);
  mainEl.addEventListener('seeked', () => {
    if (!_buffer || mainEl.paused) return;
    startSource(mainEl.currentTime);
  });
}

export async function loadTrackForAnalysis(assetUrl: string): Promise<void> {
  const id = ++_loadId;
  stopSource();
  _buffer = null;

  try {
    const ctx = ensureCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const res = await fetch(assetUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    if (id !== _loadId) return; // piste changée entre temps

    _buffer = await ctx.decodeAudioData(arrayBuf);
    if (id !== _loadId) return;

    // Démarre si la musique joue déjà
    if (_mainEl && !_mainEl.paused) {
      startSource(_mainEl.currentTime);
    }
  } catch (e) {
    console.warn('[analyser] échec chargement:', e);
  }
}

export function getAnalyser(): AnalyserNode | null { return _analyser; }
export function setMusicPlaying(v: boolean): void  { _isPlaying = v; }
export function getMusicPlaying(): boolean          { return _isPlaying; }
export function resumeCtx(): void {
  if (_ctx?.state === 'suspended') void _ctx.resume();
}
