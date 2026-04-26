import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bg from './bg.json';
import en from './en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      bg: { translation: bg },
      en: { translation: en },
    },
    lng: 'bg',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

export default i18n;
