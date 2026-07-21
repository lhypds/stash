import { useTranslation } from "react-i18next";
import ItemThumbnail from "@components/ItemThumbnail";
import { sourceName } from "@utils/url";
import styles from "./itemcard.module.css";

const THUMB_KINDS = new Set(["post", "video"]);

// One tile for a stashed item, in two modes:
//   "stash"  — the whole card is a button that opens the detail modal, with a
//              note preview as the trailing line.
//   "result" — a not-yet-stashed search result, with its own Stash button.
export default function ItemCard({ item, mode = "stash", onClick, stashed, onStash }) {
  const { t } = useTranslation();
  const icon = (
    <ItemThumbnail
      src={mode === "result" ? item.icon : item.iconUrl}
      name={item.name}
      fallback={item.kind === "page" ? item.byline : undefined}
      className={THUMB_KINDS.has(item.kind) ? styles.thumb : undefined}
      referrerPolicy={mode === "result" ? item.iconReferrerPolicy : undefined}
    />
  );

  if (mode === "result") {
    return (
      <div className={`${styles.card} ${styles.result}`}>
        {icon}
        <span className={styles.name}>{item.name}</span>
        <span className={styles.meta}>
          {t(`app.storeNames.${item.store}`)}
          {item.kind && item.kind !== "app" ? ` · ${t(`app.kinds.${item.kind}`)}` : ""}
          {item.byline ? ` · ${item.byline}` : ""}
        </span>
        <button className={styles.stashBtn} disabled={stashed} onClick={onStash}>
          {stashed ? `✓ ${t("app.stashed")}` : t("app.stash")}
        </button>
      </div>
    );
  }

  const typeLabel = item.kind && item.kind !== "app" ? t(`app.kinds.${item.kind}`) : t(`app.storeNames.${item.store}`);
  // The source bracket would just be noise where the label already says where
  // it's from: pages carry their domain in the title/byline, and apps' store
  // name is the type label (so "iOS Apps [apps.apple.com]" is redundant).
  const source = item.kind === "page" || item.kind === "app" ? null : sourceName(item.url);
  const noteLine = item.note?.split("\n").find((line) => line.trim());
  return (
    <button className={`${styles.card} ${styles.stash}`} onClick={onClick}>
      {icon}
      <span className={styles.name}>{item.name}</span>
      <span className={styles.meta}>
        {typeLabel}
        {source ? ` [${source}]` : ""}
      </span>
      {noteLine && <span className={styles.note}>{noteLine}</span>}
    </button>
  );
}
