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
    pre.classList.add('preloader--done');
    window.setTimeout(() => pre.remove(), 260);
  }
});
