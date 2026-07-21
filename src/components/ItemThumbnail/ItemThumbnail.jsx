import { useState } from "react";
import styles from "./thumbnail.module.css";

export default function ItemThumbnail({ src, name, fallback, className, referrerPolicy }) {
  const [failed, setFailed] = useState(false);
  const cls = [styles.icon, className].filter(Boolean).join(" ");

  if (!src || failed) {
    const letter = ((fallback || name || "?").trim() || "?").charAt(0).toUpperCase();
    return <div className={`${cls} ${styles.fallback}`}>{letter}</div>;
  }
  return (
    <img
      className={cls}
      src={src}
      alt={name || ""}
      loading="lazy"
      referrerPolicy={referrerPolicy}
      onError={() => setFailed(true)}
    />
  );
}
