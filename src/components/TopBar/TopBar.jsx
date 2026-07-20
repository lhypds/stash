import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ConfirmModal from "@components/ConfirmModal";
import LanguageSwitcher from "@components/LanguageSwitcher";
import SettingsModal from "@components/SettingsModal";
import * as api from "@utils/api";
import { useUser } from "@contexts/UserContext";
import styles from "./topbar.module.css";

// iPadOS reports itself as Mac, hence the maxTouchPoints check
const isIOS =
  /iP(ad|hone|od)/.test(navigator.userAgent) ||
  (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);

export default function TopBar({ onSearch, onStoreChange, onRequestLogin }) {
  const { t } = useTranslation();
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [store, setStore] = useState(() => {
    const saved = localStorage.getItem("stash:store");
    return api.STORE_KEYS.includes(saved) ? saved : api.STORE_KEYS[0];
  });
  const [enabledStores, setEnabledStores] = useState(api.STORE_KEYS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const menuRef = useRef(null);
  const exportRef = useRef(null);
  const storeRef = useRef(null);

  const loadSettings = useCallback(() => {
    if (!user) {
      setEnabledStores(api.STORE_KEYS);
      return;
    }
    api
      .getSettings(user)
      .then(({ settings }) => setEnabledStores(api.STORE_KEYS.filter((s) => settings?.stores?.[s] !== false)))
      .catch(() => setEnabledStores(api.STORE_KEYS));
  }, [user]);

  useEffect(loadSettings, [loadSettings]);

  useEffect(() => {
    if (enabledStores.length && !enabledStores.includes(store)) setStore(enabledStores[0]);
  }, [enabledStores, store]);

  useEffect(() => {
    onStoreChange?.(store);
    setTerm("");
    localStorage.setItem("stash:store", store);
  }, [store, onStoreChange]);

  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
      if (storeRef.current && !storeRef.current.contains(e.target)) setStoreOpen(false);
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  const isUrlStore = api.URL_STORES.has(store);
  const placeholder = isUrlStore
    ? t([`app.urlPlaceholder.${store}`, "app.urlPlaceholder.default"])
    : t(`app.searchPlaceholder.${store}`);

  function submit(e) {
    e.preventDefault();
    const q = term.trim();
    if (q && store) onSearch?.(q, store);
  }

  return (
    <header className={styles.bar}>
      <Link to={user ? `/${user}` : "/"} className={styles.logo}>
        stash
      </Link>

      {enabledStores.length > 0 && (
        <form className={styles.search} onSubmit={submit} role="search">
          <div
            className={styles.storeWrap}
            ref={storeRef}
            data-open={storeOpen}
            onMouseLeave={() => setStoreOpen(false)}
          >
            <button
              type="button"
              className={styles.storeTrigger}
              onClick={() => setStoreOpen((v) => !v)}
              aria-label={t("app.storeSelect")}
            >
              {t(`app.storeNames.${store}`)}
              <span className={styles.caret}>▾</span>
            </button>
            <div className={styles.storeMenu}>
              {enabledStores.map((s) => (
                <button
                  key={s}
                  type="button"
                  data-active={s === store}
                  onClick={() => {
                    setStore(s);
                    setStoreOpen(false);
                  }}
                >
                  {t(`app.storeNames.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <input
            className={styles.input}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={placeholder}
            // iOS scrolls the page to "reveal" inputs inside the sticky bar
            // and can leave it stuck under the bar after the keyboard closes
            onBlur={isIOS ? () => window.scrollTo(0, 0) : undefined}
          />
          {isUrlStore ? (
            <button
              type="submit"
              className={styles.submit}
              aria-label={t("app.analyze")}
              title={t("app.analyze")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="M4 11h14" />
                <path d="M11 4a10.6 10.6 0 0 1 3 7 10.6 10.6 0 0 1-3 7 10.6 10.6 0 0 1-3-7 10.6 10.6 0 0 1 3-7z" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          ) : (
            <button type="submit" className={styles.submit} aria-label={placeholder}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </button>
          )}
        </form>
      )}

      <div className={styles.right}>
        {user && (
          <div
            className={styles.exportWrap}
            ref={exportRef}
            data-open={exportOpen}
            onMouseLeave={() => setExportOpen(false)}
          >
            <button
              className={styles.export}
              onClick={() => setExportOpen((v) => !v)}
              aria-label={t("app.export")}
              title={t("app.export")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M4 21h16" />
              </svg>
            </button>
            <div className={styles.menu}>
              <button
                onClick={() => {
                  setExportOpen(false);
                  setConfirmExport(true);
                }}
              >
                ZIP
              </button>
            </div>
          </div>
        )}
        <LanguageSwitcher />
        {user ? (
          <div
            className={styles.profileWrap}
            ref={menuRef}
            data-open={menuOpen}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button className={styles.profile} onClick={() => setMenuOpen((v) => !v)} aria-label={user}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            </button>
            <div className={styles.menu}>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                @{user}
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  navigate("/");
                }}
              >
                {t("app.logout")}
              </button>
            </div>
          </div>
        ) : (
          <button className={styles.profile} onClick={onRequestLogin} aria-label={t("app.login")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
            </svg>
          </button>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmExport}
        message={t("app.confirmExport")}
        confirmLabel={t("button.download")}
        onCancel={() => setConfirmExport(false)}
        onConfirm={() => {
          setConfirmExport(false);
          window.location.assign(`/api/users/${user}/export.zip`);
        }}
      />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={loadSettings} />
    </header>
  );
}
