import { useRef } from 'react';
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

export function SettingsPage() {
  const {
    settings,
    setBackgroundImageDataUrl,
    clearBackgroundImage,
    setAccentColor,
    setBgOverlayOpacity,
  } = useAppSettings();
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // reset pour pouvoir re-choisir le même fichier
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
              dir="rtl"
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
          </div>
        </div>
      </div>
    </div>
  );
}
