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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setSearch(null);
    setDetail(null);
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

  const stashedKeys = useMemo(() => new Set(items.map(itemKey)), [items]);
  const visibleItems = useMemo(
    () =>
      (storeFilter ? items.filter((a) => a.store === storeFilter) : items)
        .slice()
        .sort((a, b) => (b.stashedAt || "").localeCompare(a.stashedAt || "")),
    [items, storeFilter],
  );

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
      setDetail(updated);
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
              <h2 className={styles.heading}>{t("app.resultsFor", { term: search.term })}</h2>
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
            </div>
            {loading ? (
              <p className={styles.hint}>{t("common.loading")}</p>
            ) : loadError ? (
              <p className={styles.hint}>{t("app.userNotFound")}</p>
            ) : visibleItems.length === 0 ? (
              <p className={styles.hint}>{t("app.emptyStash")}</p>
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
