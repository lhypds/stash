import AppIcon from "@components/AppIcon";
import styles from "./appcard.module.css";

const PLATFORM_LABELS = { ios: "iOS", android: "Android" };

export default function AppCard({ app, onClick }) {
  return (
    <button className={styles.card} onClick={onClick}>
      <AppIcon src={app.iconUrl} name={app.name} />
      <span className={styles.name}>{app.name}</span>
      <span className={styles.meta}>{PLATFORM_LABELS[app.platform] || app.platform}</span>
      {app.note && <span className={styles.note}>{app.note}</span>}
    </button>
  );
}
