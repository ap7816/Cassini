import css from './Breadcrumb.module.css';

type Props = {
  rootName: string;
  path: string[];
  /** Index du segment cliqué : -1 = racine. */
  onNavigate: (idx: number) => void;
};

/** Fil d'Ariane du navigateur de dossiers. */
export function Breadcrumb({ rootName, path, onNavigate }: Props) {
  const segments = [rootName, ...path];

  return (
    <nav className={css.breadcrumb}>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className={css.item}>
            {i > 0 && <span className={css.sep}>›</span>}
            <button
              className={`${css.btn} ${isLast ? css.current : ''}`}
              onClick={() => onNavigate(i - 1)}
              disabled={isLast}
              title={seg}
            >
              {seg}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
