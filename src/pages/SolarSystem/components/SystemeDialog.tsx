import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Game } from '../../../features/types';
import { AppDialog, type DialogState } from '../../../components/AppDialog/AppDialog';
import { usePiegeFocus } from '../../../hooks/useFocus';
import { PLATFORM_CSS } from '../constants';
import { COULEURS_SYSTEME, NOM_MAX, nouveauSysteme, nouvelId, type SystemePerso } from '../lib/customSystems';
import { ICONES_SYSTEME, ICONE_PAR_DEFAUT } from '../lib/iconesSysteme';
import { IconeSysteme } from './IconeSysteme';
import css from './SystemeDialog.module.css';

type Props = {
  /** Système à modifier, ou `null` pour en créer un. */
  systeme: SystemePerso | null;
  /** Systèmes déjà créés : pour un identifiant libre et une couleur de départ. */
  existants: SystemePerso[];
  /** Toute la bibliothèque, dans laquelle on choisit. */
  games: Game[];
  onEnregistrer: (s: SystemePerso) => void;
  onSupprimer: (id: string) => void;
  onFermer: () => void;
};

/**
 * Création ou modification d'un système solaire personnalisé.
 *
 * Rendu dans `document.body` : la page du système solaire vit dans un conteneur
 * animé par `transform`, qui deviendrait sinon le bloc conteneur de ce calque
 * en position fixe et l'enfermerait.
 */
