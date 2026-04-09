import css from './GamePage.module.css';

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
