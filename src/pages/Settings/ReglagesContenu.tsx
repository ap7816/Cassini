import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useDialog } from '../../hooks/useDialog';
import { AppDialog } from '../../components/AppDialog/AppDialog';
import { useToast } from '../../features/toast/ToastContext';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { clearAllStorage } from '../../services/storage';
import { SettingRow } from './components/SettingRow';
import css from './SettingsPage.module.css';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { open as ouvrirFichier } from '@tauri-apps/plugin-dialog';
import {
  aUneMusiqueFournie,
  abonnerMusiqueEvenement,
  arreterMusiqueEvenement,
  jouerMusiqueEvenement,
  musiqueEnCours,
  reglerMusiquesEvenements,
  reglerVolumesEvenements,
  type EvenementMusical,
} from '../../features/evenements/musiqueEvenement';
import { useAmbientPlayer } from '../../features/ambient/useAmbientPlayer';
import { ListeSucces } from '../../features/succes/ListeSucces';
import {
  DENSITES,
  ECHELLES,
  LIMITES_IPS,
  ORDRE_PRESETS,
  PRESETS,
  densiteLaPlusProche,
  presetDe,
  type Preset,
} from '../../features/settings/qualite';
import { SUCCES } from '../../features/succes/succes';
import { clearCoverCache } from '../../features/library/services/coverArtService';
import { LANGUES, estLangue, getCurrentLanguage, setLanguage, type Langue } from '../../i18n';
import { usePatchNotes } from '../../features/patchNotes/PatchNotesContext';
import type { PageRappelable } from '../../features/types';
import { loadGamesFromStorage } from '../../features/library/services/libraryStorage';
import { nomPlateforme } from '../../i18n/plateformes';
import { cleSysteme } from '../SolarSystem/lib/customSystems';
import { chargerSystemesPerso } from '../SolarSystem/lib/customSystemsStorage';
import { OUVERTURE_AUTO, OUVERTURE_DERNIER } from '../SolarSystem/lib/ouverture';
import { estModeTheme } from '../../features/settings/theme';

// Dimensions maximales et qualité JPEG pour la compression des images de fond
const MAX_DIM = 1920;
const JPEG_QUALITY = 0.85;

// Redimensionne et compresse une image choisie par l'utilisateur en JPEG base64 data-URL
function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width >= height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not available'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

// Palette des couleurs d'accent prédéfinies disponibles dans les paramètres
const ACCENT_COLORS: { labelKey: string; value: string }[] = [
  { labelKey: 'settings.colorNeutre', value: '#e5e7eb' },
  { labelKey: 'settings.colorViolet', value: '#8b5cf6' },
  { labelKey: 'settings.colorBleu', value: '#3b82f6' },
  { labelKey: 'settings.colorCyan', value: '#06b6d4' },
  { labelKey: 'settings.colorVert', value: '#22c55e' },
  { labelKey: 'settings.colorOrange', value: '#f97316' },
  { labelKey: 'settings.colorRouge', value: '#ef4444' },
];

// Vérifie si une couleur hex correspond à une couleur prédéfinie de la palette
const isPresetColor = (color: string) => ACCENT_COLORS.some((c) => c.value === color);

/**
 * Pages dont l'entrée peut être rappelée dans la barre des launchers, dans
 * l'ordre où elles s'y rangent.
 */
const PAGES_RAPPELABLES: { reglage: PageRappelable; labelKey: string; hintKey: string }[] = [
  {
    reglage: 'showLibrary',
    labelKey: 'settings.showLibraryLabel',
    hintKey: 'settings.showLibraryHint',
  },
  {
    reglage: 'showLaunchers',
    labelKey: 'settings.showLaunchersLabel',
    hintKey: 'settings.showLaunchersHint',
  },
];

type Props = {
  /** Filtre saisi : ne restent que les réglages dont le libellé correspond. */
  recherche: string;
};

/**
 * Contenu des réglages : les cartes, leurs onglets et leur filtrage.
 *
 * Séparé de sa présentation pour vivre dans deux coquilles sans être écrit deux
 * fois — la page, et le panneau posé sur l'application. Il ne porte donc ni
 * titre ni mise en page propre : l'écart entre ses cartes vient de la coquille,
 * et le champ de recherche lui est passé, l'une le tenant de l'URL et l'autre de
 * son propre état.
 */