export function SystemeDialog({ systeme, existants, games, onEnregistrer, onSupprimer, onFermer }: Props) {
  const titreId = useId();
  const champNom = useRef<HTMLInputElement>(null);
  const fenetreRef = useRef<HTMLFormElement>(null);
  usePiegeFocus(fenetreRef);
  const parId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const [nom, setNom] = useState(systeme?.nom ?? '');
  const [icone, setIcone] = useState(systeme?.icone ?? ICONE_PAR_DEFAUT);
  // Une couleur différente pour chaque nouveau système : deux systèmes créés
  // d'affilée ne se confondent pas dans la barre.
  const [couleur, setCouleur] = useState(
    systeme?.couleur ?? COULEURS_SYSTEME[existants.length % COULEURS_SYSTEME.length],
  );
  // Les jeux retirés de la bibliothèque depuis sont écartés d'emblée : on ne
  // pourrait ni les voir ni les décocher.
  const [jeux, setJeux] = useState<string[]>(() => (systeme?.jeux ?? []).filter((id) => parId.has(id)));
  const [recherche, setRecherche] = useState('');
  const [confirmation, setConfirmation] = useState<DialogState | null>(null);

  useEffect(() => {
    champNom.current?.focus();
  }, []);

  // Échap ferme — sauf pendant la confirmation de suppression, qui gère sa
  // propre touche : les deux se fermeraient d'un coup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || confirmation) return;
      e.preventDefault();
      onFermer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmation, onFermer]);

  const q = recherche.trim().toLowerCase();
  const { selection, reste } = useMemo(() => {
    const choisis = new Set(jeux);
    // Les jeux choisis restent en tête, dans l'ordre de leurs futures orbites,
    // quelle que soit la recherche : c'est ce qu'on construit.
    const sel = jeux.map((id) => parId.get(id)).filter((g): g is Game => g !== undefined);
    const autres = games
      .filter((g) => !choisis.has(g.id) && (!q || g.title.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { selection: sel, reste: autres };
  }, [games, jeux, parId, q]);

  function basculer(id: string) {
    setJeux((avant) => (avant.includes(id) ? avant.filter((x) => x !== id) : [...avant, id]));
  }

  const nomPropre = nom.trim();
  const manque = !nomPropre ? 'Il manque un nom.' : jeux.length === 0 ? 'Choisir au moins un jeu.' : null;

  function valider(e: FormEvent) {
    e.preventDefault();
    if (manque) return;
    const champs = { nom: nomPropre.slice(0, NOM_MAX), icone, couleur, jeux };
    onEnregistrer(
      systeme ? { ...systeme, ...champs } : nouveauSysteme({ id: nouvelId(existants), ...champs }),
    );
  }

  function demanderSuppression() {
    if (!systeme) return;
    setConfirmation({
      type: 'confirm',
      message: `Supprimer le système « ${systeme.nom} » ? Ses jeux restent dans la bibliothèque et dans leur launcher.`,
      danger: true,
      resolve: (ok) => {
        if (ok) onSupprimer(systeme.id);
      },
    });
  }

  return createPortal(
    <div
      className={css.fond}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <form
        ref={fenetreRef}
        className={css.fenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        onSubmit={valider}
        style={{ '--teinte': couleur } as CSSProperties}
      >
        <header className={css.entete}>
          <div className={css.apercu}>
            <IconeSysteme nom={icone} couleur={couleur} taille={30} />
          </div>
          <div className={css.enteteTexte}>
            <h2 id={titreId} className={css.titre}>
              {systeme ? 'Modifier le système' : 'Nouveau système solaire'}
            </h2>
            <p className={css.sousTitre}>
              {nomPropre || 'Sans nom'} · {jeux.length} {jeux.length > 1 ? 'jeux' : 'jeu'}
            </p>
          </div>
          <button type="button" className={css.fermer} onClick={onFermer} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className={css.corps}>
          <label className={css.champ}>
            <span className={css.etiquette}>Nom</span>
            <input
              ref={champNom}
              className={css.saisie}
              value={nom}
              maxLength={NOM_MAX}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Favoris, En cours, Coop…"
            />
          </label>

          <div className={css.champ}>
            <span className={css.etiquette}>Icône</span>
            <div className={css.icones} role="radiogroup" aria-label="Icône">
              {ICONES_SYSTEME.map((i) => {
                const choisie = i.nom === icone;
                return (
                  <button
                    key={i.nom}
                    type="button"
                    role="radio"
                    aria-checked={choisie}
                    title={i.libelle}
                    className={choisie ? `${css.icone} ${css.iconeChoisie}` : css.icone}
                    onClick={() => setIcone(i.nom)}
                  >
                    <IconeSysteme nom={i.nom} couleur={choisie ? couleur : 'currentColor'} taille={20} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className={css.champ}>
            <span className={css.etiquette}>Couleur</span>
            <div className={css.couleurs}>
              {COULEURS_SYSTEME.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === couleur ? `${css.pastille} ${css.pastilleChoisie}` : css.pastille}
                  style={{ background: c }}
                  onClick={() => setCouleur(c)}
                  aria-label={`Couleur ${c}`}
                  aria-pressed={c === couleur}
                />
              ))}
              <input
                type="color"
                className={css.couleurLibre}
                value={couleur}
                onChange={(e) => setCouleur(e.target.value)}
                aria-label="Autre couleur"
                title="Autre couleur"
              />
            </div>
          </div>

          <div className={`${css.champ} ${css.champJeux}`}>
            <span className={css.etiquette}>
              Jeux <span className={css.compte}>{jeux.length}</span>
            </span>
            <input
              className={css.saisie}
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher dans la bibliothèque…"
              aria-label="Rechercher un jeu"
            />
            <ul className={css.jeux}>
              {selection.map((g, i) => (
                <LigneJeu key={g.id} game={g} rang={i + 1} choisi onBasculer={basculer} />
              ))}
              {selection.length > 0 && reste.length > 0 && <li className={css.separation} aria-hidden="true" />}
              {reste.map((g) => (
                <LigneJeu key={g.id} game={g} rang={null} choisi={false} onBasculer={basculer} />
              ))}
              {selection.length === 0 && reste.length === 0 && (
                <li className={css.vide}>Aucun jeu ne correspond.</li>
              )}
            </ul>
          </div>
        </div>

        <footer className={css.pied}>
          {systeme && (
            <button type="button" className={css.supprimer} onClick={demanderSuppression}>
              Supprimer
            </button>
          )}
          <span className={css.manque}>{manque}</span>
          <button type="button" className={css.secondaire} onClick={onFermer}>
            Annuler
          </button>
          <button type="submit" className={css.principal} disabled={manque !== null}>
            {systeme ? 'Enregistrer' : 'Créer'}
          </button>
        </footer>
      </form>

      {confirmation && (
        <AppDialog
          state={confirmation}
          onClose={(valeur) => {
            if (confirmation.type === 'confirm') confirmation.resolve(valeur === true);
            setConfirmation(null);
          }}
        />
      )}
    </div>,
    document.body,
  );
}

function LigneJeu({
  game,
  rang,
  choisi,
  onBasculer,
}: {
  game: Game;
  rang: number | null;
  choisi: boolean;
  onBasculer: (id: string) => void;
}) {
  const teinte = PLATFORM_CSS[game.platform || 'Other'] ?? '#7a8a9a';
  return (
    <li>
      <label className={choisi ? `${css.jeu} ${css.jeuChoisi}` : css.jeu}>
        <input type="checkbox" checked={choisi} onChange={() => onBasculer(game.id)} />
        {/* Le rang annonce l'orbite : le premier jeu coché tourne au plus près du soleil. */}
        <span className={css.jeuRang}>{rang ?? ''}</span>
        <span className={css.jeuTitre}>{game.title}</span>
        <span className={css.jeuLauncher} style={{ color: teinte }}>
          {game.platform}
        </span>
      </label>
    </li>
  );
}
