import css from './GamePage.module.css';

const GAME_URL = 'https://loquacious-basbousa-6f6753.netlify.app/';

export function GamePage() {
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
