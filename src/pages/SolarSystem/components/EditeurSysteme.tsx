import { useMemo, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { Game } from '../../../features/types';
import { AppDialog, type DialogState } from '../../../components/AppDialog/AppDialog';
import { useFocusRendu } from '../../../hooks/useFocus';
import { PLATFORM_CSS } from '../constants';
import {
  BORNES,
  COULEURS_SYSTEME,
  NOM_MAX,
  ajouterJeu,
  cleSysteme,
  deplacerJeu,
  jeuxDuSysteme,
  placer,
  retirerJeu,
  type ReglageSysteme,
  type SystemePerso,
} from '../lib/customSystems';
import { ICONES_SYSTEME } from '../lib/iconesSysteme';
import type { EditionScene, EtatEdition } from '../scene/edition';
import { IconeSysteme } from './IconeSysteme';
import css from './EditeurSysteme.module.css';

type Props = {
  systeme: SystemePerso;
  games: Game[];
  edition: RefObject<EditionScene>;
  onEnregistrer: (s: SystemePerso) => void;
  onAnnuler: () => void;
  onSupprimer: (id: string) => void;
};

const reglageDe = (s: SystemePerso): ReglageSysteme => ({
  soleil: s.soleil,
  vitesse: s.vitesse,
  aPlat: s.aPlat,
  placements: s.placements,
});

/**
 * Personnalisation d'un système solaire, en direct.
 *
 * Un panneau et non une modale : on règle ce qu'on regarde. Chaque changement
 * part aussitôt vers la scène comme aperçu — orbites figées, pour placer une
 * planète là où on la voit. Rien n'est enregistré avant « Enregistrer » ;
 * « Annuler » rend le système tel qu'il était.
 */
export function EditeurSysteme({ systeme, games, edition, onEnregistrer, onAnnuler, onSupprimer }: Props) {
  // Pas de piège : le panneau vit à côté de la scène, qui reste utilisable.
  useFocusRendu();
  const parId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const [brouillon, setBrouillon] = useState(systeme);
  // L'aperçu démarre à l'ouverture. L'appel est idempotent : le double rendu du
  // mode strict ne fait que réappliquer le même état.
  const [etat, setEtat] = useState<EtatEdition | null>(() =>
    edition.current.apercu(cleSysteme(systeme), jeuxDuSysteme(systeme, parId), reglageDe(systeme)),
  );
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [confirmation, setConfirmation] = useState<DialogState | null>(null);

  function modifier(suivant: SystemePerso) {
    setBrouillon(suivant);
    setEtat(edition.current.apercu(cleSysteme(suivant), jeuxDuSysteme(suivant, parId), reglageDe(suivant)));
  }

  const jeux = jeuxDuSysteme(brouillon, parId);
  const nomPropre = brouillon.nom.trim();
  const modifie = JSON.stringify(brouillon) !== JSON.stringify(systeme);
  const manque = !nomPropre ? 'Il manque un nom.' : jeux.length === 0 ? 'Au moins un jeu.' : null;

  const q = recherche.trim().toLowerCase();
  const candidats = q
    ? games.filter((g) => !brouillon.jeux.includes(g.id) && g.title.toLowerCase().includes(q)).slice(0, 30)
    : [];

  function enregistrer() {
    if (manque) return;
    onEnregistrer({ ...brouillon, nom: nomPropre.slice(0, NOM_MAX) });
  }

  function confirmer(message: string, action: () => void, danger = false) {
    setConfirmation({
      type: 'confirm',
      message,
      danger,
      resolve: (ok) => {
        if (ok) action();
      },
    });
  }

  function fermer() {
    if (!modifie) onAnnuler();
    else confirmer('Abandonner les modifications en cours ?', onAnnuler);
  }

  return (
    <aside
      className={css.panneau}
      aria-label={`Personnaliser ${systeme.nom}`}
      style={{ '--teinte': brouillon.couleur } as CSSProperties}
    >
      <header className={css.entete}>
        <IconeSysteme nom={brouillon.icone} couleur={brouillon.couleur} taille={26} />
        <input
          className={css.nom}
          value={brouillon.nom}
          maxLength={NOM_MAX}
          onChange={(e) => modifier({ ...brouillon, nom: e.target.value })}
          aria-label="Nom du système"
        />
        <button type="button" className={css.fermer} onClick={fermer} aria-label="Fermer">
          ✕
        </button>
      </header>

      <div className={css.corps}>
        <Section titre="Apparence">
          <div className={css.icones}>
            {ICONES_SYSTEME.map((i) => (
              <button
                key={i.nom}
                type="button"
                title={i.libelle}
                aria-pressed={i.nom === brouillon.icone}
                className={i.nom === brouillon.icone ? `${css.icone} ${css.iconeChoisie}` : css.icone}
                onClick={() => modifier({ ...brouillon, icone: i.nom })}
              >
                <IconeSysteme
                  nom={i.nom}
                  couleur={i.nom === brouillon.icone ? brouillon.couleur : 'currentColor'}
                  taille={16}
                />
              </button>
            ))}
          </div>
          <div className={css.couleurs}>
            {COULEURS_SYSTEME.map((c) => (
              <button
                key={c}
                type="button"
                className={c === brouillon.couleur ? `${css.pastille} ${css.pastilleChoisie}` : css.pastille}
                style={{ background: c }}
                aria-label={`Couleur ${c}`}
                aria-pressed={c === brouillon.couleur}
                onClick={() => modifier({ ...brouillon, couleur: c })}
              />
            ))}
            <input
              type="color"
              className={css.couleurLibre}
              value={brouillon.couleur}
              onChange={(e) => modifier({ ...brouillon, couleur: e.target.value })}
              aria-label="Autre couleur"
            />
          </div>
          <p className={css.note}>Le nom, l'icône et la couleur s'appliquent à l'enregistrement.</p>
        </Section>

        <Section titre="Soleil">
          <Curseur
            libelle="Taille"
            min={BORNES.soleil.min}
            max={BORNES.soleil.max}
            pas={0.05}
            valeur={brouillon.soleil}
            format={(v) => `×${v.toFixed(2)}`}
            onChange={(v) => modifier({ ...brouillon, soleil: v })}
          />
        </Section>

        <Section titre="Orbites">
          <Curseur
            libelle="Vitesse des planètes"
            min={BORNES.vitesse.min}
            max={BORNES.vitesse.max}
            pas={0.05}
            valeur={brouillon.vitesse}
            format={(v) => (v === 0 ? 'figées' : `×${v.toFixed(2)}`)}
            onChange={(v) => modifier({ ...brouillon, vitesse: v })}
          />
          <label className={css.bascule}>
            <input
              type="checkbox"
              checked={brouillon.aPlat}
              onChange={(e) => modifier({ ...brouillon, aPlat: e.target.checked })}
            />
            Toutes les orbites à plat
          </label>
          <p className={css.note}>Pendant l'édition, les planètes restent là où on les place.</p>
        </Section>

        <Section titre={`Planètes · ${jeux.length}`}>
          {jeux.map((g, i) => {
            const e = etat?.planetes.find((p) => p.id === g.id);
            const place = brouillon.placements[g.id] !== undefined;
            const deplie = ouverte === g.id;
            return (
              <div key={g.id} className={deplie ? `${css.planete} ${css.planeteOuverte}` : css.planete}>
                <div className={css.planeteTete}>
                  <button
                    type="button"
                    className={css.planeteNom}
                    onClick={() => setOuverte(deplie ? null : g.id)}
                    aria-expanded={deplie}
                    title="Régler distance, position et taille"
                  >
                    <span className={css.rang}>{i + 1}</span>
                    <span className={css.titreJeu}>{g.title}</span>
                    {place && <span className={css.marquePlace} title="Placement choisi" />}
                  </button>
                  <button
                    type="button"
                    className={css.petit}
                    disabled={i === 0}
                    onClick={() => modifier(deplacerJeu(brouillon, g.id, -1))}
                    aria-label={`Rapprocher ${g.title} du soleil`}
                    title="Orbite précédente"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={css.petit}
                    disabled={i === jeux.length - 1}
                    onClick={() => modifier(deplacerJeu(brouillon, g.id, 1))}
                    aria-label={`Éloigner ${g.title} du soleil`}
                    title="Orbite suivante"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${css.petit} ${css.retirer}`}
                    onClick={() => modifier(retirerJeu(brouillon, g.id))}
                    aria-label={`Retirer ${g.title}`}
                    title="Retirer du système"
                  >
                    ✕
                  </button>
                </div>

                {deplie && e && (
                  <div className={css.reglages}>
                    <Curseur
                      libelle="Distance du soleil"
                      min={Math.ceil(e.distanceMin)}
                      max={Math.max(etat?.distanceMax ?? e.distance, e.distance)}
                      pas={0.5}
                      valeur={e.distance}
                      format={(v) => `×${(v / e.distanceBase).toFixed(2)}`}
                      onChange={(v) => modifier(placer(brouillon, g.id, { distance: v }))}
                    />
                    <Curseur
                      libelle="Position sur l'orbite"
                      min={0}
                      max={359}
                      pas={1}
                      valeur={Math.round(e.angle)}
                      format={(v) => `${Math.round(v)}°`}
                      onChange={(v) => modifier(placer(brouillon, g.id, { angle: v }))}
                    />
                    <Curseur
                      libelle="Taille"
                      min={BORNES.taille.min}
                      max={BORNES.taille.max}
                      pas={0.05}
                      valeur={e.taille}
                      format={(v) => `×${v.toFixed(2)}`}
                      onChange={(v) => modifier(placer(brouillon, g.id, { taille: v }))}
                    />
                    <button
                      type="button"
                      className={css.lien}
                      disabled={!place}
                      onClick={() =>
                        modifier(placer(brouillon, g.id, { distance: undefined, angle: undefined, taille: undefined }))
                      }
                    >
                      Revenir au placement calculé
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <input
            type="search"
            className={css.recherche}
            placeholder="Ajouter un jeu…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Ajouter un jeu"
          />
          {candidats.map((g) => (
            <button
              key={g.id}
              type="button"
              className={css.candidat}
              onClick={() => {
                modifier(ajouterJeu(brouillon, g.id));
                setRecherche('');
              }}
            >
              <span className={css.plus}>+</span>
              <span className={css.titreJeu}>{g.title}</span>
              <span className={css.launcher} style={{ color: PLATFORM_CSS[g.platform || 'Other'] ?? '#7a8a9a' }}>
                {g.platform}
              </span>
            </button>
          ))}
          {q && candidats.length === 0 && <p className={css.note}>Aucun autre jeu ne correspond.</p>}
        </Section>
      </div>

      <footer className={css.pied}>
        <button
          type="button"
          className={css.supprimer}
          onClick={() =>
            confirmer(
              `Supprimer le système « ${systeme.nom} » ? Ses jeux restent dans la bibliothèque et dans leur launcher.`,
              () => onSupprimer(systeme.id),
              true,
            )
          }
        >
          Supprimer
        </button>
        <span className={css.manque}>{manque}</span>
        <button type="button" className={css.secondaire} onClick={fermer}>
          Annuler
        </button>
        <button type="button" className={css.principal} onClick={enregistrer} disabled={!modifie || manque !== null}>
          Enregistrer
        </button>
      </footer>

      {confirmation && (
        <AppDialog
          state={confirmation}
          onClose={(valeur) => {
            if (confirmation.type === 'confirm') confirmation.resolve(valeur === true);
            setConfirmation(null);
          }}
        />
      )}
    </aside>
  );
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className={css.section}>
      <h3 className={css.sectionTitre}>{titre}</h3>
      {children}
    </section>
  );
}

function Curseur({
  libelle,
  min,
  max,
  pas,
  valeur,
  format,
  onChange,
}: {
  libelle: string;
  min: number;
  max: number;
  pas: number;
  valeur: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className={css.curseur}>
      <span className={css.curseurTete}>
        <span>{libelle}</span>
        <span className={css.valeur}>{format(valeur)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
