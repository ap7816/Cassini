import { useEffect, useRef, useState } from 'react';
import css from './GamePage.module.css';

const GAME_URL = '/game/index.html';

const INJECT_CSS = `
  html, body { margin: 0; padding: 0; background: #0f141a !important; width: 100%; height: 100%; overflow: hidden; }
  #unity-container { position: fixed !important; width: 100% !important; height: 100% !important; top: 0; left: 0; }
  #unity-canvas { width: 100% !important; height: 100% !important; }
`;

export function GamePage() {
  const [ready, setReady] = useState<boolean | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch(GAME_URL)
      .then((r) => r.text())
      .then((html) => {
        const isFallback = html.includes('id="root"') || html.includes("id='root'");
        setReady(!isFallback);
      })
      .catch(() => setReady(false));
  }, []);

  function handleIframeLoad() {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      const style = doc.createElement('style');
      style.textContent = INJECT_CSS;
      doc.head.appendChild(style);
    } catch { /* cross-origin */ }
  }

  if (ready === null) return null;

  if (!ready) {
    return (
      <div className={css.placeholder}>
        <div className={css.placeholderIcon}>🎮</div>
        <div className={css.placeholderTitle}>Aucun jeu installé</div>
        <div className={css.placeholderText}>
          Place ton build Unity WebGL dans <code>public/game/</code> du projet.
        </div>
      </div>
    );
  }

  return (
    <div className={css.page}>
      <iframe
        ref={iframeRef}
        className={css.frame}
        src={GAME_URL}
        title="Game"
        allow="fullscreen"
        scrolling="no"
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
