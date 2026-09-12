import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ReglagesContenu } from './ReglagesContenu';
import css from './SettingsPage.module.css';

/**
 * Page des paramètres.
 *
 * Les réglages s'ouvrent désormais en panneau, sans quitter la vue (voir
 * `PanneauReglages`). Cette page n'est plus que la seconde coquille du même
 * contenu : elle garde les liens profonds `?q=` valables, et laisse une porte
 * ouverte le jour où la scène 3D refuserait de démarrer.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  return (
    <div className={css.page}>
      <h1 className={css.title}>{t('settings.title')}</h1>
      <ReglagesContenu recherche={searchParams.get('q') ?? ''} />
    </div>
  );
}
