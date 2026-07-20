import { useState } from "react";
import styles from "./appicon.module.css";

export default function AppIcon({ src, name, fallback, className }) {
  const [failed, setFailed] = useState(false);
  const cls = [styles.icon, className].filter(Boolean).join(" ");

  if (!src || failed) {
    const letter = ((fallback || name || "?").trim() || "?").charAt(0).toUpperCase();
    return <div className={`${cls} ${styles.fallback}`}>{letter}</div>;
  }
  return <img className={cls} src={src} alt={name || ""} loading="lazy" onError={() => setFailed(true)} />;
}
