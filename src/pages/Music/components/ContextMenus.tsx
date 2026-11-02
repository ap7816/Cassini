import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { FolderNode } from '../lib/folderTree';
import css from './ContextMenus.module.css';

/** Ferme le menu dès qu'un clic tombe en dehors de son cadre. */
function useCloseOnOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [ref, onClose]);
}

export type FolderCtxMenu = { x: number; y: number; node: FolderNode };

type FolderMenuProps = {
  menu: FolderCtxMenu;
  currentColor: string;
  onClose: () => void;
  onRename?: (node: FolderNode) => void;
  onDelete?: (node: FolderNode) => void;
  /** Aperçu en direct, sans écriture dans le stockage. */
  onColorPreview: (path: string, color: string) => void;
  /** Persistance, à la fermeture du sélecteur de couleur. */
  onColorSave: (path: string, color: string) => void;
};

/** Menu contextuel d'un dossier : couleur, renommer, supprimer. */
export function FolderContextMenu({
  menu,
  currentColor,
  onClose,
  onRename,
  onDelete,
  onColorPreview,
  onColorSave,
}: FolderMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);

  useCloseOnOutside(menuRef, onClose);

  // L'événement natif `change` d'un <input type="color"> ne se déclenche qu'à
  // la fermeture du sélecteur : c'est le bon moment pour persister, alors que
  // `onChange` de React sert à l'aperçu en direct.
  useEffect(() => {
    const input = colorRef.current;
    if (!input) return;
    const onCommit = () => onColorSave(menu.node.fullPath, input.value);
    input.addEventListener('change', onCommit);
    return () => input.removeEventListener('change', onCommit);
  }, [menu.node.fullPath, onColorSave]);

  return (
    <div
      ref={menuRef}
      className={css.menu}
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <label className={css.colorRow}>
        <span className={css.colorLabel}>{t('music.ctxColor')}</span>
        <input
          ref={colorRef}
          type="color"
          className={css.colorInput}
          value={currentColor}
          onChange={(e) => onColorPreview(menu.node.fullPath, e.target.value)}
        />
      </label>

      <div className={css.divider} />

      {onRename && (
        <button
          className={css.item}
          onClick={() => {
            onClose();
            onRename(menu.node);
          }}
        >
          {t('music.ctxRename')}
        </button>
      )}

      {onDelete && (
        <button
          className={`${css.item} ${css.itemDanger}`}
          onClick={() => {
            onClose();
            onDelete(menu.node);
          }}
        >
          {t('music.ctxDelete')}
        </button>
      )}
    </div>
  );
}

type TrackMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  onMove: () => void;
  onChangeArt: () => void;
};

/** Menu contextuel d'une piste : déplacer, changer la pochette. */
export function TrackContextMenu({ x, y, onClose, onMove, onChangeArt }: TrackMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useCloseOnOutside(menuRef, onClose);

  return (
    <div
      ref={menuRef}
      className={css.menu}
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={css.item}
        onClick={() => {
          onClose();
          onMove();
        }}
      >
        {t('music.ctxMove')}
      </button>
      <button
        className={css.item}
        onClick={() => {
          onClose();
          onChangeArt();
        }}
      >
        {t('music.ctxChangeArt')}
      </button>
    </div>
  );
}
