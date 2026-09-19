import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Game } from '../../../features/types';
import { AppDialog, type DialogState } from '../../../components/AppDialog/AppDialog';
import { useFocusRendu } from '../../../hooks/useFocus';
import { PLATFORM_CSS } from '../constants';
import {
  ANNEAU_AUCUN,
  BORNES,
  COULEURS_SYSTEME,
  NOM_MAX,
  REGLAGE_DEFAUT,
  ajouterJeu,
  deplacerJeu,
  jeuxDuSysteme,
  placer,
  reglageDeSysteme,
  retirerJeu,
  trierJeux,
  type TriSysteme,
  type SystemePerso,
} from '../lib/customSystems';
import { ICONES_SYSTEME } from '../lib/iconesSysteme';
import { formaterNombre } from '../../../i18n/formats';
import { nomPlateforme } from '../../../i18n/plateformes';
import type { EditionScene, EtatEdition } from '../scene/edition';
import { IconeSysteme } from './IconeSysteme';
import { ChoixImageIcone } from './ChoixImageIcone';
import css from './EditeurSysteme.module.css';

type Props = {
  /** Clé du système dans la galaxie. */
  cle: string;
  /**
   * Système d'un launcher : ni son nom, ni son icône, ni ses jeux ne se
   * choisissent — la bibliothèque les donne. Tout le reste se règle.
   */
  launcher?: boolean;
  systeme: SystemePerso;
  games: Game[];
  edition: RefObject<EditionScene>;
  onEnregistrer: (s: SystemePerso) => void;
  onAnnuler: () => void;
  onSupprimer: (id: string) => void;
};

/**
 * Personnalisation d'un système solaire, en direct.
 *
 * Un panneau et non une modale : on règle ce qu'on regarde. Chaque changement
 * part aussitôt vers la scène comme aperçu — orbites figées, pour placer une
 * planète là où on la voit. Rien n'est enregistré avant « Enregistrer » ;
 * « Annuler » rend le système tel qu'il était.
 */
