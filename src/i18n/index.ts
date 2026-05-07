import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { readLanguage, writeLanguage } from '../services/storage';

// Lit la langue sauvegardée dans le stockage, ou utilise le français par défaut
function getInitialLanguage(): string {
  const saved = readLanguage();
  return saved === 'fr' || saved === 'en' ? saved : 'fr';
}

// Initialise i18next avec les ressources fr/en au démarrage de l'application
void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

// Change la langue active dans i18next et la persiste dans le stockage
export function setLanguage(lang: 'fr' | 'en') {
  void i18n.changeLanguage(lang);
  writeLanguage(lang);
}

// Retourne la langue active ('fr' ou 'en'), avec 'fr' comme valeur par défaut
export function getCurrentLanguage(): 'fr' | 'en' {
  return (i18n.language === 'en' ? 'en' : 'fr');
}

export default i18n;
