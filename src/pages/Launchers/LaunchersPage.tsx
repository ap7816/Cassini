import css from "./LaunchersPage.module.css";

export function LaunchersPage() {
  return (
    <div className={css.page}>
      <h1 className={css.title}>Launchers</h1>
      <p className={css.subtitle}>Quick access to Steam, Epic, and more.</p>
    </div>
  );
}
