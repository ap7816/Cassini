import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CHANGELOG, type SectionType } from './changelog';
import css from './PatchNotesModal.module.css';

// Retourne l'emoji correspondant au type de section de changelog
function sectionIcon(type: SectionType): string {
  const icons: Record<SectionType, string> = {
    new:    '✨',
    fix:    '🔧',
    perf:   '⚡',
    change: '🔄',
  };
  return icons[type];
}

// Retourne le libellé i18n pour le type de section de changelog
function sectionLabel(type: SectionType, t: (key: string) => string): string {
  const keys: Record<SectionType, string> = {
    new:    'patchNotes.sectionNew',
    fix:    'patchNotes.sectionFix',
    perf:   'patchNotes.sectionPerf',
    change: 'patchNotes.sectionChange',
  };
  return t(keys[type]);
}

interface Props {
  dismissed: boolean;
  onClose: () => void;
  onToggleDismiss: () => void;
}

// Modal de notes de mise à jour affichant tout le CHANGELOG avec sections typées
export function PatchNotesModal({ dismissed, onClose, onToggleDismiss }: Props) {
  const { t } = useTranslation();
  const latest = CHANGELOG[0];

  // Ferme le modal quand l'utilisateur appuie sur Échap
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className={css.overlay} onClick={onClose}>
      <div
        className={css.modal}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('patchNotes.title')}
      >
        <header className={css.header}>
          <div className={css.headerLeft}>
            <span className={css.headerIcon} aria-hidden="true">🎉</span>
            <div className={css.headerText}>
              <h2 className={css.headerTitle}>{t('patchNotes.title')}</h2>
              <p className={css.headerSub}>ArcHive v{latest.version}</p>
            </div>
          </div>
          <button className={css.closeBtn} onClick={onClose} aria-label={t('patchNotes.close')}>✕</button>
        </header>

        {/* Liste de toutes les versions du changelog */}
        <div className={css.body}>
          {CHANGELOG.map((entry, ei) => (
            <div key={entry.version} className={css.entry}>
              <div className={css.entryHeader}>
                <span className={css.versionNum}>v{entry.version}</span>
                <span className={css.versionDate}>{entry.date}</span>
                {/* Badge "Nouveau" uniquement sur la version la plus récente */}
                {ei === 0 && (
                  <span className={css.newBadge}>{t('patchNotes.newBadge')}</span>
                )}
              </div>

              {entry.sections.map(section => (
                <div key={section.type} className={`${css.section} ${css[`section_${section.type}`]}`}>
                  <div className={css.sectionHeader}>
                    <span aria-hidden="true">{sectionIcon(section.type)}</span>
                    <span>{sectionLabel(section.type, t)}</span>
                  </div>
                  <ul className={css.items}>
                    {section.itemKeys.map((key, i) => (
                      <li key={i} className={css.item}>{t(key)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Pied de page avec bouton pour désactiver l'affichage automatique */}
        <footer className={css.footer}>
          <button className={css.dismissBtn} onClick={onToggleDismiss}>
            {dismissed ? t('patchNotes.enableAtStartup') : t('patchNotes.dismiss')}
          </button>
          <button className={css.closeMainBtn} onClick={onClose}>
            {t('patchNotes.close')}
          </button>
        </footer>
      </div>
    </div>
  );
}
