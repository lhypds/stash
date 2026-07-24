import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { showToast } from "@ui";
import ConfirmModal from "@components/ConfirmModal";
import LanguageSwitcher from "@components/LanguageSwitcher";
import LockModal from "@components/LockModal";
import SettingsModal from "@components/SettingsModal";
import SupportModal from "@components/SupportModal";
import { useUser } from "@contexts/UserContext";
import { isIOS } from "@utils/mobile";
import styles from "./topbar.module.css";

// True when a keystroke lands in a text field, so global shortcuts like "/"
// stay out of the way while the user is actually typing.
const isEditable = (el) =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

// The universal analyser: one box that filters the stash as you type, and — on
// submit — analyzes whatever's pasted (links become Pages/Posts/Videos/
// Channels; plain text falls back to an app-store search).
export default function TopBar({ query, onQueryChange, onAnalyze, onRequestLogin, onHome }) {
  const { t } = useTranslation();
  const { user, hasLock, locked, logout, unlock, setPasswordAndLock, relock, refreshLock } = useUser();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [lockMode, setLockMode] = useState("setup");
  const [afterUnlock, setAfterUnlock] = useState(null);
  const [confirmExport, setConfirmExport] = useState(false);
  const menuRef = useRef(null);
  const exportRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
    }
    function handleKey(e) {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        setMenuOpen(false);
        setExportOpen(false);
        onQueryChange?.("");
        return;
      }
      // "/" jumps to the search box — unless the user is already typing
      // somewhere (the box itself, a note, a modal field), where "/" is literal.
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditable(e.target) &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
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

  // Copy the current URL — which now carries the active store/source filters —
  // so the exact view being looked at can be shared.
  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast(t("app.linkCopied"));
    } catch {
      showToast(t("app.copyFailed"));
    }
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
      <Link to={user ? `/${encodeURIComponent(user)}` : "/"} className={styles.logo} onClick={onHome}>
        stash
      </Link>

      <form className={styles.search} onSubmit={submit} role="search">
        <input
          ref={inputRef}
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
        <button
          type="button"
          className={styles.help}
          onClick={() => setHelpOpen(true)}
          aria-label={t("app.supportedSites")}
          title={t("app.supportedSites")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.2 1-1.2 1.8" />
            <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.share}
          onClick={handleShare}
          aria-label={t("app.share")}
          title={t("app.share")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
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
          window.location.assign(`/api/users/${encodeURIComponent(user)}/export.zip`);
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
      <SupportModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}