export function ReglagesContenu({ recherche }: Props) {
  const { t } = useTranslation();

  /**
   * Ouvre un dialogue natif pour choisir la musique des événements rares.
   *
   * On ne retient que le chemin : le fichier reste où il est, l'application ne
   * le recopie pas. Hors Tauri — ou si l'utilisateur renonce — rien ne change.
   */
  async function choisirMusiqueEvenement(evenement: EvenementMusical): Promise<void> {
    try {
      const choix = await ouvrirFichier({
        multiple: false,
        filters: [
          {
            name: t('settings.musiqueEvenementFiltre'),
            extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a'],
          },
        ],
      });
      if (typeof choix === 'string') {
        setMusiqueEvenement(evenement, choix);
        // Le module qui joue ne lit pas les réglages : on les lui porte, sans
        // quoi le bouton d'écoute ci-dessous ferait entendre l'ancien morceau.
        reglerMusiquesEvenements({ ...settings.musiquesEvenements, [evenement]: choix });
      }
    } catch {
      // Un clic qui ne fait rien et ne dit rien n'est pas un réglage, c'est
      // une panne silencieuse.
      toast.error(t('errors.dialogUnavailable'));
    }
  }

  /**
   * Ce qui joue en ce moment, pour que le bouton sache s'il lance ou s'il
   * arrête. Le morceau peut aussi se terminer tout seul : on s'abonne plutôt
   * que de deviner.
   */
  const [ecoute, setEcoute] = useState(musiqueEnCours);
  useEffect(() => abonnerMusiqueEvenement(() => setEcoute(musiqueEnCours())), []);

  /** Fait entendre le morceau, ou le coupe s'il joue déjà. */
  function ecouterMusiqueEvenement(evenement: EvenementMusical): void {
    if (ecoute === evenement) {
      arreterMusiqueEvenement();
      return;
    }
    reglerMusiquesEvenements(settings.musiquesEvenements);
    reglerVolumesEvenements(settings.volumesEvenements);
    arreterMusiqueEvenement();
    jouerMusiqueEvenement(evenement);
  }

  /** Retire le morceau d'un événement : le dossier reprend la main. */
  function retirerMusiqueEvenement(evenement: EvenementMusical): void {
    setMusiqueEvenement(evenement, null);
    reglerMusiquesEvenements({ ...settings.musiquesEvenements, [evenement]: null });
  }

  /**
   * Le volume d'un événement.
   *
   * Porté au module en même temps qu'au réglage : on tire le curseur en
   * écoutant, et ce qu'on entend doit suivre la main.
   */
  function reglerVolume(evenement: EvenementMusical, volume: number): void {
    setVolumeEvenement(evenement, volume);
    reglerVolumesEvenements({ ...settings.volumesEvenements, [evenement]: volume });
  }

  /**
   * Le nom seul, pour l'afficher sans étaler le chemin de la machine.
   *
   * Les deux séparateurs, et c'est tout l'intérêt : sur Windows le dialogue
   * rend un chemin à contre-barres, qu'une coupure sur la seule barre oblique
   * laissait entier dans la carte.
   */
  function nomDeFichier(chemin: string): string {
    return chemin.split(/[\\/]/).pop() || chemin;
  }
  const q = recherche.trim().toLowerCase();

  // Retourne true si au moins une des clés i18n correspond à la recherche courante (ou si pas de recherche)
  function matches(...keys: string[]): boolean {
    if (!q) return true;
    return keys.some((k) => t(k).toLowerCase().includes(q));
  }
  const { dlgState, closeDialog, confirm } = useDialog();
  const toast = useToast();
  const { openPatchNotes } = usePatchNotes();

  const {
    settings,
    setBackgroundImageDataUrl,
    clearBackgroundImage,
    setAccentColor,
    setBgOverlayOpacity,
    setSgdbApiKey,
    setAutostart,
    setRunInBackground,
    setPlanetSizeByPlaytime,
    setCielVivant,
    setEvenementsCiel,
    setMusiqueEvenement,
    setVolumeEvenement,
    setEchelleRendu,
    setLimiteIPS,
    setAfficherIPS,
    setDebordement,
    setDensiteCiel,
    setStartSystem,
    setThemeMode,
    setPageVisible,
  } = useAppSettings();

  /**
   * Le préréglage de qualité, **déduit** des valeurs et jamais stocké.
   *
   * Rien à tenir à jour, donc rien qui puisse mentir : l'étiquette ne peut pas
   * dire « Élevé » pendant que les réglages disent autre chose.
   */
  const preset = presetDe({
    echelleRendu: settings.echelleRendu,
    densiteCiel: settings.densiteCiel,
    debordement: settings.debordement,
    cielVivant: settings.cielVivant,
  });

  /** Choisir un préréglage écrit ses quatre valeurs d'un coup. */
  function appliquerPreset(nom: Preset): void {
    const p = PRESETS[nom];
    setEchelleRendu(p.echelleRendu);
    setDensiteCiel(p.densiteCiel);
    setDebordement(p.debordement);
    setCielVivant(p.cielVivant);
  }

  const ambient = useAmbientPlayer();

  const inputRef = useRef<HTMLInputElement | null>(null);
  // Champ toujours vide au chargement : la clé enregistrée n'est jamais relue
  const [sgdbKeyInput, setSgdbKeyInput] = useState('');
  const [sgdbKeySaved, setSgdbKeySaved] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [currentLang, setCurrentLang] = useState<Langue>(getCurrentLanguage);
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'upToDate' | 'downloading' | 'error'
  >('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [webviewCacheCleared, setWebviewCacheCleared] = useState(false);
  const [tab, setTab] = useState<'perso' | 'graphisme' | 'succes' | 'params'>('perso');

  // Vérifie les mises à jour disponibles et propose de télécharger+installer si une existe
  async function handleCheckUpdate() {
    setUpdateStatus('checking');
    try {
      // Sans en-tête d'authentification : le dépôt des mises à jour est
      // public. Voir `useUpdater.ts` pour le jeton qui vivait ici.
      const update = await check();
      if (!update?.available) {
        setUpdateStatus('upToDate');
        setTimeout(() => setUpdateStatus('idle'), 3000);
        return;
      }
      setUpdateStatus('idle');
      const yes = await confirm(
        t('updater.confirmMessage', { version: update.version, body: update.body ?? '' }),
      );
      if (!yes) return;
      setUpdateStatus('downloading');
      setDownloadProgress(0);
      let downloaded = 0;
      let total = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
          console.info('[updater] download started, size:', total);
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (total > 0) setDownloadProgress(Math.round((downloaded / total) * 100));
        } else if (event.event === 'Finished') {
          console.info('[updater] download finished');
        }
      });
      await relaunch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[update] erreur:', msg);
      setUpdateError(msg);
      setUpdateStatus('error');
      setTimeout(() => {
        setUpdateStatus('idle');
        setUpdateError(null);
      }, 6000);
    }
  }

  // Charge, compresse et applique une image de fond choisie par l'utilisateur
  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.bgErrorType'));
      return;
    }

    try {
      const dataUrl = await compressImageFile(file);
      setBackgroundImageDataUrl(dataUrl);
    } catch {
      toast.error(t('settings.bgErrorLoad'));
    }
  }

  // Enregistre la clé dans le coffre système puis vide immédiatement le champ :
  // la valeur ne reste ni à l'écran, ni dans l'état React.
  async function handleSaveSgdbKey() {
    await setSgdbApiKey(sgdbKeyInput.trim());
    setSgdbKeyInput('');
    setSgdbKeySaved(true);
    setTimeout(() => setSgdbKeySaved(false), 2000);
  }

  // Vide le cache SteamGridDB et supprime la clé du coffre système
  async function handleClearCache() {
    clearCoverCache();
    await setSgdbApiKey('');
    setSgdbKeyInput('');
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  }

  // Vide le cache de navigation de la WebView (cookies, stockage, etc.)
  async function handleClearWebviewCache() {
    await getCurrentWebviewWindow().clearAllBrowsingData();
    setWebviewCacheCleared(true);
    setTimeout(() => setWebviewCacheCleared(false), 2000);
  }

  // Efface toutes les données utilisateur après confirmation.
  // La clé SteamGridDB vit désormais dans le coffre système : elle survit
  // sans qu'on ait à la relire ni à la réécrire ici.
  async function handleClearAllData() {
    const ok = await confirm(t('settings.clearAllConfirm'), { danger: true });
    if (!ok) return;
    await clearAllStorage();
    window.location.reload();
  }

  // Change la langue de l'interface et met à jour l'état local
  function handleLanguageChange(lang: Langue) {
    setLanguage(lang);
    setCurrentLang(lang);
  }

  return (
    <>
      {dlgState && <AppDialog state={dlgState} onClose={closeDialog} />}

      {!q && (
        <div className={css.tabs}>
          <button
            type="button"
            className={[css.tab, tab === 'perso' ? css.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setTab('perso')}
          >
            {t('settings.tabPerso')}
          </button>
          <button
            type="button"
            className={[css.tab, tab === 'graphisme' ? css.tabActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => setTab('graphisme')}
          >
            {t('settings.tabGraphisme')}
          </button>
          <button
            type="button"
            className={[css.tab, tab === 'succes' ? css.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setTab('succes')}
          >
            {t('settings.tabSucces')}
          </button>
          <button
            type="button"
            className={[css.tab, tab === 'params' ? css.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setTab('params')}
          >
            {t('settings.tabParams')}
          </button>
        </div>
      )}

      {/* ── Personnalisation ─────────────────────────────────── */}

      {/* Apparence */}
      {(tab === 'perso' || !!q) &&
        matches(
          'settings.themeLabel',
          'settings.themeHint',
          'settings.bgLabel',
          'settings.bgHint',
          'settings.overlayLabel',
          'settings.overlayHint',
          'settings.accentLabel',
          'settings.accentHint',
          'settings.languageLabel',
          'settings.languageHint',
        ) && (
          <div className={css.card}>
            {/* Image de fond */}
            <SettingRow labelKey="settings.themeLabel" hintKey="settings.themeHint" query={q}>
              <select
                className={css.langSelect}
                value={settings.themeMode}
                onChange={(e) => {
                  if (estModeTheme(e.target.value)) setThemeMode(e.target.value);
                }}
              >
                <option value="dark">{t('settings.themeDark')}</option>
                <option value="light">{t('settings.themeLight')}</option>
                <option value="system">{t('settings.themeSystem')}</option>
              </select>
            </SettingRow>

            <SettingRow labelKey="settings.bgLabel" hintKey="settings.bgHint" query={q}>
              <div className={css.actions}>
                <input
                  ref={inputRef}
                  className={css.hiddenInput}
                  type="file"
                  accept="image/*"
                  onChange={handlePickFile}
                />
                <button
                  type="button"
                  className={css.primary}
                  onClick={() => inputRef.current?.click()}
                >
                  {t('settings.bgChoose')}
                </button>
                <button
                  type="button"
                  className={css.button}
                  onClick={() => {
                    void confirm(t('settings.bgRemoveConfirm')).then((ok) => {
                      if (ok) clearBackgroundImage();
                    });
                  }}
                  disabled={!settings.backgroundImageDataUrl}
                >
                  {t('settings.bgRemove')}
                </button>
              </div>
            </SettingRow>

            {matches('settings.bgLabel', 'settings.bgHint') &&
              (settings.backgroundImageDataUrl ? (
                <div className={css.previewWrap}>
                  <div className={css.previewLabel}>{t('settings.bgPreview')}</div>
                  <img
                    className={css.preview}
                    src={settings.backgroundImageDataUrl}
                    alt={t('settings.bgPreview')}
                  />
                </div>
              ) : (
                <div className={css.empty}>{t('settings.bgEmpty')}</div>
              ))}

            {/* Opacité */}
            <SettingRow labelKey="settings.overlayLabel" hintKey="settings.overlayHint" query={q}>
              <div className={css.sliderRow}>
                <input
                  type="range"
                  className={css.slider}
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(settings.bgOverlayOpacity * 100)}
                  onChange={(e) => setBgOverlayOpacity(Number(e.target.value) / 100)}
                  disabled={!settings.backgroundImageDataUrl}
                  aria-label={t('settings.overlayLabel')}
                />
                <span className={css.sliderValue}>
                  {Math.round(settings.bgOverlayOpacity * 100)}%
                </span>
              </div>
            </SettingRow>

            {/* Couleur d'accent */}
            <SettingRow labelKey="settings.accentLabel" hintKey="settings.accentHint" query={q}>
              <div className={css.swatches}>
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={[
                      css.swatch,
                      settings.accentColor === c.value ? css.swatchActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ backgroundColor: c.value }}
                    title={t(c.labelKey)}
                    onClick={() => setAccentColor(c.value)}
                    aria-label={t(c.labelKey)}
                    aria-pressed={settings.accentColor === c.value}
                  />
                ))}

                <div className={css.swatchCustomWrapper}>
                  <div
                    className={[
                      css.swatch,
                      css.swatchCustom,
                      !isPresetColor(settings.accentColor) ? css.swatchActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={
                      !isPresetColor(settings.accentColor)
                        ? { backgroundColor: settings.accentColor }
                        : undefined
                    }
                    title={t('settings.accentCustom')}
                  />
                  <input
                    type="color"
                    className={css.colorInput}
                    value={settings.accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    aria-label={t('settings.accentCustom')}
                  />
                </div>
              </div>
            </SettingRow>

            {/* Langue */}
            <SettingRow labelKey="settings.languageLabel" hintKey="settings.languageHint" query={q}>
              <select
                className={css.langSelect}
                value={currentLang}
                onChange={(e) => {
                  if (estLangue(e.target.value)) handleLanguageChange(e.target.value);
                }}
              >
                {/* Chaque langue sous son propre nom : on doit pouvoir retrouver la
                sienne dans une interface qu'on ne lit pas. */}
                {LANGUES.map((l) => (
                  <option key={l.code} value={l.code} lang={l.code}>
                    {l.drapeau} {l.nom}
                  </option>
                ))}
              </select>
            </SettingRow>
          </div>
        )}

      {/* ── Paramètres ───────────────────────────────────────── */}

      {/* Mises à jour */}
      {/* ── Succès ───────────────────────────────────────────── */}

      {(tab === 'succes' || !!q) &&
        matches(
          'settings.succesTitre',
          'settings.succesHint',
          ...SUCCES.map((c) => `succes.${c}.titre`),
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.succesTitre')}</div>
            <div className={css.empty}>{t('settings.succesHint')}</div>
            <ListeSucces />
          </div>
        )}

      {(tab === 'params' || !!q) &&
        matches(
          'settings.updateTitle',
          'settings.updateLabel',
          'settings.updateHint',
          'settings.patchNotesLabel',
          'settings.patchNotesHint',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.updateTitle')}</div>

            <SettingRow labelKey="settings.updateLabel" hintKey="settings.updateHint" query={q}>
              <button
                type="button"
                className={updateStatus === 'error' ? css.danger : css.primary}
                onClick={() => {
                  void handleCheckUpdate();
                }}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
              >
                {updateStatus === 'checking'
                  ? t('settings.updateChecking')
                  : updateStatus === 'downloading'
                    ? t('settings.updateDownloading', { pct: downloadProgress })
                    : updateStatus === 'upToDate'
                      ? t('settings.updateUpToDate')
                      : updateStatus === 'error'
                        ? t('settings.updateError')
                        : t('settings.updateCheck')}
              </button>
              {updateError && <div className={css.updateErrorMsg}>{updateError}</div>}
            </SettingRow>

            <SettingRow
              labelKey="settings.patchNotesLabel"
              hintKey="settings.patchNotesHint"
              query={q}
            >
              <button type="button" className={css.button} onClick={openPatchNotes}>
                {t('settings.patchNotesBtn')}
              </button>
            </SettingRow>
          </div>
        )}

      {/* Ambiance */}
      {(tab === 'perso' || !!q) &&
        matches(
          'settings.ambientTitle',
          'settings.ambientLabel',
          'settings.ambientHint',
          'settings.ambientVolumeLabel',
          'settings.musiqueSupernovaLabel',
          'settings.musiqueCometeBleueLabel',
          'settings.musiqueTrouNoirLabel',
          'settings.musiqueEvenementVolume',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.ambientTitle')}</div>

            <SettingRow labelKey="settings.ambientLabel" hintKey="settings.ambientHint" query={q}>
              <label className={css.toggle}>
                <input
                  type="checkbox"
                  checked={ambient.enabled}
                  onChange={(e) => ambient.setEnabled(e.target.checked)}
                />
                <span className={css.toggleSlider} />
              </label>
            </SettingRow>

            <SettingRow labelKey="settings.ambientVolumeLabel" query={q}>
              <div className={css.sliderRow}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(ambient.volume * 100)}
                  disabled={!ambient.enabled}
                  className={css.slider}
                  onChange={(e) => ambient.setVolume(Number(e.target.value) / 100)}
                />
                <span className={css.sliderValue}>{Math.round(ambient.volume * 100)} %</span>
              </div>
            </SettingRow>

            {(
              [
                ['supernova', 'settings.musiqueSupernovaLabel', 'settings.musiqueSupernovaHint'],
                [
                  'cometeBleue',
                  'settings.musiqueCometeBleueLabel',
                  'settings.musiqueCometeBleueHint',
                ],
                ['trouNoir', 'settings.musiqueTrouNoirLabel', 'settings.musiqueTrouNoirHint'],
              ] as const
            ).map(([evenement, labelKey, hintKey]) => {
              const chemin = settings.musiquesEvenements[evenement];
              const volume = settings.volumesEvenements[evenement];
              return (
                <SettingRow key={evenement} labelKey={labelKey} hintKey={hintKey} query={q}>
                  <div className={css.pileEvenement}>
                    <div className={css.actions}>
                      <button
                        type="button"
                        className={css.primary}
                        disabled={!settings.evenementsCiel}
                        onClick={() => {
                          void choisirMusiqueEvenement(evenement);
                        }}
                      >
                        {t('settings.musiqueEvenementChoisir')}
                      </button>
                      <button
                        type="button"
                        className={css.button}
                        onClick={() => ecouterMusiqueEvenement(evenement)}
                        disabled={!settings.evenementsCiel}
                      >
                        {t(
                          ecoute === evenement
                            ? 'settings.musiqueEvenementArreter'
                            : 'settings.musiqueEvenementEcouter',
                        )}
                      </button>
                      <button
                        type="button"
                        className={css.button}
                        onClick={() => retirerMusiqueEvenement(evenement)}
                        disabled={!chemin}
                      >
                        {t('settings.musiqueEvenementRetirer')}
                      </button>
                    </div>
                    <div className={css.sliderRow}>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(volume * 100)}
                        disabled={!settings.evenementsCiel}
                        className={css.slider}
                        aria-label={t('settings.musiqueEvenementVolume')}
                        title={t('settings.musiqueEvenementVolume')}
                        onChange={(e) => reglerVolume(evenement, Number(e.target.value) / 100)}
                      />
                      <span className={css.sliderValue}>{Math.round(volume * 100)} %</span>
                    </div>
                    <div className={css.empty}>
                      {chemin
                        ? nomDeFichier(chemin)
                        : t(
                            aUneMusiqueFournie()
                              ? 'settings.musiqueEvenementDefaut'
                              : 'settings.musiqueEvenementAucune',
                          )}
                    </div>
                  </div>
                </SettingRow>
              );
            })}
          </div>
        )}

      {/* Système solaire */}
      {(tab === 'perso' || !!q) &&
        matches(
          'settings.solarTitle',
          'settings.planetPlaytimeLabel',
          'settings.planetPlaytimeHint',
          'settings.startSystemLabel',
          'settings.startSystemHint',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.solarTitle')}</div>

            <SettingRow
              labelKey="settings.startSystemLabel"
              hintKey="settings.startSystemHint"
              query={q}
            >
              <ChoixOuverture valeur={settings.startSystem} onChange={setStartSystem} />
            </SettingRow>

            <SettingRow
              labelKey="settings.planetPlaytimeLabel"
              hintKey="settings.planetPlaytimeHint"
              query={q}
            >
              <label className={css.toggle}>
                <input
                  type="checkbox"
                  checked={settings.planetSizeByPlaytime}
                  onChange={(e) => setPlanetSizeByPlaytime(e.target.checked)}
                />
                <span className={css.toggleSlider} />
              </label>
            </SettingRow>
          </div>
        )}

      {/* ── Graphisme ────────────────────────────────────────── */}

      {/* ── Graphisme ──────────────────────────────────────────

          Rangé comme un menu graphique de jeu, parce que c'en est un : un
          préréglage d'abord, pour qui ne veut pas savoir, puis le détail pour
          qui veut. Le préréglage n'est pas stocké, il se déduit des valeurs —
          voir `features/settings/qualite.ts`. */}

      {(tab === 'graphisme' || !!q) &&
        matches(
          'settings.graphismeTitle',
          'settings.presetLabel',
          'settings.presetHint',
          'settings.echelleRenduLabel',
          'settings.echelleRenduHint',
          'settings.densiteCielLabel',
          'settings.densiteCielHint',
          'settings.debordementLabel',
          'settings.debordementHint',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.graphismeTitle')}</div>

            <SettingRow labelKey="settings.presetLabel" hintKey="settings.presetHint" query={q}>
              <select
                className={css.langSelect}
                value={preset}
                onChange={(e) => appliquerPreset(e.target.value as Preset)}
              >
                {ORDRE_PRESETS.map((nom) => (
                  <option key={nom} value={nom}>
                    {t(`settings.preset_${nom}`)}
                  </option>
                ))}
                {/* « Personnalisé » n'est pas un choix, c'est un constat : il ne
                paraît que lorsqu'aucun préréglage ne décrit l'état courant. */}
                {preset === 'perso' && (
                  <option value="perso" disabled>
                    {t('settings.preset_perso')}
                  </option>
                )}
              </select>
            </SettingRow>

            <SettingRow
              labelKey="settings.echelleRenduLabel"
              hintKey="settings.echelleRenduHint"
              query={q}
            >
              <select
                className={css.langSelect}
                value={settings.echelleRendu}
                onChange={(e) => setEchelleRendu(Number(e.target.value))}
              >
                {ECHELLES.map((v) => (
                  <option key={v} value={v}>
                    {Math.round(v * 100)} %{v > 1 ? ` · ${t('settings.echelleSuper')}` : ''}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              labelKey="settings.densiteCielLabel"
              hintKey="settings.densiteCielHint"
              query={q}
            >
              <select
                className={css.langSelect}
                value={densiteLaPlusProche(settings.densiteCiel)}
                onChange={(e) => setDensiteCiel(Number(e.target.value))}
              >
                {DENSITES.map((d) => (
                  <option key={d.cle} value={d.valeur}>
                    {t(`settings.densite_${d.cle}`)}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              labelKey="settings.debordementLabel"
              hintKey="settings.debordementHint"
              query={q}
            >
              <label className={css.toggle}>
                <input
                  type="checkbox"
                  checked={settings.debordement}
                  onChange={(e) => setDebordement(e.target.checked)}
                />
                <span className={css.toggleSlider} />
              </label>
            </SettingRow>
          </div>
        )}

      {/* Affichage */}
      {(tab === 'graphisme' || !!q) &&
        matches(
          'settings.affichageTitle',
          'settings.limiteIPSLabel',
          'settings.limiteIPSHint',
          'settings.afficherIPSLabel',
          'settings.afficherIPSHint',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.affichageTitle')}</div>

            <SettingRow
              labelKey="settings.limiteIPSLabel"
              hintKey="settings.limiteIPSHint"
              query={q}
            >
              <select
                className={css.langSelect}
                value={settings.limiteIPS}
                onChange={(e) => setLimiteIPS(Number(e.target.value))}
              >
                {LIMITES_IPS.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? t('settings.limiteIPSAucune') : `${v} IPS`}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              labelKey="settings.afficherIPSLabel"
              hintKey="settings.afficherIPSHint"
              query={q}
            >
              <label className={css.toggle}>
                <input
                  type="checkbox"
                  checked={settings.afficherIPS}
                  onChange={(e) => setAfficherIPS(e.target.checked)}
                />
                <span className={css.toggleSlider} />
              </label>
            </SettingRow>
          </div>
        )}

      {/* Ambiance de la scène : ce qui se passe dans le ciel, et non la façon
          dont on le dessine. */}
      {(tab === 'graphisme' || !!q) &&
        matches(
          'settings.sceneTitle',
          'settings.cielVivantLabel',
          'settings.cielVivantHint',
          'settings.evenementsLabel',
          'settings.evenementsHint',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.sceneTitle')}</div>

            <SettingRow
              labelKey="settings.cielVivantLabel"
              hintKey="settings.cielVivantHint"
              query={q}
            >
              <label className={css.toggle}>
                <input
                  type="checkbox"
                  checked={settings.cielVivant}
                  onChange={(e) => setCielVivant(e.target.checked)}
                />
                <span className={css.toggleSlider} />
              </label>
            </SettingRow>

            <SettingRow
              labelKey="settings.evenementsLabel"
              hintKey="settings.evenementsHint"
              query={q}
            >
              <label className={css.toggle}>
                <input
                  type="checkbox"
                  checked={settings.evenementsCiel}
                  onChange={(e) => setEvenementsCiel(e.target.checked)}
                />
                <span className={css.toggleSlider} />
              </label>
            </SettingRow>
          </div>
        )}

      {(tab === 'params' || !!q) &&
        matches(
          'settings.navTitle',
          'settings.showLibraryLabel',
          'settings.showLibraryHint',
          'settings.showLaunchersLabel',
          'settings.showLaunchersHint',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.navTitle')}</div>

            {PAGES_RAPPELABLES.map(({ reglage, labelKey, hintKey }) => (
              <SettingRow key={reglage} labelKey={labelKey} hintKey={hintKey} query={q}>
                <label className={css.toggle}>
                  <input
                    type="checkbox"
                    checked={settings[reglage]}
                    onChange={(e) => setPageVisible(reglage, e.target.checked)}
                  />
                  <span className={css.toggleSlider} />
                </label>
              </SettingRow>
            ))}
          </div>
        )}

      {/* Système */}
      {(tab === 'params' || !!q) &&
        matches(
          'settings.systemTitle',
          'settings.autostartLabel',
          'settings.autostartHint',
          'settings.runInBgLabel',
          'settings.runInBgHint',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.systemTitle')}</div>

            <SettingRow
              labelKey="settings.autostartLabel"
              hintKey="settings.autostartHint"
              query={q}
            >
              <label className={css.toggle}>
                <input
                  type="checkbox"
                  checked={settings.autostart}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setAutostart(enabled);
                    try {
                      await invoke('set_autostart', { enabled });
                    } catch {
                      /* desktop only */
                    }
                  }}
                />
                <span className={css.toggleSlider} />
              </label>
            </SettingRow>

            <SettingRow labelKey="settings.runInBgLabel" hintKey="settings.runInBgHint" query={q}>
              <label className={css.toggle}>
                <input
                  type="checkbox"
                  checked={settings.runInBackground}
                  onChange={(e) => setRunInBackground(e.target.checked)}
                />
                <span className={css.toggleSlider} />
              </label>
            </SettingRow>
          </div>
        )}

      {/* Zone de danger */}
      {(tab === 'params' || !!q) &&
        matches(
          'settings.dangerTitle',
          'settings.clearAllLabel',
          'settings.clearAllHint',
          'settings.clearWebviewCacheLabel',
          'settings.clearWebviewCacheHint',
        ) && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.dangerTitle')}</div>

            <SettingRow
              labelKey="settings.clearWebviewCacheLabel"
              hintKey="settings.clearWebviewCacheHint"
              query={q}
            >
              <button
                type="button"
                className={css.button}
                onClick={() => {
                  void handleClearWebviewCache();
                }}
              >
                {webviewCacheCleared
                  ? t('settings.clearWebviewCacheCleared')
                  : t('settings.clearWebviewCacheButton')}
              </button>
            </SettingRow>

            <SettingRow labelKey="settings.clearAllLabel" hintKey="settings.clearAllHint" query={q}>
              <button type="button" className={css.danger} onClick={handleClearAllData}>
                {t('settings.clearAllButton')}
              </button>
            </SettingRow>
          </div>
        )}

      {/* Intégrations */}
      {(tab === 'params' || !!q) &&
        matches('settings.integrationsTitle', 'settings.sgdbLabel', 'settings.sgdbHint') && (
          <div className={css.card}>
            <div className={css.sectionTitle}>{t('settings.integrationsTitle')}</div>

            <SettingRow
              labelKey="settings.sgdbLabel"
              hintKey="settings.sgdbHint"
              query={q}
              hint={
                <>
                  {t('settings.sgdbHint')}{' '}
                  <a
                    href="https://www.steamgriddb.com/api/v2"
                    target="_blank"
                    rel="noreferrer"
                    className={css.link}
                  >
                    {t('settings.sgdbLink')}
                  </a>
                </>
              }
            >
              <div className={css.apiKeyRow}>
                <input
                  type="password"
                  className={css.apiKeyInput}
                  placeholder={
                    settings.sgdbKeySet ? t('settings.sgdbKeySaved') : t('settings.sgdbPlaceholder')
                  }
                  value={sgdbKeyInput}
                  onChange={(e) => {
                    setSgdbKeyInput(e.target.value);
                    setSgdbKeySaved(false);
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className={css.primary}
                  onClick={handleSaveSgdbKey}
                  disabled={!sgdbKeyInput.trim()}
                >
                  {sgdbKeySaved ? t('settings.sgdbSaved') : t('settings.sgdbSave')}
                </button>
                <button
                  type="button"
                  className={css.button}
                  onClick={handleClearCache}
                  title={t('settings.sgdbClearCache')}
                >
                  {cacheCleared ? t('settings.sgdbCleared') : t('settings.sgdbClearCache')}
                </button>
              </div>
            </SettingRow>
          </div>
        )}
    </>
  );
}

/**
 * Système d'ouverture : automatique, dernier visité, ou l'un des systèmes.
 *
 * La liste est lue au rendu du panneau : ce sont les launchers qui ont des
 * jeux, du plus fourni au moins fourni, puis les systèmes personnalisés. Un
 * choix qui ne figure plus dans la liste — système supprimé — reste affiché
 * comme introuvable ; la vue, elle, retombe sur l'automatique.
 */
function ChoixOuverture({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const options = useMemo(() => {
    const compte = new Map<string, number>();
    for (const g of loadGamesFromStorage()) {
      const k = g.platform || 'Other';
      compte.set(k, (compte.get(k) ?? 0) + 1);
    }
    const launchers = [...compte.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cle]) => ({ cle, nom: nomPlateforme(cle, t) }));
    const perso = chargerSystemesPerso().map((s) => ({ cle: cleSysteme(s), nom: s.nom }));
    return { launchers, perso };
  }, [t]);

  const connue =
    valeur === OUVERTURE_AUTO ||
    valeur === OUVERTURE_DERNIER ||
    options.launchers.some((o) => o.cle === valeur) ||
    options.perso.some((o) => o.cle === valeur);

  return (
    <select className={css.langSelect} value={valeur} onChange={(e) => onChange(e.target.value)}>
      <option value={OUVERTURE_AUTO}>{t('settings.startSystemAuto')}</option>
      <option value={OUVERTURE_DERNIER}>{t('settings.startSystemLast')}</option>
      {options.launchers.length > 0 && (
        <optgroup label={t('settings.startSystemLaunchers')}>
          {options.launchers.map((o) => (
            <option key={o.cle} value={o.cle}>
              {o.nom}
            </option>
          ))}
        </optgroup>
      )}
      {options.perso.length > 0 && (
        <optgroup label={t('settings.startSystemCustom')}>
          {options.perso.map((o) => (
            <option key={o.cle} value={o.cle}>
              {o.nom}
            </option>
          ))}
        </optgroup>
      )}
      {!connue && <option value={valeur}>{t('settings.startSystemMissing')}</option>}
    </select>
  );
}
