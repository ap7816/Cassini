import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

/** Pas par défaut d'une flèche, en fraction de la course. */
const PAS_DEFAUT = 0.05;

/** Multiplicateur des touches Page haut / Page bas. */
const BOND = 4;

type Props = {
  /** Position lue, entre 0 et 1. */
  valeur: number;
  /** Appelé avec la nouvelle position, entre 0 et 1. */
  onChange: (fraction: number) => void;
  /** Nom lu par les lecteurs d'écran. */
  label: string;
  /**
   * Ce que vaut la position, dit en clair : « 1:23 sur 4:10 » plutôt que
   * « 33 ». Sans lui, seul le pourcentage est annoncé — exact, et inutile.
   */
  texteValeur?: string;
  className?: string;
  /** Pas d'une flèche, en fraction de la course. */
  pas?: number;
  /** Le curseur, s'il y en a un. */
  children?: ReactNode;
  style?: CSSProperties;
};

/**
 * Une course qu'on règle à la souris **ou** au clavier.
 *
 * Le fil de progression et le volume étaient de simples `div` à l'écoute de la
 * souris : invisibles pour un lecteur d'écran, hors d'atteinte au clavier, et
 * donc inutilisables pour qui ne pointe pas. `role="slider"` et les flèches
 * rendent les deux, sans changer d'un pixel ce qu'on voit.
 *
 * La part lue est posée en `--part`, que la feuille de style du parent utilise
 * comme elle l'entend — dégradé, largeur, ou rien.
 */
export function Glissiere({
  valeur, onChange, label, texteValeur, className, pas = PAS_DEFAUT, children, style,
}: Props) {
  const piste = useRef<HTMLDivElement>(null);
  const fraction = Math.min(1, Math.max(0, valeur));
  const pourcent = fraction * 100;

  const suivre = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const a = (x: number) => Math.min(1, Math.max(0, (x - rect.left) / rect.width));

    onChange(a(e.clientX));
    piste.current?.focus();

    const bouge = (ev: globalThis.MouseEvent) => onChange(a(ev.clientX));
    const relache = () => {
      window.removeEventListener('mousemove', bouge);
      window.removeEventListener('mouseup', relache);
    };
    window.addEventListener('mousemove', bouge);
    window.addEventListener('mouseup', relache);
  };

  const auClavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta: Record<string, number> = {
      ArrowLeft: -pas, ArrowDown: -pas, ArrowRight: pas, ArrowUp: pas,
      PageDown: -pas * BOND, PageUp: pas * BOND,
    };

    let cible: number;
    if (e.key in delta) cible = fraction + delta[e.key];
    else if (e.key === 'Home') cible = 0;
    else if (e.key === 'End') cible = 1;
    else return;

    // Ces touches pilotent aussi la scène 3D, qui écoute la fenêtre : sans
    // quoi régler le volume ferait décoller la caméra derrière le calque.
    e.preventDefault();
    e.stopPropagation();
    onChange(Math.min(1, Math.max(0, cible)));
  };

  return (
    <div
      ref={piste}
      className={className}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pourcent)}
      aria-valuetext={texteValeur}
      onMouseDown={suivre}
      onKeyDown={auClavier}
      style={{ ['--part']: `${pourcent}%`, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
