import css from './GamePage.module.css';

// URL du jeu hébergé sur GitHub Pages
const GAME_URL = 'https://apoumier.github.io/ArcHive-games/';

export function GamePage() {
  if (!GAME_URL) {
    return (
      <div className={css.placeholder}>
        <div className={css.placeholderIcon}>🎮</div>
        <div className={css.placeholderTitle}>Aucun jeu configuré</div>
        <div className={css.placeholderText}>
          Crée un repo GitHub Pages avec ton build Unity WebGL et configure
          l'URL dans <code>src/pages/Game/GamePage.tsx</code>.
        </div>
      </div>
    );
  }

  return (
    <div className={css.page}>
      <iframe
        className={css.frame}
        src={GAME_URL}
        title="Game"
        allow="fullscreen"
        scrolling="no"
      />
    </div>
  );
}
