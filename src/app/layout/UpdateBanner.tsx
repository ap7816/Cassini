import { useTranslation } from 'react-i18next';
import type { UpdaterState } from '../../features/updater/useUpdater';
import css from './UpdateBanner.module.css';

/** Bandeau signalant une mise à jour disponible, ou son installation en cours. */
export function UpdateBanner({ u }: { u: UpdaterState }) {
  const { t } = useTranslation();

  if (!u.available && !u.installing) return null;

  return (
    <div className={css.banner}>
      {u.installing ? (
        <>
          <span className={css.title}>{t('updater.installing')}</span>
          <div className={css.progressBar}>
            <div className={css.progressFill} style={{ width: `${u.progress}%` }} />
          </div>
          <span className={css.pct}>{u.progress}%</span>
        </>
      ) : (
        <>
          <div className={css.header}>
            <span className={css.title}>{t('updater.available')}</span>
            <button
              className={css.dismiss}
              onClick={u.dismiss}
              aria-label={t('updater.dismiss')}
            >
              ✕
            </button>
          </div>
          <span className={css.version}>{t('updater.version', { version: u.version })}</span>
          {u.body && <p className={css.body}>{u.body}</p>}
          <button className={css.btn} onClick={u.doInstall}>
            {t('updater.installNow')}
          </button>
        </>
      )}
    </div>
  );
}
