import { useTranslation } from "react-i18next";
import AppIcon from "@components/AppIcon";
import styles from "./resultcard.module.css";

const PLATFORM_LABELS = { ios: "iOS", android: "Android" };

export default function ResultCard({ result, stashed, onStash }) {
  const { t } = useTranslation();
  return (
    <div className={styles.card}>
      <AppIcon src={result.icon} name={result.name} />
      <span className={styles.name}>{result.name}</span>
      <span className={styles.meta}>
        {PLATFORM_LABELS[result.platform]}
        {result.developer ? ` · ${result.developer}` : ""}
      </span>
      <button className={styles.stashBtn} disabled={stashed} onClick={onStash}>
        {stashed ? `✓ ${t("app.stashed")}` : t("app.stash")}
      </button>
    </div>
  );
}
