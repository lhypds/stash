import { useTranslation } from "react-i18next";
import AppIcon from "@components/AppIcon";
import styles from "./appcard.module.css";

const THUMB_KINDS = new Set(["post", "video"]);

export default function AppCard({ app, onClick }) {
  const { t } = useTranslation();
  return (
    <button className={styles.card} onClick={onClick}>
      <AppIcon
        src={app.iconUrl}
        name={app.name}
        fallback={app.kind === "page" ? app.byline : undefined}
        className={THUMB_KINDS.has(app.kind) ? styles.thumb : undefined}
      />
      <span className={styles.name}>{app.name}</span>
      <span className={styles.meta}>{t(`app.storeNames.${app.store}`)}</span>
      {app.note && <span className={styles.note}>{app.note}</span>}
    </button>
  );
}
