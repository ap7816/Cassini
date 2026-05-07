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

// Initialiser le store de persistance avant le premier rendu
// pour que tous les useState() lisent déjà les bonnes valeurs.
initStorage().then(() => {
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

  const pre = document.getElementById('app-preloader');
  if (pre) {
    // Compléter la barre à 100 % avant de dismisser
    const fill = pre.querySelector('.bar-fill') as HTMLElement | null;
    if (fill) {
      // Geler la position courante de l'animation, puis transitionner vers 100 %
      const currentW = window.getComputedStyle(fill).width;
      fill.style.width = currentW;
      fill.style.animation = 'none';
      void fill.offsetWidth; // force reflow
      fill.style.transition = 'width 0.22s ease';
      fill.style.width = '100%';
    }
    // Laisser la barre atteindre 100 % avant le fade-out
    window.setTimeout(() => {
      pre.classList.add('preloader--done');
      window.setTimeout(() => pre.remove(), 260);
    }, 240);
  }
});
