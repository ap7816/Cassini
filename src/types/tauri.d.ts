export {};

// Augmente le type Window pour exposer les APIs Tauri disponibles en mode legacy (window.__TAURI__)
declare global {
  interface Window {
    __TAURI__?: {
      invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

      shell?: {
        open?: (target: string) => Promise<void> | void;
      };

      dialog?: {
        open?: (options?: unknown) => Promise<string | string[] | null>;
        save?: (options?: unknown) => Promise<string | null>;
      };

      fs?: {
        readTextFile?: (path: string) => Promise<string>;
        writeTextFile?: (path: string, contents: string) => Promise<void>;
      };
    };
  }
}
