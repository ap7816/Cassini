import { useRef, useState } from 'react';
import css from './SettingsPage.module.css';
import { useAppSettings } from '../../features/settings/context/useAppSettings';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

const ACCENT_COLORS: { label: string; value: string }[] = [
  { label: 'Neutre', value: '#e5e7eb' },
  { label: 'Violet', value: '#8b5cf6' },
  { label: 'Bleu', value: '#3b82f6' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Vert', value: '#22c55e' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Rouge', value: '#ef4444' },
];

const isPresetColor = (color: string) => ACCENT_COLORS.some((c) => c.value === color);

export function SettingsPage() {
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

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      window.alert('Please select an image file.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBackgroundImageDataUrl(dataUrl);
    } catch {
      window.alert('Could not load image.');
    }
  }

  function handleSaveRawgKey() {
    setRawgApiKey(rawgKeyInput.trim());
    setRawgKeySaved(true);
    setTimeout(() => setRawgKeySaved(false), 2000);
  }

  return (
    <div className={css.page}>
      <h1 className={css.title}>Settings</h1>
      <p className={css.subtitle}>Customize ArcHive (background, theme, etc.).</p>

      <div className={css.card}>
        {/* Image de fond */}
        <div className={css.row}>
          <div>
            <div className={css.label}>Background image</div>
            <div className={css.hint}>Pick an image to use as the app background.</div>
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
              Choose image
            </button>

            <button
              type="button"
              className={css.button}
              onClick={clearBackgroundImage}
              disabled={!settings.backgroundImageDataUrl}
            >
              Remove
            </button>
          </div>
        </div>

        {settings.backgroundImageDataUrl ? (
          <div className={css.previewWrap}>
            <div className={css.previewLabel}>Preview</div>
            <img
              className={css.preview}
              src={settings.backgroundImageDataUrl}
              alt="Background preview"
            />
          </div>
        ) : (
          <div className={css.empty}>No background selected.</div>
        )}

        <div className={css.divider} />

        {/* Opacité de l'overlay */}
        <div className={css.row}>
          <div>
            <div className={css.label}>Overlay opacity</div>
            <div className={css.hint}>Darkens the background image for better readability.</div>
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
              aria-label="Overlay opacity"
            />
            <span className={css.sliderValue}>{Math.round(settings.bgOverlayOpacity * 100)}%</span>
          </div>
        </div>

        <div className={css.divider} />

        {/* Couleur d'accent */}
        <div className={css.row}>
          <div>
            <div className={css.label}>Accent color</div>
            <div className={css.hint}>Main tint used on buttons and active navigation.</div>
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
                title={c.label}
                onClick={() => setAccentColor(c.value)}
                aria-label={c.label}
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
                title="Custom color"
              />
              <input
                type="color"
                className={css.colorInput}
                value={settings.accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                aria-label="Custom accent color"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Intégrations */}
      <div className={css.card}>
        <div className={css.sectionTitle}>Integrations</div>

        <div className={css.row}>
          <div>
            <div className={css.label}>RAWG API key</div>
            <div className={css.hint}>
              Used to fetch cover images for Epic &amp; Battle.net games.{' '}
              <a
                href="https://rawg.io/apidocs"
                target="_blank"
                rel="noreferrer"
                className={css.link}
              >
                Get a free key →
              </a>
            </div>
          </div>

          <div className={css.apiKeyRow}>
            <input
              type="password"
              className={css.apiKeyInput}
              placeholder="Paste your RAWG API key…"
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
              {rawgKeySaved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
