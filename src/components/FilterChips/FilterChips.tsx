import { useId } from 'react';
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
  // Le libellé était posé à côté du menu sans lui être rattaché : visuellement
  // juste, muet pour le reste. Un lecteur d'écran annonçait « menu déroulant »
  // sans dire de quoi, et cliquer sur le mot ne faisait rien. `useId` donne un
  // identifiant stable entre le rendu serveur et le client, ce que ferait mal
  // un compteur maison.
  const id = useId();
  return (
    <div className={css.selectGroup}>
      {label && (
        <label className={css.selectLabel} htmlFor={id}>
          {label}
        </label>
      )}
      <select
        id={id}
        className={css.select}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
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
