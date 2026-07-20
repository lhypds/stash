import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { showToast } from "@ui";
import { TopBar, LoginModal, AppCard, ResultCard, AppDetailModal, ConfirmModal } from "@components";
import * as api from "@utils/api";
import { useUser } from "@contexts/UserContext";
import styles from "./stash.module.css";

const countryForLang = (lang) => (lang === "ja" ? "jp" : lang === "zh" ? "cn" : "us");
const itemKey = (a) => `${a.store}:${a.itemId}`;

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
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setSearch(null);
    setDetail(null);
    setFilterText("");
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

  const stashedKeys = useMemo(() => new Set(items.map(itemKey)), [items]);
  const visibleItems = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return items
      .filter((a) => !storeFilter || a.store === storeFilter)
      .filter((a) => !q || [a.name, a.byline, a.note].some((f) => f?.toLowerCase().includes(q)))
      .sort((a, b) => (b.stashedAt || "").localeCompare(a.stashedAt || ""));
  }, [items, storeFilter, filterText]);

  async function handleSearch(term, store) {
    const isUrl = api.URL_STORES.has(store);
    setSearch({ term, store, loading: true, results: [] });
    try {
      if (isUrl) {
        const { result } = await api.analyzeUrl(store, term);
        setSearch({ term, store, loading: false, results: [result] });
      } else {
        const { results } = await api.searchStore(store, term, countryForLang(i18n.language));
        setSearch({ term, store, loading: false, results });
      }
    } catch {
      setSearch(null);
      showToast(t(isUrl ? "app.analyzeFailed" : "app.searchFailed"));
    }
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
      <TopBar onSearch={handleSearch} onStoreChange={setStoreFilter} onRequestLogin={() => setLoginOpen(true)} />
      <main className={styles.main}>
        {search ? (
          <>
            <div className={styles.head}>
              <h2 className={`${styles.heading} ${styles.resultsHeading}`}>
                {t("app.resultsFor", { term: search.term })}
              </h2>
              <button className={styles.closeResults} onClick={() => setSearch(null)}>
                ✕ {t("app.backToStash")}
              </button>
            </div>
            {search.loading ? (
              <p className={styles.hint}>
                {t(api.URL_STORES.has(search.store) ? "app.analyzing" : "app.searching")}
              </p>
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
              <h2 className={styles.heading}>@{username}</h2>
              <span className={styles.count}>{visibleItems.length}</span>
              <label className={styles.filter}>
                <input
                  className={styles.filterInput}
                  type="search"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  aria-label={t("app.filterStash")}
                />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </label>
            </div>
            {loading ? (
              <p className={styles.hint}>{t("common.loading")}</p>
            ) : loadError ? (
              <p className={styles.hint}>{t("app.userNotFound")}</p>
            ) : visibleItems.length === 0 ? (
              <p className={styles.hint}>{t(filterText.trim() ? "app.noResults" : "app.emptyStash")}</p>
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
