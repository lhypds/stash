import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ConfirmModal from "@components/ConfirmModal";
import LanguageSwitcher from "@components/LanguageSwitcher";
import LockModal from "@components/LockModal";
import SettingsModal from "@components/SettingsModal";
import { useUser } from "@contexts/UserContext";
import { isIOS } from "@utils/mobile";
import styles from "./topbar.module.css";

// The universal analyser: one box that filters the stash as you type, and — on
// submit — analyzes whatever's pasted (links become Pages/Posts/Videos/
// Channels; plain text falls back to an app-store search).
export default function TopBar({ query, onQueryChange, onAnalyze, onRequestLogin }) {
  const { t } = useTranslation();
  const { user, hasLock, locked, logout, unlock, setPasswordAndLock, relock, refreshLock } = useUser();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [lockMode, setLockMode] = useState("setup");
  const [afterUnlock, setAfterUnlock] = useState(null);
  const [confirmExport, setConfirmExport] = useState(false);
  const menuRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    }
    function handleKey(e) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setMenuOpen(false);
      setExportOpen(false);
      onQueryChange?.("");
    }
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onQueryChange]);

  function submit(e) {
    e.preventDefault();
    onAnalyze?.(query);
  }

  function requestUnlock(action = null) {
    setLockMode("unlock");
    setAfterUnlock(action);
    setLockOpen(true);
  }

  async function handleLockClick() {
    if (locked) {
      requestUnlock();
    } else if (hasLock) {
      try {
        await relock();
      } catch {
        // The session may have expired; the next action will surface login.
      }
    } else {
      setLockMode("setup");
      setAfterUnlock(null);
      setLockOpen(true);
    }
  }

  function finishUnlock() {
    if (afterUnlock === "settings") setSettingsOpen(true);
    if (afterUnlock === "export") setConfirmExport(true);
    setAfterUnlock(null);
  }

  return (
    <header className={styles.bar}>
      <Link to={user ? `/${user}` : "/"} className={styles.logo}>
        stash
      </Link>

      <form className={styles.search} onSubmit={submit} role="search">
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder={t("app.universalPlaceholder")}
          enterKeyHint="search"
          // iOS scrolls the page to "reveal" inputs inside the sticky bar
          // and can leave it stuck under the bar after the keyboard closes
          onBlur={isIOS ? () => window.scrollTo(0, 0) : undefined}
        />
        <button type="submit" className={styles.submit} aria-label={t("app.analyze")} title={t("app.analyze")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 10 4 15 9 20" />
            <path d="M20 4v7a4 4 0 0 1-4 4H4" />
          </svg>
        </button>
      </form>

      <div className={styles.right}>
        {user && (
          <button
            type="button"
            className={styles.lock}
            data-locked={locked}
            onClick={handleLockClick}
            aria-label={t(locked ? "app.unlockStash" : "app.lockStash")}
            title={t(locked ? "app.unlockStash" : "app.lockStash")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d={locked ? "M8 10V7a4 4 0 0 1 8 0v3" : "M8 10V7a4 4 0 0 1 7.5-2"} />
            </svg>
          </button>
        )}
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
              aria-haspopup="menu"
              aria-expanded={exportOpen}
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
                  if (locked) requestUnlock("export");
                  else setConfirmExport(true);
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
            <button
              className={styles.profile}
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={user}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            </button>
            <div className={styles.menu}>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (locked) requestUnlock("settings");
                  else setSettingsOpen(true);
                }}
              >
                @{user}
              </button>
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await logout();
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
      <LockModal
        isOpen={lockOpen}
        mode={lockMode}
        onClose={() => setLockOpen(false)}
        onSubmit={lockMode === "unlock" ? unlock : setPasswordAndLock}
        onSuccess={lockMode === "unlock" ? finishUnlock : undefined}
      />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => refreshLock().catch(() => {})}
      />
    </header>
  );
}
