import { useTranslation } from "react-i18next";
import ItemThumbnail from "@components/ItemThumbnail";
import { itemMeta, itemTitle } from "@utils/item";
import styles from "./card.module.css";

const THUMB_KINDS = new Set(["post", "video"]);

// One tile for a stashed item, in two modes:
//   "stash"  — opens the detail modal on click, with a note preview as the
//              trailing line. When onStash is passed (a viewer looking at
//              someone else's stash), a Stash button copies it into theirs.
//   "result" — a not-yet-stashed search result, with its own Stash button.
export default function ItemCard({ item, mode = "stash", onClick, stashed, onStash }) {
  const { t } = useTranslation();
  const title = itemTitle(item, t);
  const src = mode === "result" ? item.icon : item.iconUrl;
  // A note's attached image gets the same wide treatment as a post/video
  // thumbnail — but only when it has one, so an image-less note shows the small
  // fallback initial instead of a banner-sized letter.
  const wide = THUMB_KINDS.has(item.kind) || (item.kind === "note" && !!src);
  const thumbnail = (
    <ItemThumbnail
      src={src}
      name={title}
      fallback={item.kind === "page" ? item.byline : undefined}
      className={wide ? styles.thumb : undefined}
      referrerPolicy={mode === "result" ? item.iconReferrerPolicy : undefined}
    />
  );

  const meta = <span className={styles.meta}>{itemMeta(item, t)}</span>;

  const stashBtn = onStash && (
    <button
      className={styles.stashBtn}
      disabled={stashed}
      title={stashed ? undefined : t("app.stashAsHint")}
      // Option/Alt-click asks which store to file the item under (see
      // StashAsModal) rather than taking the one it came with.
      onClick={(e) => {
        e.stopPropagation();
        onStash({ chooseStore: e.altKey });
      }}
    >
      {stashed ? `✓ ${t("app.stashed")}` : t("app.stash")}
    </button>
  );

  // Result mode
  if (mode === "result") {
    return (
      <div className={`${styles.card} ${styles.result}`}>
        <a className={styles.cardBody} href={item.url} target="_blank" rel="noreferrer">
          {thumbnail}
          <span className={styles.name}>{title}</span>
        </a>
        {meta}
        {stashBtn}
      </div>
    );
  }

  // Stash mode. A note's name is already its first line, so its preview line is
  // the next one down rather than the title repeated.
  const noteLines = item.note?.split("\n").filter((line) => line.trim()) || [];
  const noteLine = item.kind === "note" ? noteLines[1] : noteLines[0];
  return (
    <div className={`${styles.card} ${styles.stash}`}>
      <button className={styles.cardBody} onClick={onClick}>
        {thumbnail}
        <span className={styles.name}>{title}</span>
        {meta}
        {noteLine && <span className={styles.note}>{noteLine}</span>}
      </button>
      {stashBtn}
    </div>
  );
}
