import css from "./LibraryPage.module.css";

export function LibraryPage() {
  return (
    <div className={css.page}>
      <h1 className={css.title}>Library</h1>
      <p className={css.subtitle}>Your games will appear here.</p>
    </div>
  );
}
