import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { showToast } from "@ui";
import {
  LoginModal,
  ItemCard,
  ItemDetailModal,
  ConfirmModal,
  FilterDropdown,
  NoteModal,
  StashAsModal,
} from "@components";
import TopBar from "./TopBar";
import * as api from "@utils/api";
import { extractUrls, isPrivateChatGPTUrl, sourceName, sourceBucket, OTHER_SOURCE } from "@utils/url";
import { itemMeta, itemTitle } from "@utils/item";
import { isNoteFile } from "@utils/file";
import { useUser } from "@contexts/UserContext";
import styles from "./stash.module.css";

const countryForLang = (lang) => (lang === "ja" ? "jp" : lang === "zh" ? "cn" : "us");
const itemKey = (a) => `${a.store}:${a.itemId}`;
// What to call an item in a toast. Names run long (a note's whole first line, a
// page's full title), so keep it to one readable line; a nameless item (a
// caption-less clip) borrows its type label, since the toast is a sentence and
// needs a subject where a card can simply show none.
const toastName = (item, t) => {
  const name = itemTitle(item, t) || t(`app.kinds.${item.kind}`);
  return name.length > 40 ? `${name.slice(0, 40)}…` : name;
};

const MAX_URLS = 10;

// A search can span several stores (Apps, Skills, …); within the merged list,
// float items whose name exactly matches the query above everything else,
// keeping each side's own relative order (a stable sort).
function withExactMatchesFirst(results, term) {
  const q = term.trim().toLowerCase();
  const isExact = (item) => item.name?.trim().toLowerCase() === q;
  return [...results].sort((a, b) => Number(isExact(b)) - Number(isExact(a)));
}

