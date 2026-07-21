import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, TextArea } from "@ui";
import AppIcon from "@components/AppIcon";
import styles from "./detail.module.css";

function videoEmbedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
      const id =
        host === "youtu.be"
          ? u.pathname.split("/")[1]
          : u.pathname === "/watch"
            ? u.searchParams.get("v")
            : u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
      return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default function AppDetailModal({ app, isOwner, onClose, onSave, onDelete }) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState(app.note || "");
  const videoEmbed = app.store === "videos" && app.kind === "video" ? videoEmbedUrl(app.url) : null;

  const dirty = note !== (app.note || "");
  const stashedDate = app.stashedAt ? new Date(app.stashedAt).toLocaleString(i18n.language) : "";

  return (
    <Modal isOpen onClose={onClose} title={app.name} closeOnOverlay>
      <div className={styles.body}>
        <div className={styles.top}>
          <AppIcon
            src={app.iconUrl}
            name={app.name}
            fallback={app.kind === "page" ? app.byline : undefined}
            className={styles.bigIcon}
          />
          <div className={styles.info}>
            {app.byline && <span>{app.byline}</span>}
            <span className={styles.bundle}>
              {t(`app.storeNames.${app.store}`)}
              {app.kind && app.kind !== "app" ? ` · ${t(`app.kinds.${app.kind}`)}` : ` · ${app.itemId}`}
            </span>
            <span>
              {t("app.stashedAt")}: {stashedDate}
            </span>
            {app.url && (
              <a href={app.url} target="_blank" rel="noreferrer">
                {t("app.viewInStore")} ↗
              </a>
            )}
          </div>
        </div>

        {videoEmbed && (
          <div>
            <div className={styles.labelRow}>
              <label className={styles.label}>{t("app.video")}</label>
              <a href={app.url} target="_blank" rel="noreferrer" className={styles.shotLink}>
                {t("app.videoOpen")} ↗
              </a>
            </div>
            <div className={styles.videoWrap}>
              <iframe
                src={videoEmbed}
                title={app.name}
                className={styles.video}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {app.screenshotUrl ? (
          <div>
            <div className={styles.labelRow}>
              <label className={styles.label}>{t("app.screenshot")}</label>
              <a href={app.screenshotUrl} target="_blank" rel="noreferrer" className={styles.shotLink}>
                {t("app.screenshotOpen")} ↗
              </a>
            </div>
            <div className={styles.shotWrap}>
              <img src={app.screenshotUrl} alt={t("app.screenshot")} className={styles.shot} loading="lazy" />
            </div>
          </div>
        ) : app.store === "pages" ? (
          <div>
            <label className={styles.label}>{t("app.screenshot")}</label>
            <p className={styles.shotPending}>{t("app.screenshotPending")}</p>
          </div>
        ) : null}

        <div>
          <label className={styles.label}>{t("app.note")}</label>
          {isOwner ? (
            <TextArea
              className={styles.noteArea}
              value={note}
              minHeight={120}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("app.notePlaceholder")}
            />
          ) : (
            <p className={styles.readNote}>{app.note || "—"}</p>
          )}
        </div>

        {isOwner && (
          <div className={styles.actions}>
            <button className={styles.deleteBtn} onClick={() => onDelete(app)}>
              {t("button.delete")}
            </button>
            <button className={styles.saveBtn} disabled={!dirty} onClick={() => onSave(app, { note })}>
              {t("button.save")}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
