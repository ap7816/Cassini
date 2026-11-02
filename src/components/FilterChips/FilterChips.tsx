import css from './FilterChips.module.css';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface GroupProps<T extends string> {
  label?: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

// Sélecteur déroulant stylisé pour filtrer une liste par une valeur parmi des options prédéfinies
export function FilterSelect<T extends string>({ label, options, value, onChange }: GroupProps<T>) {
  return (
    <div className={css.selectGroup}>
      {label && <label className={css.selectLabel}>{label}</label>}
      <select className={css.select} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Conteneur flex pour aligner plusieurs FilterSelect horizontalement dans une barre de filtres
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className={css.bar}>{children}</div>;
}

// Alias conservé pour rétro-compatibilité — redirige vers FilterSelect
export function FilterChipGroup<T extends string>(props: GroupProps<T>) {
  return <FilterSelect {...props} />;
}
