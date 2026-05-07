import css from './GamePage.module.css';

// Page dédiée à l'affichage d'un jeu HTML dans une iframe (contenu local dans /game/index.html)
export function GamePage() {
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
