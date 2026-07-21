import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { showToast } from "@ui";
import { LoginModal, ItemCard, ItemDetailModal, ConfirmModal, FilterDropdown } from "@components";
import TopBar from "./TopBar";
import * as api from "@utils/api";
import { extractUrls, sourceName } from "@utils/url";
import { useUser } from "@contexts/UserContext";
import styles from "./stash.module.css";

const countryForLang = (lang) => (lang === "ja" ? "jp" : lang === "zh" ? "cn" : "us");
const itemKey = (a) => `${a.store}:${a.itemId}`;

const MAX_URLS = 10;

export default function Stash() {
  const { username } = useParams();
  const { t, i18n } = useTranslation();
  const { user, locked, refreshLock } = useUser();
  const isOwner = user === username;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [storeFilter, setStoreFilter] = useState(null);
  const [sourceFilter, setSourceFilter] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setSearch(null);
    setDetail(null);
    setStoreFilter(null);
    setSourceFilter(null);
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

  // Page and chat screenshots are captured in the background after stashing;
  // while the detail of one without a shot is open, poll until the capture lands
  useEffect(() => {
    if (!detail || !api.SHOT_STORES.has(detail.store) || detail.screenshotUrl) return;
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

  // A lock change invalidates any destructive action that was already waiting
  // for confirmation (including a lock applied from another browser context).
  useEffect(() => {
    if (locked) setConfirm(null);
  }, [locked]);

  const stashedKeys = useMemo(() => new Set(items.map(itemKey)), [items]);
  // The platforms present in this stash (YouTube, Bilibili, …), derived from
  // each item's URL. Sorted so the source filter's options stay stable.
  const sources = useMemo(
    () => [...new Set(items.map((a) => sourceName(a.url)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((a) => !storeFilter || a.store === storeFilter)
      .filter((a) => !sourceFilter || sourceName(a.url) === sourceFilter)
      .filter((a) => !q || [a.name, a.byline, a.note].some((f) => f?.toLowerCase().includes(q)))
      .sort((a, b) => (b.stashedAt || "").localeCompare(a.stashedAt || ""));
  }, [items, storeFilter, sourceFilter, query]);

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
    if (locked) {
      showToast(t("app.unlockFirst"));
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
    if (locked) {
      showToast(t("app.unlockFirst"));
      return;
    }
    try {
      const { item: updated } = await api.updateItem(username, item.store, item.itemId, patch);
      setItems((prev) => prev.map((a) => (itemKey(a) === itemKey(updated) ? updated : a)));
      setDetail(null);
      showToast(t("app.toastSaved"));
    } catch (err) {
      if (err.code === "STASH_LOCKED") {
        await refreshLock().catch(() => {});
        showToast(t("app.unlockFirst"));
      } else {
        showToast(t("app.toastError"));
      }
    }
  }

  function handleDeleteItem(item) {
    if (locked) {
      showToast(t("app.unlockFirst"));
      return;
    }
    setConfirm({ message: t("app.confirmDelete"), action: () => deleteItem(item) });
  }

  async function deleteItem(item) {
    if (locked) {
      showToast(t("app.unlockFirst"));
      return;
    }
    try {
      await api.removeItem(username, item.store, item.itemId);
      setItems((prev) => prev.filter((a) => itemKey(a) !== itemKey(item)));
      setDetail(null);
      showToast(t("app.toastDeleted"));
    } catch (err) {
      if (err.code === "STASH_LOCKED") {
        await refreshLock().catch(() => {});
        showToast(t("app.unlockFirst"));
      } else {
        showToast(t("app.toastError"));
      }
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
                  <ItemCard
                    key={itemKey(r)}
                    mode="result"
                    item={r}
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
              <FilterDropdown
                label={t("app.storeSelect")}
                allLabel={t("app.allStores")}
                value={storeFilter}
                options={api.STORE_KEYS}
                getLabel={(s) => t(`app.storeNames.${s}`)}
                onChange={setStoreFilter}
              />
              {sources.length > 0 && (
                <FilterDropdown
                  label={t("app.sourceSelect")}
                  allLabel={t("app.allSources")}
                  value={sourceFilter}
                  options={sources}
                  onChange={setSourceFilter}
                />
              )}
            </div>
            {loading ? (
              <p className={styles.hint}>{t("common.loading")}</p>
            ) : loadError ? (
              <p className={styles.hint}>{t("app.userNotFound")}</p>
            ) : visibleItems.length === 0 ? (
              <p className={styles.hint}>
                {t(query.trim() || storeFilter || sourceFilter ? "app.noResults" : "app.emptyStash")}
              </p>
            ) : (
              <div className={styles.grid}>
                {visibleItems.map((a) => (
                  <ItemCard key={itemKey(a)} item={a} onClick={() => setDetail(a)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      {detail && (
        <ItemDetailModal
          item={detail}
          isOwner={isOwner}
          locked={locked}
          onClose={() => setDetail(null)}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
        />
      )}
      <ConfirmModal
        isOpen={!!confirm}
        message={confirm?.message}
        confirmDisabled={locked}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (locked) {
            setConfirm(null);
            showToast(t("app.unlockFirst"));
            return;
          }
          setConfirm(null);
          confirm.action();
        }}
      />
    </div>
  );
}
