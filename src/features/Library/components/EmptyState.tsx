import { useTranslation } from 'react-i18next';
import css from './EmptyState.module.css';

type Props = {
  onLoadSamples: () => void;
};

export function EmptyState({ onLoadSamples }: Props) {
  const { t } = useTranslation();

  return (
    <div className={css.empty}>
      <div className={css.icon} aria-hidden="true">
        🎮
      </div>
      <h2 className={css.title}>{t('emptyState.title')}</h2>
      <p className={css.subtitle}>{t('emptyState.subtitle')}</p>

      <div className={css.actions}>
        <button type="button" className={css.primary} onClick={onLoadSamples}>
          {t('emptyState.addSamples')}
        </button>
      </div>
    </div>
  );
}
