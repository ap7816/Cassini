import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import css from './SettingsPage.module.css';
import { useAppSettings } from '../../features/settings/context/useAppSettings';
import { clearRawgCache } from '../../features/Library/services/rawgService';
import { setLanguage, getCurrentLanguage } from '../../i18n';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result));
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
  const { t, i18n } = useTranslation();
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

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      window.alert(t('settings.bgErrorType'));
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
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
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
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
      <div className={css.card}>
        {/* Image de fond */}
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
              onClick={clearBackgroundImage}
              disabled={!settings.backgroundImageDataUrl}
            >
              {t('settings.bgRemove')}
            </button>
          </div>
        </div>

        {settings.backgroundImageDataUrl ? (
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
        )}

        <div className={css.divider} />

        {/* Opacité */}
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

        <div className={css.divider} />

        {/* Couleur d'accent */}
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

        <div className={css.divider} />

        {/* Langue */}
        <div className={css.row}>
          <div>
            <div className={css.label}>{t('settings.languageLabel')}</div>
            <div className={css.hint}>{t('settings.languageHint')}</div>
          </div>

          <div className={css.langRow}>
            <button
              type="button"
              className={[css.langBtn, currentLang === 'fr' ? css.langBtnActive : ''].join(' ')}
              onClick={() => handleLanguageChange('fr')}
            >
              🇫🇷 Français
            </button>
            <button
              type="button"
              className={[css.langBtn, currentLang === 'en' ? css.langBtnActive : ''].join(' ')}
              onClick={() => handleLanguageChange('en')}
            >
              🇬🇧 English
            </button>
          </div>
        </div>
      </div>

      {/* Intégrations */}
      <div className={css.card}>
        <div className={css.sectionTitle}>{t('settings.integrationsTitle')}</div>

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
      </div>
    </div>
  );
}
