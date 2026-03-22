import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { confirm } from '@tauri-apps/plugin-dialog';
import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import css from './SettingsPage.module.css';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { clearRawgCache } from '../../features/Library/services/rawgService';
import { setLanguage, getCurrentLanguage } from '../../i18n';

const MAX_DIM = 1920;
const JPEG_QUALITY = 0.85;

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
          if (width >= height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
          else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not available')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const ACCENT_COLORS: { labelKey: string; value: string }[] = [
  { labelKey: 'settings.colorNeutre', value: '#e5e7eb' },
  { labelKey: 'settings.colorViolet', value: '#8b5cf6' },
  { labelKey: 'settings.colorBleu', value: '#3b82f6' },
  { labelKey: 'settings.colorCyan', value: '#06b6d4' },
  { labelKey: 'settings.colorVert', value: '#22c55e' },
  { labelKey: 'settings.colorOrange', value: '#f97316' },
  { labelKey: 'settings.colorRouge', value: '#ef4444' },
];

const isPresetColor = (color: string) => ACCENT_COLORS.some((c) => c.value === color);

export function SettingsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();

  function matches(...keys: string[]): boolean {
    if (!q) return true;
    return keys.some((k) => t(k).toLowerCase().includes(q));
  }
  const {
    settings,
    setBackgroundImageDataUrl,
    clearBackgroundImage,
    setAccentColor,
    setBgOverlayOpacity,
    setRawgApiKey,
  } = useAppSettings();

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rawgKeyInput, setRawgKeyInput] = useState(settings.rawgApiKey);
  const [rawgKeySaved, setRawgKeySaved] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [currentLang, setCurrentLang] = useState<'fr' | 'en'>(getCurrentLanguage);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'upToDate' | 'downloading' | 'error'>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState<string | null>(null);

  async function handleCheckUpdate() {
    setUpdateStatus('checking');
    try {
      const token = import.meta.env.VITE_UPDATER_TOKEN as string | undefined;
      const update = await check(token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
      if (!update?.available) {
        setUpdateStatus('upToDate');
        setTimeout(() => setUpdateStatus('idle'), 3000);
        return;
      }
      setUpdateStatus('idle');
      const yes = await ask(
        `Une nouvelle version est disponible : ${update.version}\n\n${update.body ?? ''}\n\nVoulez-vous mettre à jour maintenant ?`,
        { title: 'Mise à jour disponible', kind: 'info', okLabel: 'Mettre à jour', cancelLabel: 'Plus tard' },
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
      setTimeout(() => { setUpdateStatus('idle'); setUpdateError(null); }, 6000);
    }
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      window.alert(t('settings.bgErrorType'));
      return;
    }

    try {
      const dataUrl = await compressImageFile(file);
      setBackgroundImageDataUrl(dataUrl);
    } catch {
      window.alert(t('settings.bgErrorLoad'));
    }
  }

  function handleSaveRawgKey() {
    setRawgApiKey(rawgKeyInput.trim());
    setRawgKeySaved(true);
    setTimeout(() => setRawgKeySaved(false), 2000);
  }

  function handleClearCache() {
    clearRawgCache();
    setRawgApiKey('');
    setRawgKeyInput('');
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  }

  async function handleClearAllData() {
    const ok = await confirm(t('settings.clearAllConfirm'));
    if (!ok) return;
    const rawgKey = settings.rawgApiKey;
    window.localStorage.clear();
    if (rawgKey) {
      window.localStorage.setItem('arctive.settings.v1', JSON.stringify({ rawgApiKey: rawgKey }));
    }
    window.location.reload();
  }

  function handleLanguageChange(lang: 'fr' | 'en') {
    setLanguage(lang);
    setCurrentLang(lang);
  }

  return (
    <div className={css.page}>
      <h1 className={css.title}>{t('settings.title')}</h1>
      <p className={css.subtitle}>{t('settings.subtitle')}</p>

      {/* Apparence */}
      {matches('settings.bgLabel', 'settings.bgHint', 'settings.overlayLabel', 'settings.overlayHint', 'settings.accentLabel', 'settings.accentHint', 'settings.languageLabel', 'settings.languageHint') && (
      <div className={css.card}>
        {/* Image de fond */}
        {matches('settings.bgLabel', 'settings.bgHint') && (
        <div className={css.row}>
          <div>
            <div className={css.label}>{t('settings.bgLabel')}</div>
            <div className={css.hint}>{t('settings.bgHint')}</div>
          </div>

          <div className={css.actions}>
            <input
              ref={inputRef}
              className={css.hiddenInput}
              type="file"
              accept="image/*"
              onChange={handlePickFile}
            />
            <button type="button" className={css.primary} onClick={() => inputRef.current?.click()}>
              {t('settings.bgChoose')}
            </button>
            <button
              type="button"
              className={css.button}
              onClick={() => { void confirm(t('settings.bgRemoveConfirm')).then((ok) => { if (ok) clearBackgroundImage(); }); }}
              disabled={!settings.backgroundImageDataUrl}
            >
              {t('settings.bgRemove')}
            </button>
          </div>
        </div>
        )}

        {matches('settings.bgLabel', 'settings.bgHint') && (
          settings.backgroundImageDataUrl ? (
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
          )
        )}

        {matches('settings.bgLabel', 'settings.bgHint') && matches('settings.overlayLabel', 'settings.overlayHint') && <div className={css.divider} />}

        {/* Opacité */}
        {matches('settings.overlayLabel', 'settings.overlayHint') && (
        <div className={css.row}>
          <div>
            <div className={css.label}>{t('settings.overlayLabel')}</div>
            <div className={css.hint}>{t('settings.overlayHint')}</div>
          </div>

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
            <span className={css.sliderValue}>{Math.round(settings.bgOverlayOpacity * 100)}%</span>
          </div>
        </div>
        )}

        {matches('settings.overlayLabel', 'settings.overlayHint') && matches('settings.accentLabel', 'settings.accentHint') && <div className={css.divider} />}

        {/* Couleur d'accent */}
        {matches('settings.accentLabel', 'settings.accentHint') && (
        <div className={css.row}>
          <div>
            <div className={css.label}>{t('settings.accentLabel')}</div>
            <div className={css.hint}>{t('settings.accentHint')}</div>
          </div>

          <div className={css.swatches}>
            {ACCENT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={[css.swatch, settings.accentColor === c.value ? css.swatchActive : '']
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
        </div>
        )}

        {matches('settings.accentLabel', 'settings.accentHint') && matches('settings.languageLabel', 'settings.languageHint') && <div className={css.divider} />}

        {/* Langue */}
        {matches('settings.languageLabel', 'settings.languageHint') && (
        <div className={css.row}>
          <div>
            <div className={css.label}>{t('settings.languageLabel')}</div>
            <div className={css.hint}>{t('settings.languageHint')}</div>
          </div>

          <select
            className={css.langSelect}
            value={currentLang}
            onChange={(e) => handleLanguageChange(e.target.value as 'fr' | 'en')}
          >
            <option value="fr">🇫🇷 Français</option>
            <option value="en">🇬🇧 English</option>
          </select>
        </div>
        )}
      </div>
      )}

      {/* Mises à jour */}
      {matches('settings.updateTitle', 'settings.updateLabel', 'settings.updateHint') && (
      <div className={css.card}>
        <div className={css.sectionTitle}>{t('settings.updateTitle')}</div>
        <div className={css.row}>
          <div>
            <div className={css.label}>{t('settings.updateLabel')}</div>
            <div className={css.hint}>{t('settings.updateHint')}</div>
          </div>
          <button
            type="button"
            className={updateStatus === 'error' ? css.danger : css.primary}
            onClick={() => { void handleCheckUpdate(); }}
            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
          >
            {updateStatus === 'checking' ? t('settings.updateChecking')
              : updateStatus === 'downloading' ? `Téléchargement... ${downloadProgress}%`
              : updateStatus === 'upToDate' ? t('settings.updateUpToDate')
              : updateStatus === 'error' ? t('settings.updateError')
              : t('settings.updateCheck')}
          </button>
          {updateError && (
            <div className={css.updateErrorMsg}>{updateError}</div>
          )}
        </div>
      </div>
      )}

      {/* Zone de danger */}
      {matches('settings.dangerTitle', 'settings.clearAllLabel', 'settings.clearAllHint') && (
      <div className={css.card}>
        <div className={css.sectionTitle}>{t('settings.dangerTitle')}</div>
        <div className={css.row}>
          <div>
            <div className={css.label}>{t('settings.clearAllLabel')}</div>
            <div className={css.hint}>{t('settings.clearAllHint')}</div>
          </div>
          <button
            type="button"
            className={css.danger}
            onClick={handleClearAllData}
          >
            {t('settings.clearAllButton')}
          </button>
        </div>
      </div>
      )}

      {/* Intégrations */}
      {matches('settings.integrationsTitle', 'settings.rawgLabel', 'settings.rawgHint') && (
      <div className={css.card}>
        <div className={css.sectionTitle}>{t('settings.integrationsTitle')}</div>

        {matches('settings.rawgLabel', 'settings.rawgHint') && (
        <div className={css.row}>
          <div>
            <div className={css.label}>{t('settings.rawgLabel')}</div>
            <div className={css.hint}>
              {t('settings.rawgHint')}{' '}
              <a
                href="https://rawg.io/apidocs"
                target="_blank"
                rel="noreferrer"
                className={css.link}
              >
                {t('settings.rawgLink')}
              </a>
            </div>
          </div>

          <div className={css.apiKeyRow}>
            <input
              type="password"
              className={css.apiKeyInput}
              placeholder={t('settings.rawgPlaceholder')}
              value={rawgKeyInput}
              onChange={(e) => {
                setRawgKeyInput(e.target.value);
                setRawgKeySaved(false);
              }}
              autoComplete="off"
            />
            <button
              type="button"
              className={css.primary}
              onClick={handleSaveRawgKey}
              disabled={rawgKeyInput.trim() === settings.rawgApiKey}
            >
              {rawgKeySaved ? t('settings.rawgSaved') : t('settings.rawgSave')}
            </button>
            <button
              type="button"
              className={css.button}
              onClick={handleClearCache}
              title={t('settings.rawgClearCache')}
            >
              {cacheCleared ? t('settings.rawgCleared') : t('settings.rawgClearCache')}
            </button>
          </div>
        </div>
        )}
      </div>
      )}
    </div>
  );
}
