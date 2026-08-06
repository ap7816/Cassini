import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrackWithIdx } from '../lib/folderTree';
import css from './FolderPickerModal.module.css';

type Props = {
  track: TrackWithIdx;
  allDirs: string[];
  rootName: string;
  folderPath: string;
  onClose: () => void;
  onConfirm: (destRelPath: string) => void;
};

/** Modale de choix de dossier, pour déplacer une piste. */
export function FolderPickerModal({
  track, allDirs, rootName, folderPath, onClose, onConfirm,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // Racine + tous les sous-dossiers, sauf celui où la piste se trouve déjà
  const folders = useMemo(() => {
    const list = ['', ...allDirs].filter((f) => f !== track.folder);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => {
      const label = f ? f.split('/').pop()! : rootName;
      return label.toLowerCase().includes(q) || f.toLowerCase().includes(q);
    });
  }, [allDirs, track.folder, rootName, search]);

  return (
    <div className={css.overlay} onClick={onClose}>
      <div className={css.modal} onClick={(e) => e.stopPropagation()}>
        <div className={css.header}>{t('music.moveModalTitle', { title: track.title })}</div>

        <input
          className={css.search}
          placeholder={t('music.moveModalSearch')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <ul className={css.list}>
          {folders.map((f) => {
            const label = f ? f.split('/').pop()! : t('music.moveModalRoot');
            return (
              <li
                key={f}
                className={`${css.item} ${selected === f ? css.itemSelected : ''}`}
                onClick={() => setSelected(f)}
                title={f ? `${folderPath}/${f}` : folderPath}
              >
                <span className={css.icon}>📁</span>
                <div className={css.labels}>
                  <span className={css.name}>{label}</span>
                  {f && <span className={css.path}>{f}</span>}
                </div>
              </li>
            );
          })}
          {folders.length === 0 && <li className={css.empty}>—</li>}
        </ul>

        <div className={css.actions}>
          <button className={css.cancel} onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button
            className={css.confirm}
            disabled={selected === null}
            onClick={() => selected !== null && onConfirm(selected)}
          >
            {t('music.moveModalConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
