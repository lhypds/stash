import { useTranslation } from "react-i18next";
import { Modal } from "@ui";
import styles from "./support.module.css";

// Mirrors the platform lists in server/stores/*.js. Each site here has code
// that reads its title/image/author directly (not just a generic Open Graph
// scrape) — anything else still stashes fine as a Page, just without that.
const GROUPS = [
  {
    store: "posts",
    sites: [
      { name: "X", domain: "x.com" },
      { name: "Threads", domain: "threads.net" },
      { name: "Instagram", domain: "instagram.com" },
      { name: "RedNote", domain: "xiaohongshu.com" },
      { name: "Facebook", domain: "facebook.com" },
      { name: "Bluesky", domain: "bsky.app" },
      { name: "Mastodon", domain: "mastodon.social" },
      { name: "Zhihu", domain: "zhihu.com" },
      { name: "WeChat", domain: "wechat.com" },
    ],
  },
  {
    store: "videos",
    sites: [
      { name: "YouTube", domain: "youtube.com" },
      { name: "bilibili", domain: "bilibili.com" },
      { name: "TikTok", domain: "tiktok.com" },
      { name: "WeChat Videos", domain: "channels.weixin.qq.com" },
      { name: "Vimeo", domain: "vimeo.com" },
      { name: "Twitch", domain: "twitch.tv" },
      { name: "niconico", domain: "nicovideo.jp" },
    ],
    more: true,
  },
  { store: "channels", note: "app.supportedChannelsNote" },
  {
    store: "chats",
    sites: [
      { name: "ChatGPT", domain: "chatgpt.com" },
      { name: "Gemini", domain: "gemini.google.com" },
      { name: "Grok", domain: "grok.com" },
      { name: "Claude", domain: "claude.ai" },
      { name: "Doubao", domain: "doubao.com" },
    ],
  },
  {
    store: "apps",
    sites: [
      { name: "App Store", domain: "apps.apple.com" },
      { name: "Google Play", domain: "play.google.com" },
    ],
  },
  { store: "pages", note: "app.supportedPagesNote" },
];

export default function SupportModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("app.supportedSites")} closeOnOverlay className={styles.modal}>
      <p className={styles.intro}>{t("app.supportedSitesIntro")}</p>
      <div className={styles.groups}>
        {GROUPS.map(({ store, sites, note, more }) => (
          <div key={store} className={styles.group}>
            <span className={styles.groupTitle}>{t(`app.storeNames.${store}`)}</span>
            {note && <span className={styles.hint}>{t(note)}</span>}
            {(sites || more) && (
              <div className={styles.chips}>
                {sites?.map((site) => (
                  <a
                    key={site.domain}
                    className={styles.chip}
                    href={`https://${site.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    title={site.domain}
                  >
                    {site.name}
                  </a>
                ))}
                {more && (
                  <span className={styles.chip} data-more="true">
                    {t("app.moreSites")}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
