import { useTranslation } from "react-i18next";
import AppIcon from "@components/AppIcon";
import styles from "./appcard.module.css";

const THUMB_KINDS = new Set(["post", "video"]);

// Domain → how its platform's name is written. A host matches a key exactly or
// as a subdomain (space.bilibili.com → Bilibili); unmapped hosts fall back to
// the bare domain.
const SOURCE_NAMES = {
  "x.com": "X",
  "twitter.com": "X",
  "threads.net": "Threads",
  "threads.com": "Threads",
  "instagram.com": "Instagram",
  "instagr.am": "Instagram",
  "xiaohongshu.com": "RedNote",
  "xhslink.com": "RedNote",
  "facebook.com": "Facebook",
  "fb.com": "Facebook",
  "fb.watch": "Facebook",
  "bsky.app": "Bluesky",
  "mastodon.social": "Mastodon",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "bilibili.com": "Bilibili",
  "b23.tv": "Bilibili",
  "bilibili.tv": "Bilibili",
  "tiktok.com": "TikTok",
  "vimeo.com": "Vimeo",
  "twitch.tv": "Twitch",
  "nicovideo.jp": "niconico",
  "nico.ms": "niconico",
  "pornhub.com": "Pornhub",
};

// Where the item came from, e.g. "Bilibili", "YouTube". Falls back to the bare
// domain for unmapped hosts, or null when there's no usable URL.
function sourceName(url) {
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\.|^m\./, "");
  } catch {
    return null;
  }
  for (const [domain, name] of Object.entries(SOURCE_NAMES)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  return host;
}

export default function AppCard({ app, onClick }) {
  const { t } = useTranslation();
  const typeLabel =
    app.kind && app.kind !== "app" ? t(`app.kinds.${app.kind}`) : t(`app.storeNames.${app.store}`);
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
