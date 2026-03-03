import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ko from './locales/ko.json';
import en from './locales/en.json';
import fr from './locales/fr.json';
import sw from './locales/sw.json';

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
    fr: { translation: fr },
    sw: { translation: sw },
  },
  lng: localStorage.getItem('lang') || 'ko', // 저장된 언어 또는 기본 한국어
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
