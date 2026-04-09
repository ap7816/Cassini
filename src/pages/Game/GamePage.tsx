import css from './GamePage.module.css';

const GAME_URL = 'https://antoninpoumier.itch.io/space';

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
