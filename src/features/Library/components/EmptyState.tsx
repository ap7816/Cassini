import css from "./EmptyState.module.css";

type Props = {
  onLoadSamples: () => void;
};

export function EmptyState({ onLoadSamples }: Props) {
  return (
    <div className={css.empty}>
      <div className={css.icon} aria-hidden="true">
        🎮
      </div>
      <h2 className={css.title}>Your library is empty</h2>
      <p className={css.subtitle}>
        Add your first games to start tracking your collection.
      </p>

      <div className={css.actions}>
        <button type="button" className={css.primary} onClick={onLoadSamples}>
          Add sample games
        </button>
      </div>
    </div>
  );
}
