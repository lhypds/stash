import { useTranslation } from "react-i18next";
import ItemThumbnail from "@components/ItemThumbnail";
import { itemMeta } from "@utils/item";
import styles from "./card.module.css";

const THUMB_KINDS = new Set(["post", "video"]);

// One tile for a stashed item, in two modes:
//   "stash"  — opens the detail modal on click, with a note preview as the
//              trailing line. When onStash is passed (a viewer looking at
//              someone else's stash), a Stash button copies it into theirs.
//   "result" — a not-yet-stashed search result, with its own Stash button.
export default function ItemCard({ item, mode = "stash", onClick, stashed, onStash }) {
  const { t } = useTranslation();
  const thumbnail = (
    <ItemThumbnail
      src={mode === "result" ? item.icon : item.iconUrl}
      name={item.name}
      fallback={item.kind === "page" ? item.byline : undefined}
      className={THUMB_KINDS.has(item.kind) ? styles.thumb : undefined}
      referrerPolicy={mode === "result" ? item.iconReferrerPolicy : undefined}
    />
  );

  const meta = <span className={styles.meta}>{itemMeta(item, t)}</span>;

  const stashBtn = onStash && (
    <button
      className={styles.stashBtn}
      disabled={stashed}
      onClick={(e) => {
        e.stopPropagation();
        onStash();
      }}
    >
      {stashed ? `✓ ${t("app.stashed")}` : t("app.stash")}
    </button>
  );

  // Result mode
  if (mode === "result") {
    return (
      <div className={`${styles.card} ${styles.result}`}>
        {thumbnail}
        <span className={styles.name}>{item.name}</span>
        {meta}
        {stashBtn}
      </div>
    );
  }

  // Stash mode
  const noteLine = item.note?.split("\n").find((line) => line.trim());
  return (
    <div className={`${styles.card} ${styles.stash}`}>
      <button className={styles.cardBody} onClick={onClick}>
        {thumbnail}
        <span className={styles.name}>{item.name}</span>
        {meta}
        {noteLine && <span className={styles.note}>{noteLine}</span>}
      </button>
      {stashBtn}
    </div>
  );
}
