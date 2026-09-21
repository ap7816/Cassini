import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import type { Game } from '../../../features/types';
import { AppDialog, type DialogState } from '../../../components/AppDialog/AppDialog';
import { usePiegeFocus } from '../../../hooks/useFocus';
import { PLATFORM_CSS } from '../constants';
import { COULEURS_SYSTEME, NOM_MAX, nouveauSysteme, nouvelId, type SystemePerso } from '../lib/customSystems';
import { ICONES_SYSTEME, ICONE_PAR_DEFAUT } from '../lib/iconesSysteme';
import { IconeSysteme } from './IconeSysteme';
import { libelleTag } from '../../../components/Tags/Tags';
import { aLeTag, tagsDeLaBibliotheque } from '../../../features/library/services/tags';
import { ChoixImageIcone } from './ChoixImageIcone';
import { nomPlateforme } from '../../../i18n/plateformes';
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
  const { t } = useTranslation();
  const parId = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const [nom, setNom] = useState(systeme?.nom ?? '');
  const [icone, setIcone] = useState(systeme?.icone ?? ICONE_PAR_DEFAUT);
  // L'image importée reste disponible pendant toute la saisie, même quand on
  // essaie un dessin de la grille : on peut revenir dessus d'un clic.
  const [image, setImage] = useState<string | null>(systeme?.image ?? null);
  const [avecImage, setAvecImage] = useState(Boolean(systeme?.image));
  const imageRetenue = avecImage ? image : null;
  // Une couleur différente pour chaque nouveau système : deux systèmes créés
  // d'affilée ne se confondent pas dans la barre.
  const [couleur, setCouleur] = useState(
    systeme?.couleur ?? COULEURS_SYSTEME[existants.length % COULEURS_SYSTEME.length],
  );
  // Les jeux retirés de la bibliothèque depuis sont écartés d'emblée : on ne
  // pourrait ni les voir ni les décocher.
  const [jeux, setJeux] = useState<string[]>(() => (systeme?.jeux ?? []).filter((id) => parId.has(id)));
  // Source des jeux : une liste choisie, ou tous ceux d'un tag.
  const [tag, setTag] = useState<string | null>(systeme?.tag ?? null);
  const tagsConnus = useMemo(() => tagsDeLaBibliotheque(games), [games]);
  const jeuxDuTag = useMemo(
    () => (tag ? games.filter((g) => aLeTag(g, tag)) : []),
    [games, tag],
  );
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
  const nombreJeux = tag ? jeuxDuTag.length : jeux.length;
  const manque = !nomPropre
    ? t('systems.missingName')
    : nombreJeux === 0
      ? tag
        ? t('systems.missingTagGames')
        : t('systems.missingGames')
      : null;

  function valider(e: FormEvent) {
    e.preventDefault();
    if (manque) return;
    const champs = { nom: nomPropre.slice(0, NOM_MAX), icone, image: imageRetenue, couleur, jeux, tag };
    onEnregistrer(
      systeme ? { ...systeme, ...champs } : nouveauSysteme({ id: nouvelId(existants), ...champs }),
    );
  }

  function demanderSuppression() {
    if (!systeme) return;
    setConfirmation({
      type: 'confirm',
      message: t('systems.deleteConfirm', { name: systeme.nom }),
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
          <div className={css.enteteTexte}>
            <h2 id={titreId} className={css.titre}>
              {systeme ? t('systems.editTitle') : t('systems.newTitle')}
            </h2>
            {/* Aperçu en une ligne : l'icône à sa couleur, le nom, le compte. On
                voit le système prendre forme sans qu'il occupe l'en-tête. */}
            <p className={css.sousTitre}>
              <IconeSysteme
                nom={icone}
                image={imageRetenue}
                couleur={couleur}
                taille={14}
                className={css.sousTitreIcone}
              />
              <span className={nomPropre ? css.sousTitreNom : css.sousTitreVide}>
                {nomPropre || t('systems.untitled')}
              </span>
              <span aria-hidden="true">·</span>
              <span>{t('library.gameCount', { count: nombreJeux })}</span>
            </p>
          </div>
          <button type="button" className={css.fermer} onClick={onFermer} aria-label={t('common.close')}>
            ✕
          </button>
        </header>

        <div className={css.corps}>
          <label className={css.champ}>
            <span className={css.etiquette}>{t('systems.name')}</span>
            <input
              ref={champNom}
              className={css.saisie}
              value={nom}
              maxLength={NOM_MAX}
              onChange={(e) => setNom(e.target.value)}
              placeholder={t('systems.namePlaceholder')}
            />
          </label>

          <div className={css.champ}>
            <span className={css.etiquette}>{t('systems.icon')}</span>
            <div className={css.icones} role="radiogroup" aria-label={t('systems.icon')}>
              {ICONES_SYSTEME.map((i) => {
                const choisie = !imageRetenue && i.nom === icone;
                return (
                  <button
                    key={i.nom}
                    type="button"
                    role="radio"
                    aria-checked={choisie}
                    title={t(`systems.icons.${i.nom}`)}
                    className={choisie ? `${css.icone} ${css.iconeChoisie}` : css.icone}
                    onClick={() => {
                      setIcone(i.nom);
                      setAvecImage(false);
                    }}
                  >
                    <IconeSysteme nom={i.nom} couleur={choisie ? couleur : 'currentColor'} taille={20} />
                  </button>
                );
              })}
            </div>
            <ChoixImageIcone
              image={image}
              active={avecImage}
              onImage={(nouvelle) => {
                setImage(nouvelle);
                setAvecImage(true);
              }}
              onActiver={() => setAvecImage(true)}
              onRetirer={() => {
                setImage(null);
                setAvecImage(false);
              }}
            />
          </div>

          <div className={css.champ}>
            <span className={css.etiquette}>{t('systems.color')}</span>
            <div className={css.couleurs}>
              {COULEURS_SYSTEME.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === couleur ? `${css.pastille} ${css.pastilleChoisie}` : css.pastille}
                  style={{ background: c }}
                  onClick={() => setCouleur(c)}
                  aria-label={t('systems.colorNamed', { color: c })}
                  aria-pressed={c === couleur}
                />
              ))}
              <input
                type="color"
                className={css.couleurLibre}
                value={couleur}
                onChange={(e) => setCouleur(e.target.value)}
                aria-label={t('systems.otherColor')}
                title={t('systems.otherColor')}
              />
            </div>
          </div>

          <div className={`${css.champ} ${css.champJeux}`}>
            <span className={css.etiquette}>
              {t('systems.games')}
              <span className={css.compte}>{nombreJeux}</span>
            </span>

            {/* Deux façons de garnir un système : cocher les jeux un à un, ou
                suivre un tag — le système se remplit alors tout seul. */}
            {tagsConnus.length > 0 && (
              <div className={css.source} role="group" aria-label={t('systems.source')}>
                <button
                  type="button"
                  className={tag === null ? `${css.sourceChoix} ${css.sourceActif}` : css.sourceChoix}
                  onClick={() => setTag(null)}
                  aria-pressed={tag === null}
                >
                  {t('systems.sourceChosen')}
                </button>
                {tagsConnus.map(({ tag: nom, nombre }) => (
                  <button
                    key={nom}
                    type="button"
                    className={tag === nom ? `${css.sourceChoix} ${css.sourceActif}` : css.sourceChoix}
                    onClick={() => setTag(nom)}
                    aria-pressed={tag === nom}
                  >
                    {libelleTag(nom, t)} <span className={css.compte}>{nombre}</span>
                  </button>
                ))}
              </div>
            )}

            {tag !== null ? (
              <>
                <p className={css.aide}>{t('systems.tagSource', { tag: libelleTag(tag, t) })}</p>
                <ul className={css.jeux}>
                  {jeuxDuTag.map((g, i) => (
                    <LigneJeu key={g.id} game={g} rang={i + 1} choisi onBasculer={() => {}} fige />
                  ))}
                  {jeuxDuTag.length === 0 && <li className={css.vide}>{t('systems.noGameWithTag')}</li>}
                </ul>
              </>
            ) : (
            <>
            <input
              className={css.saisie}
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={t('systems.searchLibrary')}
              aria-label={t('systems.searchGame')}
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
                <li className={css.vide}>{t('systems.noGameMatches')}</li>
              )}
            </ul>
            </>
            )}
          </div>
        </div>

        <footer className={css.pied}>
          {systeme && (
            <button type="button" className={css.supprimer} onClick={demanderSuppression}>
              {t('common.delete')}
            </button>
          )}
          <span className={css.manque}>{manque}</span>
          <button type="button" className={css.secondaire} onClick={onFermer}>
            {t('dialog.cancel')}
          </button>
          <button type="submit" className={css.principal} disabled={manque !== null}>
            {systeme ? t('common.save') : t('common.create')}
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
  fige = false,
}: {
  game: Game;
  rang: number | null;
  choisi: boolean;
  onBasculer: (id: string) => void;
  /** Système de tag : la case montre l'appartenance, elle ne la décide pas. */
  fige?: boolean;
}) {
  const { t } = useTranslation();
  const teinte = PLATFORM_CSS[game.platform || 'Other'] ?? '#7a8a9a';
  return (
    <li>
      <label className={choisi ? `${css.jeu} ${css.jeuChoisi}` : css.jeu}>
        <input
          type="checkbox"
          checked={choisi}
          disabled={fige}
          onChange={() => onBasculer(game.id)}
        />
        {/* Le rang annonce l'orbite : le premier jeu coché tourne au plus près du soleil. */}
        <span className={css.jeuRang}>{rang ?? ''}</span>
        <span className={css.jeuTitre}>{game.title}</span>
        <span className={css.jeuLauncher} style={{ '--pf': teinte } as CSSProperties}>
          {nomPlateforme(game.platform, t)}
        </span>
      </label>
    </li>
  );
}
