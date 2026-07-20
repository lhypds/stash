import { useTranslation } from "react-i18next";
import AppIcon from "@components/AppIcon";
import styles from "./resultcard.module.css";

const THUMB_KINDS = new Set(["tweet", "video"]);

export default function ResultCard({ result, stashed, onStash }) {
  const { t } = useTranslation();
  return (
    <div className={styles.card}>
      <AppIcon
        src={result.icon}
        name={result.name}
        fallback={result.kind === "page" ? result.byline : undefined}
        className={THUMB_KINDS.has(result.kind) ? styles.thumb : undefined}
      />
      <span className={styles.name}>{result.name}</span>
      <span className={styles.meta}>
        {t(`app.storeNames.${result.store}`)}
        {result.kind && result.kind !== "app" ? ` · ${t(`app.kinds.${result.kind}`)}` : ""}
        {result.byline ? ` · ${result.byline}` : ""}
      </span>
      <button className={styles.stashBtn} disabled={stashed} onClick={onStash}>
        {stashed ? `✓ ${t("app.stashed")}` : t("app.stash")}
      </button>
    </div>
  );
}
