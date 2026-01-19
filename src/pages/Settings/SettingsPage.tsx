import css from "./SettingsPage.module.css";

export function SettingsPage() {
  return (
    <div className={css.page}>
      <h1 className={css.title}>Settings</h1>
      <p className={css.subtitle}>Customize ArcHive (background, theme, etc.).</p>
    </div>
  );
}