export default function Stash() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, locked, refreshLock } = useUser();
  const isOwner = user === username;

  const [items, setItems] = useState([]);
  const [viewerItems, setViewerItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  // The item waiting on a store pick (an Option-click on a Stash button), and
  // whether it is a copy out of someone else's stash rather than a fresh result.
  const [stashAs, setStashAs] = useState(null);
  const [query, setQuery] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteFile, setNoteFile] = useState(null);

  // The store/source filters live in the URL (?store=&source=) so a filtered
  // view is shareable and survives a reload. A missing param means "All";
  // an unknown store falls back to All rather than showing an empty grid.
  const [searchParams, setSearchParams] = useSearchParams();
  const storeParam = searchParams.get("store");
  const storeFilter = api.STORE_KEYS.includes(storeParam) ? storeParam : null;
  const sourceFilter = searchParams.get("source");
  const setFilters = (patch) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setSearch(null);
    setDetail(null);
    setQuery("");
    api
      .getStash(username)
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.status === 404) {
          navigate("/", { replace: true, state: { username } });
          return;
        }
        setLoadError(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [navigate, username]);

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

  // A lock change invalidates any action that was already waiting on a dialog
  // (including a lock applied from another browser context).
  useEffect(() => {
    if (!locked) return;
    setConfirm(null);
    setStashAs(null);
  }, [locked]);

  // Escape while viewing results does the same thing as "Back to stash".
  useEffect(() => {
    if (!search) return;
    function handleKey(e) {
      if (e.defaultPrevented || e.key !== "Escape") return;
      setSearch(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [search]);

  // Browsing someone else's stash: fetch the viewer's own items too, so their
  // already-stashed copies of these items can be greyed out.
  useEffect(() => {
    if (isOwner || !user) {
      setViewerItems([]);
      return;
    }
    let cancelled = false;
    api
      .getStash(user)
      .then((data) => {
        if (!cancelled) setViewerItems(data.items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOwner, user]);

  // Whether a card is already in hand is a question about the source, not the
  // shelf: an itemId is a hash of the item's own URL (see analyzeSource), so it
  // identifies the thing itself wherever a "stash as" happened to file it —
  // unlike itemKey, which identifies one stored copy and stays store-qualified.
  const stashedIds = useMemo(() => new Set(items.map((a) => a.itemId)), [items]);
  const viewerStashedIds = useMemo(() => new Set(viewerItems.map((a) => a.itemId)), [viewerItems]);
  // The platforms present in the selected store (YouTube, Bilibili, …),
  // derived from each item's URL. With All Stores selected, include every
  // source. Sorted so the source filter's options stay stable.
  const sources = useMemo(
    () =>
      [
        ...new Set(
          items
            .filter((a) => !storeFilter || a.store === storeFilter)
            .map((a) => sourceBucket(a.url))
            .filter(Boolean),
        ),
      ].sort((a, b) => (a === OTHER_SOURCE ? 1 : b === OTHER_SOURCE ? -1 : a.localeCompare(b))),
    [items, storeFilter],
  );
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((a) => !storeFilter || a.store === storeFilter)
      .filter((a) => !sourceFilter || sourceBucket(a.url) === sourceFilter)
      .filter(
        (a) =>
          !q ||
          [itemTitle(a, t), a.byline, a.note, sourceName(a.url), itemMeta(a, t)].some((f) =>
            f?.toLowerCase().includes(q),
          ),
      )
      .sort((a, b) => (b.stashedAt || "").localeCompare(a.stashedAt || ""));
  }, [items, storeFilter, sourceFilter, query, t]);

  // The brain: analyze whatever is in the box. Links are pulled out and each
  // is auto-typed by the server (Page/Post/Video/Channel). Plain text with no
  // link falls back to a keyword search — honoring the store filter when it
  // names a search store (apps, skills), and querying every search store at
  // once otherwise so e.g. a skill name still turns up with "All" selected.
  async function handleAnalyze(text) {
    const term = text.trim();
    if (!term) return;

    const found = extractUrls(term);
    if (found.length === 0) {
      const stores = storeFilter && api.SEARCH_STORES.has(storeFilter) ? [storeFilter] : [...api.SEARCH_STORES];
      setQuery("");
      setSearch({ term, mode: "search", loading: true, results: [] });
      const country = countryForLang(i18n.language);
      const settled = await Promise.allSettled(stores.map((s) => api.searchStore(s, term, country)));
      const results = settled.filter((r) => r.status === "fulfilled").flatMap((r) => r.value.results);
      if (results.length === 0 && settled.every((r) => r.status === "rejected")) {
        setSearch(null);
        showToast(t("app.searchFailed"));
        return;
      }
      setSearch({ term, mode: "search", loading: false, results: withExactMatchesFirst(results, term) });
      return;
    }

    // A share blurb can bury the link among emoji and captions, or carry a
    // batch at once. Analyze each and report failures without unexpectedly
    // navigating the user away from the stash.
    const cappedUrls = found.slice(0, MAX_URLS);
    const privateChatCount = cappedUrls.filter(isPrivateChatGPTUrl).length;
    const urls = cappedUrls.filter((url) => !isPrivateChatGPTUrl(url));
    if (found.length > MAX_URLS) showToast(t("app.urlsCapped", { max: MAX_URLS }));

    setQuery("");
    if (privateChatCount) showToast(t("app.chatgptShareRequired"), 6000);
    if (urls.length === 0) {
      setSearch(null);
      return;
    }
    setSearch({ term, mode: "analyze", loading: true, results: [] });
    const country = countryForLang(i18n.language);
    const settled = await Promise.allSettled(urls.map((u) => api.analyzeUrl(u, country)));
    const results = [];
    const seen = new Set();
    const failed = [];
    // A video's result may carry its channel as `related` (see server
    // analyzeSource) — surface both as separate, independently stashable
    // cards, deduping the channel if several pasted videos share one.
    settled.forEach((outcome, i) => {
      if (outcome.status !== "fulfilled") return failed.push(urls[i]);
      const { related, ...result } = outcome.value.result;
      for (const item of related ? [result, related] : [result]) {
        const key = itemKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(item);
      }
    });

    setSearch(results.length ? { term, mode: "analyze", loading: false, results } : null);
    // A link the server couldn't read still comes back as a card — a bare Page
    // holding the URL (see unanalyzedItem) — so it's worth saying why those
    // cards look empty. Only links whose request never landed are outright lost.
    const bare = results.filter((r) => r.unanalyzed).length;
    if (failed.length) showToast(t("app.analyzeFailedLinks", { count: failed.length }), 6000);
    else if (bare) showToast(t("app.analyzeBareLinks", { count: bare }), 6000);
  }

  // `chooseStore` (an Option-click on the Stash button) hands the result to the
  // store picker instead of stashing it straight away — the login and lock
  // gates still come first, since picking a store you can't stash into is only
  // a longer way to be told to log in.
  async function handleStash(result, { chooseStore = false } = {}) {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    if (locked) {
      showToast(t("app.unlockFirst"));
      return;
    }
    if (chooseStore) {
      setStashAs({ item: result, copy: false });
      return;
    }
    await stashResult(result);
  }

  // `store` files the result somewhere other than the store analysis put it in
  // (see handleStashAs); without one it lands in its own.
  async function stashResult(result, store = null) {
    try {
      const { item } = await api.stashItem(user, store ? { ...result, store } : result);
      if (isOwner) setItems((prev) => [item, ...prev]);
      // With a single result, stashing it is naturally "done" — back to the
      // stash. With more than one (e.g. several pasted links, or a video
      // plus its channel), stay put so the rest can still be stashed; the
      // just-stashed card flips to its disabled "stashed" state instead —
      // and takes on the type of the store it actually landed in, so the card
      // reads the way the stashed item now does.
      if (search?.results.length <= 1) setSearch(null);
      else
        setSearch((prev) =>
          prev
            ? {
                ...prev,
                results: prev.results.map((r) => (r === result ? { ...r, store: item.store, kind: item.kind } : r)),
              }
            : prev,
        );
      showToast(t("app.toastStashed", { name: toastName(item, t) }));
    } catch (err) {
      showToast(err.status === 409 ? t("app.toastAlready") : t("app.toastError"));
    }
  }

  // Confirming the store picker: the same stash or copy the plain click would
  // have run, with the chosen store standing in for the item's own.
  async function handleStashAs(store) {
    const pending = stashAs;
    setStashAs(null);
    if (!pending) return;
    if (pending.copy) await copyItemTo(pending.item, store);
    else await stashResult(pending.item, store);
  }

  // Starting a note — from the + button beside the search box, or from an image
  // dropped on the page, which arrives here as `file` and opens the modal with
  // it already attached. A note is written rather than analyzed, and lands in
  // the viewer's own Notes store behind the same login/lock gates as stashing.
  const startNote = useCallback(
    (file = null) => {
      if (!user) {
        setLoginOpen(true);
        return;
      }
      if (locked) {
        showToast(t("app.unlockFirst"));
        return;
      }
      setNoteFile(file);
      setNoteOpen(true);
    },
    [user, locked, t],
  );

  // An image dropped anywhere on the page starts a note with it attached. The
  // listeners are on the window so that a file dropped outside any drop target
  // still can't be handled by the browser, which would navigate away from the
  // app. dragover has to be prevented for a drop to fire at all.
  useEffect(() => {
    const onDragOver = (e) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };
    const onDrop = (e) => {
      // An open modal handles its own drops (see NoteModal) and marks them done
      if (e.defaultPrevented) return;
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      // Leave a drop over some other dialog to that dialog, rather than stacking
      // a new note on top of it
      if (document.querySelector('[aria-modal="true"]')) return;
      // An image or a text file starts a note (attached / loaded in); anything
      // else is swallowed rather than popping a modal the user can't use
      if (isNoteFile(file)) startNote(file);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [startNote]);

  function closeNote() {
    setNoteOpen(false);
    setNoteFile(null);
  }

  async function handleSaveNote({ text, image, imageName }) {
    if (!user) return;
    try {
      const { item } = await api.createNote(user, { text, image, imageName });
      if (isOwner) setItems((prev) => [item, ...prev]);
      closeNote();
      showToast(t("app.toastStashed", { name: toastName(item, t) }));
    } catch (err) {
      if (err.code === "STASH_LOCKED") {
        await refreshLock().catch(() => {});
        showToast(t("app.unlockFirst"));
      } else if (err.code === "NOTE_EMPTY") {
        showToast(t("app.noteEmpty"));
      } else if (err.code === "INVALID_IMAGE") {
        showToast(t("app.invalidImage"));
      } else if (err.code === "IMAGE_TOO_LARGE") {
        showToast(t("app.imageTooLarge", { max: api.MAX_NOTE_IMAGE_MB }));
      } else {
        showToast(t("app.toastError"));
      }
    }
  }

  // Copies an item from someone else's stash (this page) into the viewer's
  // own, carrying over its note and any icon/screenshot files as-is.
  async function handleCopyItem(item, { chooseStore = false } = {}) {
    if (!user) {
      setLoginOpen(true);
      return;
    }
    if (locked) {
      showToast(t("app.unlockFirst"));
      return;
    }
    if (chooseStore) {
      setStashAs({ item, copy: true });
      return;
    }
    await copyItemTo(item);
  }

  // `store` is where the copy should land; without one it lands in the store it
  // was copied out of.
  async function copyItemTo(item, store = null) {
    try {
      const { item: copied } = await api.copyItem(user, username, item.store, item.itemId, store);
      setViewerItems((prev) => [copied, ...prev]);
      showToast(t("app.toastStashed", { name: toastName(copied, t) }));
    } catch (err) {
      if (err.code === "STASH_LOCKED") {
        await refreshLock().catch(() => {});
        showToast(t("app.unlockFirst"));
      } else {
        showToast(err.status === 409 ? t("app.toastAlready") : t("app.toastError"));
      }
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

  function handleRefreshItem(item) {
    if (locked) {
      showToast(t("app.unlockFirst"));
      return;
    }
    setConfirm({ message: t("app.confirmRefresh"), confirmLabel: t("app.refresh"), action: () => refreshItem(item) });
  }

  async function refreshItem(item) {
    if (locked) {
      showToast(t("app.unlockFirst"));
      return;
    }
    try {
      const country = countryForLang(i18n.language);
      const { item: updated } = await api.refreshItem(username, item.store, item.itemId, country);
      setItems((prev) => prev.map((a) => (itemKey(a) === itemKey(updated) ? updated : a)));
      // Leave ItemDetailModal mounted rather than remounting it, so its note
      // state (which only syncs from `item` on first render) keeps whatever
      // is currently in the field, including an in-progress edit.
      setDetail(updated);
      showToast(t("app.toastRefreshed"));
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
        onAddNote={() => startNote()}
        onRequestLogin={() => setLoginOpen(true)}
        onHome={() => {
          setSearch(null);
          setQuery("");
          setDetail(null);
          setConfirm(null);
        }}
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
                    stashed={isOwner && stashedIds.has(r.itemId)}
                    onStash={(opts) => handleStash(r, opts)}
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
                onChange={(store) => setFilters({ store, source: null })}
              />
              {sources.length > 0 && (
                <FilterDropdown
                  label={t("app.sourceSelect")}
                  allLabel={t("app.allSources")}
                  value={sourceFilter}
                  options={sources}
                  getLabel={(s) => (s === OTHER_SOURCE ? t("app.otherSource") : s)}
                  onChange={(source) => setFilters({ source })}
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
                  <ItemCard
                    key={itemKey(a)}
                    item={a}
                    onClick={() => setDetail(a)}
                    onStash={!isOwner ? (opts) => handleCopyItem(a, opts) : undefined}
                    stashed={!isOwner && viewerStashedIds.has(a.itemId)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      <NoteModal isOpen={noteOpen} initialFile={noteFile} onClose={closeNote} onSave={handleSaveNote} />
      {detail && (
        <ItemDetailModal
          item={detail}
          isOwner={isOwner}
          locked={locked}
          stashed={!isOwner && viewerStashedIds.has(detail.itemId)}
          onClose={() => setDetail(null)}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
          onStash={!isOwner ? (opts) => handleCopyItem(detail, opts) : undefined}
          // Refresh re-analyzes the item's source URL, so it's meaningless for
          // a written note (which has none).
          onRefresh={isOwner && detail.url ? () => handleRefreshItem(detail) : undefined}
        />
      )}
      {/* After the detail modal, so an Option-click on its Stash button opens
          the picker on top of it rather than underneath. */}
      <StashAsModal
        isOpen={!!stashAs}
        item={stashAs?.item}
        // A copy carries its whole record over, so it can land in an authored
        // store (Notes) too — a freshly analyzed result cannot.
        allowWrite={!!stashAs?.copy}
        onClose={() => setStashAs(null)}
        onSelect={handleStashAs}
      />
      <ConfirmModal
        isOpen={!!confirm}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
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
