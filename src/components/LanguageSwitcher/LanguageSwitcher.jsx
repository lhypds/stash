import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import styles from "./lang.module.css";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "zh", label: "ZH" },
  { code: "ja", label: "JA" },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = LANGS.find((l) => l.code === i18n.language) || LANGS[0];
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  function switchLang(code) {
    i18n.changeLanguage(code);
    localStorage.setItem("lang", code);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={styles.wrapper} data-open={open} onMouseLeave={() => setOpen(false)}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((v) => !v)}>
        <span className={styles.label}>{current.label}</span>
      </button>
      <div className={styles.dropdown}>
        {LANGS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            className={`${styles.option} ${i18n.language === code ? styles.active : ""}`}
            onClick={() => switchLang(code)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
