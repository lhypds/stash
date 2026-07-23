import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, TextArea, showToast } from "@ui";
import ItemThumbnail from "@components/ItemThumbnail";
import { SHOT_STORES } from "@utils/api";
import { sourceName, videoEmbedUrl } from "@utils/url";
import { itemMeta } from "@utils/item";
import styles from "./detail.module.css";

// yt-dlp-backed CLI commands offered from the Actions row — not available for
// WeChat, whose videos aren't reachable by the yt tool.
const VIDEO_ACTIONS = [
  { flag: "d", label: "app.download" },
  { flag: "s", label: "app.summaries" },
  { flag: "t", label: "app.transcript" },
];

export default function ItemDetailModal({ item, isOwner, locked = false, stashed, onClose, onSave, onDelete, onStash }) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState(item.note || "");
  const [showActionsHelp, setShowActionsHelp] = useState(false);
  const actionsHelpRef = useRef(null);
  const videoEmbed = item.store === "videos" && item.kind === "video" ? videoEmbedUrl(item.url) : null;
  // A post (e.g. an X/Twitter post) can carry a direct video file instead of
  // an embeddable player URL — play it back with a plain <video> tag, routed
  // through our own server (see /api/video-proxy) since twimg.com 403s a
  // direct browser fetch over its Referer.
  const directVideo = !videoEmbed && item.video ? `/api/video-proxy?url=${encodeURIComponent(item.video)}` : null;
  const source = sourceName(item.url);
  const showVideoActions = item.store === "videos" && item.kind === "video" && source !== "WeChat";

  const dirty = note !== (item.note || "");
  const stashedDate = item.stashedAt ? new Date(item.stashedAt).toLocaleString(i18n.language) : "";

  useEffect(() => {
    function handleOutside(e) {
      if (actionsHelpRef.current && !actionsHelpRef.current.contains(e.target)) {
        setShowActionsHelp(false);
      }
    }
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, []);

  async function copyCommand(flag) {
    const command = `yt -${flag}u "${item.url}"`;
    try {
      await navigator.clipboard.writeText(command);
      showToast(t("app.commandCopied"));
    } catch {
      showToast(t("app.commandCopyFailed"));
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={item.name} closeOnOverlay>
      <div className={styles.body}>
        <div className={styles.top}>
          <ItemThumbnail
            src={item.iconUrl}
            name={item.name}
            fallback={item.kind === "page" ? item.byline : undefined}
            className={styles.bigIcon}
          />
          <div className={styles.info}>
            {item.byline && (
              <span>
                {t("app.byline")}: {item.byline}
              </span>
            )}
            {source && (
              <span>
                {t("app.sourceSelect")}: {source}
              </span>
            )}
            <span className={styles.bundle}>
              {t("app.meta")}: {itemMeta(item, t)}
            </span>
            <span>
              {t("app.stashedAt")}: {stashedDate}
            </span>
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer">
                {t("app.viewInStore")} ↗
              </a>
            )}
          </div>
        </div>

        {item.preview && (
          <div>
            <label className={styles.label}>{t("app.preview")}</label>
            <p className={styles.previewText}>{item.preview}</p>
          </div>
        )}

        {(videoEmbed || directVideo) && (
          <div>
            <div className={styles.labelRow}>
              <label className={styles.label}>{t("app.video")}</label>
              <a href={item.url} target="_blank" rel="noreferrer" className={styles.shotLink}>
                {t("app.videoOpen")} ↗
              </a>
            </div>
            <div className={styles.videoWrap}>
              {videoEmbed ? (
                <iframe
                  src={videoEmbed}
                  title={item.name}
                  className={styles.video}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <video src={directVideo} poster={item.iconUrl || undefined} className={styles.video} controls />
              )}
            </div>
          </div>
        )}

        {showVideoActions && (
          <div>
            <div className={styles.labelWithHelp}>
              <label className={styles.label}>{t("app.actions")}</label>
              <div ref={actionsHelpRef} className={styles.helpWrap} data-open={showActionsHelp}>
                <button
                  type="button"
                  className={styles.helpBtn}
                  onClick={() => setShowActionsHelp((v) => !v)}
                  aria-label={t("app.actionsHelp")}
                >
                  ?
                </button>
                <div className={styles.helpPopover}>
                  <p className={styles.helpText}>{t("app.actionsHelpText")}</p>
                  <a
                    href="https://github.com/lhypds/yt"
                    target="_blank"
                    rel="noreferrer"
                    className={styles.helpLink}
                  >
                    github.com/lhypds/yt ↗
                  </a>
                </div>
              </div>
            </div>
            <div className={styles.videoActions}>
              {VIDEO_ACTIONS.map(({ flag, label }) => (
                <button key={flag} className={styles.actionBtn} onClick={() => copyCommand(flag)}>
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
        )}

        {item.screenshotUrl ? (
          <div>
            <div className={styles.labelRow}>
              <label className={styles.label}>{t("app.screenshot")}</label>
              <a href={item.screenshotUrl} target="_blank" rel="noreferrer" className={styles.shotLink}>
                {t("app.screenshotOpen")} ↗
              </a>
            </div>
            <div className={styles.shotWrap}>
              <img src={item.screenshotUrl} alt={t("app.screenshot")} className={styles.shot} loading="lazy" />
            </div>
          </div>
        ) : SHOT_STORES.has(item.store) ? (
          <div>
            <label className={styles.label}>{t("app.screenshot")}</label>
            <p className={styles.shotPending}>{t("app.screenshotPending")}</p>
          </div>
        ) : null}

        <div>
          <label className={styles.label}>{t("app.note")}</label>
          <TextArea
            className={styles.noteArea}
            value={note}
            minHeight={120}
            readOnly={!isOwner || locked}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {isOwner ? (
          <div className={styles.actions}>
            <button className={styles.deleteBtn} disabled={locked} onClick={() => onDelete(item)}>
              {t("button.delete")}
            </button>
            <button className={styles.saveBtn} disabled={locked || !dirty} onClick={() => onSave(item, { note })}>
              {t("button.save")}
            </button>
          </div>
        ) : (
          onStash && (
            <div className={styles.actions}>
              <button className={styles.saveBtn} disabled={stashed} onClick={onStash}>
                {stashed ? `✓ ${t("app.stashed")}` : t("app.stash")}
              </button>
            </div>
          )
        )}
      </div>
    </Modal>
  );
}
