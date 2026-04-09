import css from './GamePage.module.css';

const GAME_URL = 'https://html-classic.itch.zone/html/17106031/ArcHive-games/index.html';

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