export function EditeurSysteme({
  cle,
  launcher = false,
  systeme,
  games,
  edition,
  onEnregistrer,
  onAnnuler,
  onSupprimer,
}: Props) {
  // Pas de piège : le panneau vit à côté de la scène, qui reste utilisable.
  useFocusRendu();
  const { t, i18n } = useTranslation();
  const facteur = (v: number) => `×${formaterNombre(v, i18n.language, 2)}`;
  const parId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const [brouillon, setBrouillon] = useState(systeme);
  // L'image importée reste proposée même quand un dessin la remplace dans le
  // brouillon : la reprendre ne demande pas de la réimporter.
  const [imageGardee, setImageGardee] = useState<string | null>(systeme.image);
  // L'aperçu démarre à l'ouverture. L'appel est idempotent : le double rendu du
  // mode strict ne fait que réappliquer le même état.
  const [etat, setEtat] = useState<EtatEdition | null>(() =>
    edition.current.apercu(cle, jeuxDuSysteme(systeme, parId), reglageDeSysteme(systeme)),
  );
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [confirmation, setConfirmation] = useState<DialogState | null>(null);

  function modifier(suivant: SystemePerso) {
    brouillonRef.current = suivant;
    setBrouillon(suivant);
    setEtat(edition.current.apercu(cle, jeuxDuSysteme(suivant, parId), reglageDeSysteme(suivant)));
  }

  // Planètes glissées dans la scène. Relu par référence : les glissements
  // arrivent plus vite que React ne rend, chacun doit partir du précédent.
  const brouillonRef = useRef(brouillon);
  const etatRef = useRef(etat);
  const modifierRef = useRef(modifier);
  useLayoutEffect(() => {
    etatRef.current = etat;
    modifierRef.current = modifier;
  });
  useEffect(() => {
    const scene = edition.current;
    scene.ecouterGlissement((g) => {
      const e = etatRef.current?.planetes.find((p) => p.id === g.id);
      const max = Math.max(etatRef.current?.distanceMax ?? g.distance, e?.distance ?? 0);
      const distance = Math.min(Math.max(g.distance, e?.distanceMin ?? 0), max);
      modifierRef.current(placer(brouillonRef.current, g.id, { distance, angle: Math.round(g.angle) % 360 }));
      // Les réglages de la planète s'ouvrent : on voit ses curseurs suivre.
      setOuverte(g.id);
    });
    return () => scene.ecouterGlissement(null);
  }, [edition]);

  const jeux = jeuxDuSysteme(brouillon, parId);
  const nomPropre = brouillon.nom.trim();
  const modifie = JSON.stringify(brouillon) !== JSON.stringify(systeme);
  const manque = !nomPropre ? t('systems.missingName') : jeux.length === 0 ? t('systems.missingGames') : null;

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
    else confirmer(t('systems.editor.discardChanges'), onAnnuler);
  }

  return (
    <aside
      className={css.panneau}
      aria-label={t('systems.editor.customize', { name: systeme.nom })}
      style={{ '--teinte': brouillon.couleur } as CSSProperties}
    >
      <header className={css.entete}>
        {launcher ? (
          <h2 className={css.nom}>{systeme.nom}</h2>
        ) : (
          <>
            <IconeSysteme nom={brouillon.icone} image={brouillon.image} couleur={brouillon.couleur} taille={26} />
            <input
              className={css.nom}
              value={brouillon.nom}
              maxLength={NOM_MAX}
              onChange={(e) => modifier({ ...brouillon, nom: e.target.value })}
              aria-label={t('systems.editor.systemName')}
            />
          </>
        )}
        <button type="button" className={css.fermer} onClick={fermer} aria-label={t('common.close')}>
          ✕
        </button>
      </header>

      <div className={css.corps}>
        {launcher && <p className={css.note}>{t('systems.editor.launcherNote')}</p>}
        {!launcher && (
        <Section titre={t('systems.editor.appearance')}>
          <div className={css.icones}>
            {ICONES_SYSTEME.map((i) => (
              <button
                key={i.nom}
                type="button"
                title={t(`systems.icons.${i.nom}`)}
                aria-pressed={!brouillon.image && i.nom === brouillon.icone}
                className={!brouillon.image && i.nom === brouillon.icone ? `${css.icone} ${css.iconeChoisie}` : css.icone}
                onClick={() => modifier({ ...brouillon, icone: i.nom, image: null })}
              >
                <IconeSysteme
                  nom={i.nom}
                  couleur={!brouillon.image && i.nom === brouillon.icone ? brouillon.couleur : 'currentColor'}
                  taille={16}
                />
              </button>
            ))}
          </div>
          <ChoixImageIcone
            image={imageGardee}
            active={brouillon.image !== null}
            onImage={(nouvelle) => {
              setImageGardee(nouvelle);
              modifier({ ...brouillon, image: nouvelle });
            }}
            onActiver={() => modifier({ ...brouillon, image: imageGardee })}
            onRetirer={() => {
              setImageGardee(null);
              modifier({ ...brouillon, image: null });
            }}
          />
          <div className={css.couleurs}>
            {COULEURS_SYSTEME.map((c) => (
              <button
                key={c}
                type="button"
                className={c === brouillon.couleur ? `${css.pastille} ${css.pastilleChoisie}` : css.pastille}
                style={{ background: c }}
                aria-label={t('systems.colorNamed', { color: c })}
                aria-pressed={c === brouillon.couleur}
                onClick={() => modifier({ ...brouillon, couleur: c })}
              />
            ))}
            <input
              type="color"
              className={css.couleurLibre}
              value={brouillon.couleur}
              onChange={(e) => modifier({ ...brouillon, couleur: e.target.value })}
              aria-label={t('systems.otherColor')}
            />
          </div>
          <p className={css.note}>{t('systems.editor.appliesOnSave')}</p>
        </Section>
        )}

        <Section titre={t('systems.editor.sun')}>
          <Curseur
            libelle={t('systems.editor.size')}
            min={BORNES.soleil.min}
            max={BORNES.soleil.max}
            pas={0.05}
            valeur={brouillon.soleil}
            format={facteur}
            onChange={(v) => modifier({ ...brouillon, soleil: v })}
          />

          {/* Distincte de la couleur du système, qui teinte l'étiquette et
              l'icône : un système peut porter un repère vif sans que son
              étoile soit verte. */}
          <label className={css.bascule}>
            <input
              type="checkbox"
              checked={brouillon.couleurSoleil !== null}
              onChange={(e) =>
                modifier({
                  ...brouillon,
                  couleurSoleil: e.target.checked ? brouillon.couleur : null,
                })
              }
            />
            {t('systems.editor.sunColorOwn')}
          </label>
          {brouillon.couleurSoleil !== null && (
            <div className={css.couleurs}>
              {COULEURS_SYSTEME.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={brouillon.couleurSoleil === c ? `${css.pastille} ${css.pastilleChoisie}` : css.pastille}
                  style={{ background: c }}
                  onClick={() => modifier({ ...brouillon, couleurSoleil: c })}
                  aria-label={t('systems.colorNamed', { color: c })}
                  aria-pressed={brouillon.couleurSoleil === c}
                />
              ))}
              <input
                type="color"
                className={css.couleurLibre}
                value={brouillon.couleurSoleil}
                onChange={(e) => modifier({ ...brouillon, couleurSoleil: e.target.value })}
                aria-label={t('systems.editor.sunColor')}
              />
            </div>
          )}
          <Curseur
            libelle={t('systems.editor.stars')}
            min={BORNES.etoiles.min}
            max={BORNES.etoiles.max}
            pas={0.25}
            valeur={brouillon.etoiles}
            format={(v) => (v === 0 ? t('systems.editor.starsNone') : facteur(v))}
            onChange={(v) => modifier({ ...brouillon, etoiles: v })}
          />
        </Section>

        <Section titre={t('systems.editor.orbits')}>
          <Curseur
            libelle={t('systems.editor.planetSpeed')}
            min={BORNES.vitesse.min}
            max={BORNES.vitesse.max}
            pas={0.05}
            valeur={brouillon.vitesse}
            format={(v) => (v === 0 ? t('systems.editor.frozen') : facteur(v))}
            onChange={(v) => modifier({ ...brouillon, vitesse: v })}
          />
          <label className={css.bascule}>
            <input
              type="checkbox"
              checked={brouillon.aPlat}
              onChange={(e) => modifier({ ...brouillon, aPlat: e.target.checked })}
            />
            {t('systems.editor.allFlat')}
          </label>
          <p className={css.note}>{t('systems.editor.editingNote')}</p>
          <p className={css.note}>{t('systems.editor.dragNote')}</p>
        </Section>

        <Section titre={t('systems.editor.planets', { n: jeux.length })}>
          {!launcher && jeux.length > 1 && (
            <div className={css.tri}>
              <span className={css.triTitre}>{t('systems.editor.sort')}</span>
              <div className={css.triBoutons}>
                {([
                  ['az', 'systems.editor.sortAz'],
                  ['za', 'systems.editor.sortZa'],
                  ['taille', 'systems.editor.sortSize'],
                  ['recent', 'systems.editor.sortRecent'],
                ] as Array<[TriSysteme, string]>).map(([critere, cle]) => (
                  <button
                    key={critere}
                    type="button"
                    className={css.petitLarge}
                    onClick={() => modifier(trierJeux(brouillon, parId, critere))}
                  >
                    {t(cle)}
                  </button>
                ))}
              </div>
              <p className={css.note}>{t('systems.editor.sortNote')}</p>
            </div>
          )}
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
                    title={t('systems.editor.planetSettings')}
                  >
                    <span className={css.rang}>{i + 1}</span>
                    <span className={css.titreJeu}>{g.title}</span>
                    {place && <span className={css.marquePlace} title={t('systems.editor.customPlacement')} />}
                  </button>
                  {!launcher && (
                  <>
                  <button
                    type="button"
                    className={css.petit}
                    disabled={i === 0}
                    onClick={() => modifier(deplacerJeu(brouillon, g.id, -1))}
                    aria-label={t('systems.editor.moveCloser', { title: g.title })}
                    title={t('systems.editor.previousOrbit')}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={css.petit}
                    disabled={i === jeux.length - 1}
                    onClick={() => modifier(deplacerJeu(brouillon, g.id, 1))}
                    aria-label={t('systems.editor.moveAway', { title: g.title })}
                    title={t('systems.editor.nextOrbit')}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${css.petit} ${css.retirer}`}
                    onClick={() => modifier(retirerJeu(brouillon, g.id))}
                    aria-label={t('systems.editor.removeGame', { title: g.title })}
                    title={t('systems.editor.removeFromSystem')}
                  >
                    ✕
                  </button>
                  </>
                  )}
                </div>

                {deplie && e && (
                  <div className={css.reglages}>
                    <Curseur
                      libelle={t('systems.editor.sunDistance')}
                      min={Math.ceil(e.distanceMin)}
                      max={Math.max(etat?.distanceMax ?? e.distance, e.distance)}
                      pas={0.5}
                      valeur={e.distance}
                      format={(v) => facteur(v / e.distanceBase)}
                      onChange={(v) => modifier(placer(brouillon, g.id, { distance: v }))}
                    />
                    <Curseur
                      libelle={t('systems.editor.orbitPosition')}
                      min={0}
                      max={359}
                      pas={1}
                      valeur={Math.round(e.angle)}
                      format={(v) => `${Math.round(v)}°`}
                      onChange={(v) => modifier(placer(brouillon, g.id, { angle: v }))}
                    />
                    <Curseur
                      libelle={t('systems.editor.size')}
                      min={BORNES.taille.min}
                      max={BORNES.taille.max}
                      pas={0.05}
                      valeur={e.taille}
                      format={facteur}
                      onChange={(v) => modifier(placer(brouillon, g.id, { taille: v }))}
                    />
                    <ChoixAnneau
                      valeur={brouillon.placements[g.id]?.anneau}
                      onChange={(anneau) => modifier(placer(brouillon, g.id, { anneau }))}
                    />
                    <button
                      type="button"
                      className={css.lien}
                      disabled={!place}
                      onClick={() =>
                        modifier(
                          placer(brouillon, g.id, {
                            distance: undefined,
                            angle: undefined,
                            taille: undefined,
                            anneau: undefined,
                          }),
                        )
                      }
                    >
                      {t('systems.editor.resetPlacement')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {!launcher && (
          <>
          <input
            type="search"
            className={css.recherche}
            placeholder={t('systems.editor.addGamePlaceholder')}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label={t('systems.editor.addGame')}
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
                {nomPlateforme(g.platform, t)}
              </span>
            </button>
          ))}
          {q && candidats.length === 0 && <p className={css.note}>{t('systems.editor.noOtherGame')}</p>}
          </>
          )}
        </Section>
      </div>

      <footer className={css.pied}>
        {launcher ? (
          // Rien à supprimer : on rend au système son état calculé. L'aperçu
          // le montre aussitôt, et « Enregistrer » le confirme.
          <button
            type="button"
            className={css.supprimer}
            onClick={() => modifier({ ...brouillon, ...REGLAGE_DEFAUT })}
          >
            {t('systems.editor.reset')}
          </button>
        ) : (
          <button
            type="button"
            className={css.supprimer}
            onClick={() =>
              confirmer(
                t('systems.deleteConfirm', { name: systeme.nom }),
                () => onSupprimer(systeme.id),
                true,
              )
            }
          >
            {t('common.delete')}
          </button>
        )}
        <span className={css.manque}>{manque}</span>
        <button type="button" className={css.secondaire} onClick={fermer}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className={css.principal} onClick={enregistrer} disabled={!modifie || manque !== null}>
          {t('common.save')}
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

/**
 * Anneaux d'une planète : ceux du tirage, aucun, ou une couleur.
 *
 * « Automatique » laisse la planète telle que la scène l'a tirée — un anneau
 * sur trois environ. Une couleur en donne à une planète qui n'en avait pas.
 */
function ChoixAnneau({ valeur, onChange }: { valeur: string | undefined; onChange: (v: string | undefined) => void }) {
  const { t } = useTranslation();
  const couleur = valeur !== undefined && valeur !== ANNEAU_AUCUN ? valeur : null;
  return (
    <div className={css.anneau} role="group" aria-label={t('systems.editor.rings')}>
      <span className={css.curseurTete}>{t('systems.editor.rings')}</span>
      <div className={css.couleurs}>
        <button
          type="button"
          className={valeur === undefined ? `${css.petitLarge} ${css.petitChoisi}` : css.petitLarge}
          aria-pressed={valeur === undefined}
          onClick={() => onChange(undefined)}
        >
          {t('systems.editor.ringsAuto')}
        </button>
        <button
          type="button"
          className={valeur === ANNEAU_AUCUN ? `${css.petitLarge} ${css.petitChoisi}` : css.petitLarge}
          aria-pressed={valeur === ANNEAU_AUCUN}
          onClick={() => onChange(ANNEAU_AUCUN)}
        >
          {t('systems.editor.ringsNone')}
        </button>
      </div>
      <div className={css.couleurs}>
        {COULEURS_SYSTEME.map((c) => (
          <button
            key={c}
            type="button"
            className={couleur === c ? `${css.pastille} ${css.pastilleChoisie}` : css.pastille}
            style={{ background: c }}
            aria-label={t('systems.editor.ringsColor', { color: c })}
            aria-pressed={couleur === c}
            onClick={() => onChange(c)}
          />
        ))}
        <input
          type="color"
          className={css.couleurLibre}
          value={couleur ?? '#c8b48a'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t('systems.editor.ringsOtherColor')}
        />
      </div>
    </div>
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
