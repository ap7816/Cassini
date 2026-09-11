import { open } from '@tauri-apps/plugin-dialog';
import i18n from '../../../i18n';

export type PickedGameFile =
  | { ok: true; path: string }
  | { ok: false; reason: 'CANCELLED' | 'NOT_AVAILABLE'; message: string };

// Ouvre un dialogue natif pour sélectionner un exécutable (.exe) ou un raccourci (.lnk)
export async function pickGameFile(): Promise<PickedGameFile> {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: i18n.t('files.executables'), extensions: ['exe', 'lnk'] }],
    });

    if (!selected || Array.isArray(selected)) {
      return { ok: false, reason: 'CANCELLED', message: 'User cancelled.' };
    }

    return { ok: true, path: selected };
  } catch {
    return {
      ok: false,
      reason: 'NOT_AVAILABLE',
      message: i18n.t('errors.dialogUnavailable'),
    };
  }
}
