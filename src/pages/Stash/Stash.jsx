import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { showToast } from "@ui";
import { TopBar, LoginModal, AppCard, ResultCard, AppDetailModal, ConfirmModal } from "@components";
import * as api from "@utils/api";
import { useUser } from "@contexts/UserContext";
import styles from "./stash.module.css";

const countryForLang = (lang) => (lang === "ja" ? "jp" : lang === "zh" ? "cn" : "us");
const itemKey = (a) => `${a.store}:${a.itemId}`;

const MAX_URLS = 10;

// Pasted "share" text buries the link among emoji and captions, and can hold
// several at once (e.g. RedNote's "15 【…】 😆 code 😆 https://…"). Pull out
// every http(s) URL, trim punctuation that tends to cling to the end, and
// drop duplicates.
function extractUrls(text) {
  const matches = String(text).match(/https?:\/\/[^\s<>"'`）】」』]+/gi) || [];
  const seen = new Set();
  const urls = [];
  for (const match of matches) {
    const trimmed = match.replace(/[.,;:!?、。，！？）)\]}】」』>"'`]+$/u, "");
    let href;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      href = u.href;
    } catch {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    urls.push(href);
  }
  return urls;
}

export default function Stash() {
  const { username } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const isOwner = user === username;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [storeFilter, setStoreFilter] = useState(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [query, setQuery] = useState("");
  const storeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setSearch(null);
    setDetail(null);
    setStoreFilter(null);
    setQuery("");
    api
      .getStash(username)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [username]);

  // Page screenshots are captured in the background after stashing; while the
  // detail of a page without one is open, poll until the capture lands
  useEffect(() => {
    if (!detail || detail.store !== "pages" || detail.screenshotUrl) return;
    let cancelled = false;
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 20) return clearInterval(timer);
      api
        .getStash(username)
        .then((data) => {
          if (cancelled) return;
          const fresh = data.items.find((a) => itemKey(a) === itemKey(detail));
          if (fresh?.screenshotUrl) {
            setItems(data.items);
            setDetail(fresh);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [detail, username]);

  // Close the store-filter dropdown on an outside tap/click or Escape
  useEffect(() => {
    function handleOutside(e) {
      if (storeRef.current && !storeRef.current.contains(e.target)) setStoreOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape" && storeRef.current?.contains(document.activeElement)) {
        setStoreOpen(false);
        storeRef.current.querySelector("button")?.focus();
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  // Arrow-key navigation for the store filter: open on ArrowDown, then move
  // focus between options (they're real buttons, so Enter/Space just work)
  function handleStoreKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!storeOpen) {
      setStoreOpen(true);
      return;
    }
    const opts = [...storeRef.current.querySelectorAll('[role="option"]')];
    const i = opts.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? i + 1 : i - 1;
    opts[(next + opts.length) % opts.length]?.focus();
  }

  const stashedKeys = useMemo(() => new Set(items.map(itemKey)), [items]);
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((a) => !storeFilter || a.store === storeFilter)
      .filter((a) => !q || [a.name, a.byline, a.note].some((f) => f?.toLowerCase().includes(q)))
      .sort((a, b) => (b.stashedAt || "").localeCompare(a.stashedAt || ""));
  }, [items, storeFilter, query]);

  // The brain: analyze whatever is in the box. Links are pulled out and each
  // is auto-typed by the server (Page/Post/Video/Channel). Plain text with no
  // link falls back to an app-store search, honoring the store filter when
  // it names an app store and defaulting to iOS otherwise.
  async function handleAnalyze(text) {
    const term = text.trim();
    if (!term) return;

    const found = extractUrls(term);
    if (found.length === 0) {
      const store = storeFilter === "ios-apps" || storeFilter === "android-apps" ? storeFilter : "ios-apps";
      setQuery("");
      setSearch({ term, mode: "search", loading: true, results: [] });
      try {
        const { results } = await api.searchStore(store, term, countryForLang(i18n.language));
        setSearch({ term, mode: "search", loading: false, results });
      } catch {
        setSearch(null);
        showToast(t("app.searchFailed"));
      }
      return;
    }

    // A share blurb can bury the link among emoji and captions, or carry a
    // batch at once. Analyze each; anything we can't read (e.g. a 404) opens
    // in a new tab so the user can still get to it.
    const urls = found.slice(0, MAX_URLS);
    if (found.length > MAX_URLS) showToast(t("app.urlsCapped", { max: MAX_URLS }));

    setQuery("");
    setSearch({ term, mode: "analyze", loading: true, results: [] });
    const country = countryForLang(i18n.language);
    const settled = await Promise.allSettled(urls.map((u) => api.analyzeUrl(u, country)));
    const results = [];
    const failed = [];
    settled.forEach((outcome, i) => {
      if (outcome.status === "fulfilled") results.push(outcome.value.result);
      else failed.push(urls[i]);
    });

    for (const u of failed) window.open(u, "_blank", "noopener,noreferrer");
    setSearch(results.length ? { term, mode: "analyze", loading: false, results } : null);
    if (failed.length) showToast(t("app.openedFailed", { count: failed.length }));
  }

  async function handleStash(result) {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    try {
      const { item } = await api.stashItem(user, result);
      if (isOwner) setItems((prev) => [item, ...prev]);
      setSearch(null);
      const name = item.name.length > 40 ? `${item.name.slice(0, 40)}…` : item.name;
      showToast(t("app.toastStashed", { name }));
    } catch (err) {
      showToast(err.status === 409 ? t("app.toastAlready") : t("app.toastError"));
    }
  }

  async function handleSaveItem(item, patch) {
    try {
      const { item: updated } = await api.updateItem(username, item.store, item.itemId, patch);
      setItems((prev) => prev.map((a) => (itemKey(a) === itemKey(updated) ? updated : a)));
      setDetail(null);
      showToast(t("app.toastSaved"));
    } catch {
      showToast(t("app.toastError"));
    }
  }

  function handleDeleteItem(item) {
    setConfirm({ message: t("app.confirmDelete"), action: () => deleteItem(item) });
  }

  async function deleteItem(item) {
    try {
      await api.removeItem(username, item.store, item.itemId);
      setItems((prev) => prev.filter((a) => itemKey(a) !== itemKey(item)));
      setDetail(null);
      showToast(t("app.toastDeleted"));
    } catch {
      showToast(t("app.toastError"));
    }
  }

  return (
    <div className={styles.page}>
      <TopBar
        query={query}
        onQueryChange={setQuery}
        onAnalyze={handleAnalyze}
        onRequestLogin={() => setLoginOpen(true)}
      />
      <main className={styles.main}>
        {search ? (
          <>
            <div className={styles.head}>
              <h2 className={`${styles.heading} ${styles.resultsHeading}`}>
                {search.mode === "analyze"
                  ? t("app.analysisResults")
                  : t("app.resultsFor", { term: search.term })}
              </h2>
              <button className={styles.closeResults} onClick={() => setSearch(null)}>
                ✕ {t("app.backToStash")}
              </button>
            </div>
            {search.loading ? (
              <p className={styles.hint}>{t(search.mode === "search" ? "app.searching" : "app.analyzing")}</p>
            ) : search.results.length === 0 ? (
              <p className={styles.hint}>{t("app.noResults")}</p>
            ) : (
              <div className={styles.grid}>
                {search.results.map((r) => (
                  <ResultCard
                    key={itemKey(r)}
                    result={r}
                    stashed={isOwner && stashedKeys.has(itemKey(r))}
                    onStash={() => handleStash(r)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.head}>
              <div
                className={styles.storeFilter}
                ref={storeRef}
                data-open={storeOpen}
                onMouseLeave={() => setStoreOpen(false)}
                onKeyDown={handleStoreKeyDown}
              >
                <button
                  type="button"
                  className={styles.storeTrigger}
                  onClick={() => setStoreOpen((v) => !v)}
                  aria-label={t("app.storeSelect")}
                  aria-haspopup="listbox"
                  aria-expanded={storeOpen}
                >
                  {storeFilter ? t(`app.storeNames.${storeFilter}`) : t("app.allStores")}
                  <span className={styles.caret}>▾</span>
                </button>
                <div className={styles.storeMenu} role="listbox">
                  <button
                    type="button"
                    role="option"
                    aria-selected={!storeFilter}
                    data-active={!storeFilter}
                    onClick={() => {
                      setStoreFilter(null);
                      setStoreOpen(false);
                    }}
                  >
                    {t("app.allStores")}
                  </button>
                  {api.STORE_KEYS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="option"
                      aria-selected={s === storeFilter}
                      data-active={s === storeFilter}
                      onClick={() => {
                        setStoreFilter(s);
                        setStoreOpen(false);
                      }}
                    >
                      {t(`app.storeNames.${s}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {loading ? (
              <p className={styles.hint}>{t("common.loading")}</p>
            ) : loadError ? (
              <p className={styles.hint}>{t("app.userNotFound")}</p>
            ) : visibleItems.length === 0 ? (
              <p className={styles.hint}>{t(query.trim() || storeFilter ? "app.noResults" : "app.emptyStash")}</p>
            ) : (
              <div className={styles.grid}>
                {visibleItems.map((a) => (
                  <AppCard key={itemKey(a)} app={a} onClick={() => setDetail(a)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      {detail && (
        <AppDetailModal
          app={detail}
          isOwner={isOwner}
          onClose={() => setDetail(null)}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
        />
      )}
      <ConfirmModal
        isOpen={!!confirm}
        message={confirm?.message}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          confirm.action();
        }}
      />
    </div>
  );
}
