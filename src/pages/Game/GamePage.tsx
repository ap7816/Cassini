import { useEffect, useState } from 'react';
import css from './GamePage.module.css';

export function GamePage() {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/game/index.html')
      .then((r) => r.text())
      .then((html) => {
        // Si Vite sert le fallback SPA, le HTML contient id="root" — ce n'est pas Unity
        const isFallback = html.includes('id="root"') || html.includes("id='root'");
        setReady(!isFallback);
      })
      .catch(() => setReady(false));
  }, []);

  if (ready === null) return null;

  if (!ready) {
    return (
      <div className={css.placeholder}>
        <div className={css.placeholderIcon}>🎮</div>
        <div className={css.placeholderTitle}>Aucun jeu installé</div>
        <div className={css.placeholderText}>
          Exporte ton jeu Unity en WebGL et place les fichiers dans&nbsp;
          <code>public/game/</code> du projet.
        </div>
      </div>
    );
  }

  return (
    <div className={css.page}>
      <iframe
        className={css.frame}
        src="/game/index.html"
        title="Game"
        allow="fullscreen"
        scrolling="no"
      />
    </div>
  );
}
