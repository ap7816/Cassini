import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './app/AppRouter';
import { AppSettingsProvider } from './features/settings/context/AppSettingsProvider';
import { MusicProvider } from './features/music/MusicContext';
import { ToastProvider } from './features/toast/ToastContext';
import { initStorage } from './services/storage';
import { appliquerLangueEnregistree } from './i18n';
import './App.css';

initStorage().then(async () => {
  // Avant le premier rendu : la langue choisie n'est lisible qu'une fois le
  // stockage chargé.
  await appliquerLangueEnregistree();

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

  // Écran d'accueil retiré dès que React a peint.
  //
  // Il enchaînait auparavant une barre de progression, un « Bienvenue » tenu
  // trois secondes puis un fondu — 4,35 s imposées après l'initialisation,
  // alors que l'application était prête bien avant. Il ne sert plus qu'à
  // couvrir le premier rendu, et s'efface aussitôt.
  //
  let retire = false;

  const retirer = () => {
    if (retire) return;
    retire = true;
    const pre = document.getElementById('app-preloader');
    pre?.classList.add('preloader--done');
    // Le fondu ne bloque rien : la règle correspondante coupe les
    // événements de pointeur.
    window.setTimeout(() => pre?.remove(), 400);
  };

  // `requestAnimationFrame` imbriqué : le premier tour est planifié avant la
  // peinture, le second s'exécute juste après. Retirer l'écran au premier
  // laisserait entrevoir une page encore vide.
  requestAnimationFrame(() => requestAnimationFrame(retirer));

  // Filet, car `requestAnimationFrame` ne se déclenche pas tant que la fenêtre
  // n'est pas peinte — minimisée, ou masquée au lancement. Sans ce délai,
  // l'écran d'accueil resterait posé sur l'application jusqu'à ce qu'on la
  // rende visible. Assez long pour que la voie normale gagne toujours la
  // course quand la fenêtre est bien à l'écran.
  window.setTimeout(retirer, 1500);
});
