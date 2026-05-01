import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';
import { readLanguage, writeLanguage } from '../services/storage';

function getInitialLanguage(): string {
  const saved = readLanguage();
  return saved === 'fr' || saved === 'en' ? saved : 'fr';
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: 'fr' | 'en') {
  void i18n.changeLanguage(lang);
  writeLanguage(lang);
}

export function getCurrentLanguage(): 'fr' | 'en' {
  return (i18n.language === 'en' ? 'en' : 'fr');
}

export default i18n;
