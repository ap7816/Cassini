import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './app/AppRouter';
import { AppSettingsProvider } from './features/settings/context/AppSettingsProvider';
import './i18n';
import './App.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppSettingsProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AppSettingsProvider>
  </React.StrictMode>,
);

const pre = document.getElementById('app-preloader');
if (pre) {
  pre.classList.add('preloader--done');
  window.setTimeout(() => pre.remove(), 260);
}
