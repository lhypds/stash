import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { showToast } from "@ui";
import { TopBar, LoginModal, AppCard, ResultCard, AppDetailModal, ConfirmModal } from "@components";
import * as api from "@utils/api";
import { useUser } from "@utils/UserContext";
import styles from "./stash.module.css";

const countryForLang = (lang) => (lang === "ja" ? "jp" : lang === "zh" ? "cn" : "us");
const appKey = (a) => `${a.platform}:${a.bundleId}`;

export default function Stash() {
  const { username } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useUser();
  const isOwner = user === username;

  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);

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
        setApps(data.apps);
      })
      .catch(() => !cancelled && setLoadError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [username]);

  const stashedKeys = useMemo(() => new Set(apps.map(appKey)), [apps]);

  async function handleSearch(term, platform) {
    setSearch({ term, platform, loading: true, results: [] });
    try {
      const { results } = await api.searchApps(term, platform, countryForLang(i18n.language));
      setSearch({ term, platform, loading: false, results });
    } catch {
      setSearch(null);
      showToast(t("app.searchFailed"));
    }
  }

  async function handleStash(result) {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    try {
      const { app } = await api.stashApp(user, result);
      if (isOwner) setApps((prev) => [app, ...prev]);
      showToast(t("app.toastStashed", { name: app.name }));
    } catch (err) {
      showToast(err.status === 409 ? t("app.toastAlready") : t("app.toastError"));
    }
  }

  async function handleSaveApp(app, patch) {
    try {
      const { app: updated } = await api.updateApp(username, app.platform, app.bundleId, patch);
      setApps((prev) => prev.map((a) => (appKey(a) === appKey(updated) ? updated : a)));
      setDetail(updated);
      showToast(t("app.toastSaved"));
    } catch {
      showToast(t("app.toastError"));
    }
  }

  function handleDeleteApp(app) {
    setConfirm({ message: t("app.confirmDelete"), action: () => deleteApp(app) });
  }

  async function deleteApp(app) {
    try {
      await api.removeApp(username, app.platform, app.bundleId);
      setApps((prev) => prev.filter((a) => appKey(a) !== appKey(app)));
      setDetail(null);
      showToast(t("app.toastDeleted"));
    } catch {
      showToast(t("app.toastError"));
    }
  }

  return (
    <div className={styles.page}>
      <TopBar onSearch={handleSearch} onRequestLogin={() => setLoginOpen(true)} />
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
              <p className={styles.hint}>{t("app.searching")}</p>
            ) : search.results.length === 0 ? (
              <p className={styles.hint}>{t("app.noResults")}</p>
            ) : (
              <div className={styles.grid}>
                {search.results.map((r) => (
                  <ResultCard
                    key={appKey(r)}
                    result={r}
                    stashed={isOwner && stashedKeys.has(appKey(r))}
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
              <span className={styles.count}>{apps.length}</span>
            </div>
            {loading ? (
              <p className={styles.hint}>{t("common.loading")}</p>
            ) : loadError ? (
              <p className={styles.hint}>{t("app.userNotFound")}</p>
            ) : apps.length === 0 ? (
              <p className={styles.hint}>{t("app.emptyStash")}</p>
            ) : (
              <div className={styles.grid}>
                {apps.map((a) => (
                  <AppCard key={appKey(a)} app={a} onClick={() => setDetail(a)} />
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
          onSave={handleSaveApp}
          onDelete={handleDeleteApp}
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
