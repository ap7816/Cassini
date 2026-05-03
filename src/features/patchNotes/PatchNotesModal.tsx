import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CHANGELOG, type SectionType } from './changelog';
import css from './PatchNotesModal.module.css';

/* ─── Icône et libellé de section ───────────────────────────── */
function sectionIcon(type: SectionType): string {
  const icons: Record<SectionType, string> = {
    new:    '✨',
    fix:    '🔧',
    perf:   '⚡',
    change: '🔄',
  };
  return icons[type];
}

function sectionLabel(type: SectionType, t: (key: string) => string): string {
  const keys: Record<SectionType, string> = {
    new:    'patchNotes.sectionNew',
    fix:    'patchNotes.sectionFix',
    perf:   'patchNotes.sectionPerf',
    change: 'patchNotes.sectionChange',
  };
  return t(keys[type]);
}

/* ─── Modal ──────────────────────────────────────────────────── */
interface Props {
  dismissed: boolean;
  onClose: () => void;
  onToggleDismiss: () => void;
}

export function PatchNotesModal({ dismissed, onClose, onToggleDismiss }: Props) {
  const { t } = useTranslation();
  const latest = CHANGELOG[0];

  // Fermer avec Échap
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
        {/* ── Header ── */}
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

        {/* ── Contenu ── */}
        <div className={css.body}>
          {CHANGELOG.map((entry, ei) => (
            <div key={entry.version} className={css.entry}>
              {/* En-tête de version */}
              <div className={css.entryHeader}>
                <span className={css.versionNum}>v{entry.version}</span>
                <span className={css.versionDate}>{entry.date}</span>
                {ei === 0 && (
                  <span className={css.newBadge}>{t('patchNotes.newBadge')}</span>
                )}
              </div>

              {/* Sections */}
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

        {/* ── Pied de page ── */}
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
