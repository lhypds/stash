import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zh from "./zh.json";
import ja from "./ja.json";

const SUPPORTED_LANGS = ["en", "zh", "ja"];
const normalizeLang = (lang) => String(lang || "").toLowerCase().split("-")[0];

// A stored value exists only after the user explicitly uses the language
// switcher. Until then, honor the browser's ordered language preferences and
// fall back to English when none of them are supported.
const savedLang = normalizeLang(localStorage.getItem("lang"));
const browserLang = (navigator.languages || [navigator.language])
  .map(normalizeLang)
  .find((lang) => SUPPORTED_LANGS.includes(lang));
const defaultLang = SUPPORTED_LANGS.includes(savedLang) ? savedLang : browserLang || "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    ja: { translation: ja },
  },
  lng: defaultLang,
  supportedLngs: SUPPORTED_LANGS,
  load: "languageOnly",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
