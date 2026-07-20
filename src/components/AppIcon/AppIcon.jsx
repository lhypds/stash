import { useState } from "react";
import styles from "./appicon.module.css";

export default function AppIcon({ src, name, fallback, className }) {
  const [failed, setFailed] = useState(false);
  const cls = [styles.icon, className].filter(Boolean).join(" ");

  if (!src || failed) {
    const letter = ((fallback || name || "?").trim() || "?").charAt(0).toUpperCase();
    return <div className={`${cls} ${styles.fallback}`}>{letter}</div>;
  }
  // Some CDNs (e.g. bilibili's hdslb.com) 403 hotlinked image requests that
  // carry a foreign Referer, but allow them when no Referer is sent at all
  return (
    <img
      className={cls}
      src={src}
      alt={name || ""}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
