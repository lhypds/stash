import { useState } from "react";
import styles from "./appicon.module.css";

export default function AppIcon({ src, name, className }) {
  const [failed, setFailed] = useState(false);
  const cls = [styles.icon, className].filter(Boolean).join(" ");

  if (!src || failed) {
    return <div className={`${cls} ${styles.fallback}`}>{(name || "?").charAt(0).toUpperCase()}</div>;
  }
  return <img className={cls} src={src} alt={name || ""} loading="lazy" onError={() => setFailed(true)} />;
}
