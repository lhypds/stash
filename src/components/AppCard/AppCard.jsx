import { useTranslation } from "react-i18next";
import AppIcon from "@components/AppIcon";
import { sourceName } from "@utils/url";
import styles from "./appcard.module.css";

const THUMB_KINDS = new Set(["post", "video"]);

export default function AppCard({ app, onClick }) {
  const { t } = useTranslation();
  const typeLabel = app.kind && app.kind !== "app" ? t(`app.kinds.${app.kind}`) : t(`app.storeNames.${app.store}`);
  // The source bracket would just be noise where the label already says where
  // it's from: pages carry their domain in the title/byline, and apps' store
  // name is the type label (so "iOS Apps [apps.apple.com]" is redundant).
  const source = app.kind === "page" || app.kind === "app" ? null : sourceName(app.url);
  const noteLine = app.note?.split("\n").find((line) => line.trim());
  return (
    <button className={styles.card} onClick={onClick}>
      <AppIcon
        src={app.iconUrl}
        name={app.name}
        fallback={app.kind === "page" ? app.byline : undefined}
        className={THUMB_KINDS.has(app.kind) ? styles.thumb : undefined}
      />
      <span className={styles.name}>{app.name}</span>
      <span className={styles.meta}>
        {typeLabel}
        {source ? ` [${source}]` : ""}
      </span>
      {noteLine && <span className={styles.note}>{noteLine}</span>}
    </button>
  );
}
