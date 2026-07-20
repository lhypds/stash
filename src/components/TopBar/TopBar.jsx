import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@components/LanguageSwitcher";
import SettingsModal from "@components/SettingsModal";
import { useUser } from "@utils/UserContext";
import styles from "./topbar.module.css";

const PLATFORMS = ["ios", "android"];
const PLATFORM_LABELS = { ios: "iOS", android: "Android" };

export default function TopBar({ onSearch, onRequestLogin }) {
  const { t } = useTranslation();
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [platform, setPlatform] = useState("ios");
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  function submit(e) {
    e.preventDefault();
    const q = term.trim();
    if (q) onSearch?.(q, platform);
  }

  return (
    <header className={styles.bar}>
      <Link to={user ? `/${user}` : "/"} className={styles.logo}>
        stash
      </Link>

      <form className={styles.search} onSubmit={submit} role="search">
        <div className={styles.platforms}>
          {PLATFORMS.map((p) => (
            <button key={p} type="button" data-active={platform === p} onClick={() => setPlatform(p)}>
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
        <input
          className={styles.input}
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t(`app.searchPlaceholder.${platform}`)}
        />
        <button type="submit" className={styles.submit} aria-label={t(`app.searchPlaceholder.${platform}`)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
      </form>

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
                  window.location.assign(`/api/users/${user}/export.zip`);
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

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
