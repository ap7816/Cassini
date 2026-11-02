/**
 * Accès à `invoke` compatible avec les deux façons dont l'API Tauri peut être
 * exposée : l'objet global hérité (`window.__TAURI__`) ou le module ESM, chargé
 * à la demande.
 *
 * Ce helper existait en cinq exemplaires identiques dans le projet — un par
 * fichier qui en avait besoin. Une seule copie évite qu'ils divergent.
 */
type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__ as unknown as { invoke?: TauriInvoke } | undefined;
  if (tauri?.invoke) return tauri.invoke<T>(cmd, args);
  const mod = await import('@tauri-apps/api/core');
  return (mod.invoke as unknown as TauriInvoke)<T>(cmd, args);
}
