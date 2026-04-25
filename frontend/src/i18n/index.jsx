import { createContext, useContext, useState } from 'react';
import en from './translations/en';
import he from './translations/he';
import es from './translations/es';
import ar from './translations/ar';

const LANGS = { en, he, es, ar };

export const LANG_META = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'he', label: 'עברית',  flag: '🇮🇱' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
];

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState('he');
  const t = (key, vars = {}) => {
    let str = LANGS[lang]?.[key] ?? LANGS.en[key] ?? key;
    Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
    return str;
  };
  const dir = LANGS[lang]?.dir ?? 'ltr';
  return (
    <LangContext.Provider value={{ lang, setLang, t, dir }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
