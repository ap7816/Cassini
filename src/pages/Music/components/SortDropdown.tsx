import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SortBy, SortDir } from '../lib/folderTree';
import css from './SortDropdown.module.css';

const SORT_BY: SortBy[] = ['name', 'dur', 'ext'];
const SORT_DIR: SortDir[] = ['asc', 'desc'];

type Props = {
  sortBy: SortBy;
  sortDir: SortDir;
  onChange: (by: SortBy, dir: SortDir) => void;
};

/** Menu de tri : critère (nom / durée / type) et direction. */
export function SortDropdown({ sortBy, sortDir, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const byLabel: Record<SortBy, string> = {
    name: t('music.sortByName'),
    dur: t('music.sortByDuration'),
    ext: t('music.sortByType'),
  };
  const dirLabel: Record<SortDir, string> = {
    asc: t('music.sortAsc'),
    desc: t('music.sortDesc'),
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={rootRef} className={css.root}>
      <button
        className={`${css.btn} ${open ? css.btnOpen : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {t('music.sortBtn')} <span className={css.arrow}>↕</span>
      </button>

      {open && (
        <div className={css.panel} onClick={(e) => e.stopPropagation()}>
          {SORT_BY.map((v) => (
            <button key={v} className={css.option} onClick={() => onChange(v, sortDir)}>
              <span className={css.check}>{sortBy === v ? '●' : ''}</span>
              {byLabel[v]}
            </button>
          ))}

          <div className={css.divider} />

          {SORT_DIR.map((v) => (
            <button key={v} className={css.option} onClick={() => onChange(sortBy, v)}>
              <span className={css.check}>{sortDir === v ? '●' : ''}</span>
              {dirLabel[v]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
