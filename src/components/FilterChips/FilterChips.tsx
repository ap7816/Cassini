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

export function FilterChipGroup<T extends string>({ label, options, value, onChange }: GroupProps<T>) {
  return (
    <div className={css.group}>
      {label && <span className={css.groupLabel}>{label}</span>}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${css.chip} ${value === o.value ? css.chipActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className={css.bar}>{children}</div>;
}
