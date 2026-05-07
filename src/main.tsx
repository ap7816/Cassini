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

// Initialise le store de persistance AVANT le premier rendu React
// pour que tous les useState() lisent déjà les bonnes valeurs depuis le cache mémoire
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

  // Anime la barre de chargement vers 100 % puis retire le preloader de l'écran
  const pre = document.getElementById('app-preloader');
  if (pre) {
    const fill = pre.querySelector('.bar-fill') as HTMLElement | null;
    if (fill) {
      // Gèle la position courante de l'animation CSS, puis la transite vers 100 %
      const currentW = window.getComputedStyle(fill).width;
      fill.style.width = currentW;
      fill.style.animation = 'none';
      void fill.offsetWidth;
      fill.style.transition = 'width 0.22s ease';
      fill.style.width = '100%';
    }
    // Attend que la barre atteigne 100 % avant de lancer le fade-out
    window.setTimeout(() => {
      pre.classList.add('preloader--done');
      window.setTimeout(() => pre.remove(), 260);
    }, 240);
  }
});
