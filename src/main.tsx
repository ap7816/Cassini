import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './app/AppRouter';
import { AppSettingsProvider } from './features/settings/context/AppSettingsProvider';
import { MusicProvider } from './features/music/MusicContext';
import { ToastProvider } from './features/toast/ToastContext';
import { initStorage } from './services/storage';
import './i18n';
import './App.css';

initStorage().then(() => {
  // Rend React immédiatement (caché derrière le preloader)
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ToastProvider>
        <AppSettingsProvider>
          <MusicProvider>
            <BrowserRouter>
              <AppRouter />
            </BrowserRouter>
          </MusicProvider>
        </AppSettingsProvider>
      </ToastProvider>
    </React.StrictMode>,
  );

  const pre     = document.getElementById('app-preloader');
  const fill    = pre?.querySelector('.bar-fill') as HTMLElement | null;
  const bar     = document.getElementById('preloader-bar');
  const subEl   = document.getElementById('preloader-sub');
  const welcome = document.getElementById('preloader-welcome');

  // 1 — Complète la barre à 100 %
  if (fill) {
    const currentW = window.getComputedStyle(fill).width;
    fill.style.width = currentW;
    fill.style.animation = 'none';
    void fill.offsetWidth;
    fill.style.transition = 'width 0.35s ease';
    fill.style.width = '100%';
  }

  // 2 — Barre à 100 % atteinte : "Starting…" et barre disparaissent
  window.setTimeout(() => {
    bar?.classList.add('leaving');
    subEl?.classList.add('leaving');

    // 3 — Après la transition de sortie : "Bienvenue sur ArcHive" apparaît
    window.setTimeout(() => {
      welcome?.classList.add('entering');

      // 4 — 3 secondes de bienvenue, puis l'app monte
      window.setTimeout(() => {
        requestAnimationFrame(() => {
          document.getElementById('root')?.classList.add('app-entering');
        });
        pre?.classList.add('preloader--done');
        window.setTimeout(() => pre?.remove(), 500);
      }, 3000);
    }, 450);
  }, 400);
});
