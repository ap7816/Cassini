import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtxValue {
  toasts: ToastItem[];
  push(kind: ToastKind, message: string, duration?: number): void;
  dismiss(id: number): void;
}

const ToastCtx = createContext<ToastCtxValue | null>(null);

// Gère la liste des toasts actifs, leur affichage temporaire et leur suppression automatique
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  // Supprime un toast par son identifiant unique
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Ajoute un toast en limitant à 5 simultanément, avec disparition automatique après `duration` ms
  const push = useCallback(
    (kind: ToastKind, message: string, duration = 4000) => {
      const id = ++seq.current;
      setToasts((prev) => [...prev.slice(-4), { id, kind, message }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  return <ToastCtx.Provider value={{ toasts, push, dismiss }}>{children}</ToastCtx.Provider>;
}

// Accède au système de toasts — expose des helpers par type (success, error, info)
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return {
    success: (msg: string) => ctx.push('success', msg, 3500),
    error: (msg: string) => ctx.push('error', msg, 5500),
    info: (msg: string) => ctx.push('info', msg, 4000),
    toasts: ctx.toasts,
    dismiss: ctx.dismiss,
  };
}
