import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, TextArea } from "@ui";
import ItemThumbnail from "@components/ItemThumbnail";
import { SHOT_STORES } from "@utils/api";
import { sourceName, videoEmbedUrl } from "@utils/url";
import { itemMeta } from "@utils/item";
import styles from "./detail.module.css";

export default function ItemDetailModal({ item, isOwner, locked = false, stashed, onClose, onSave, onDelete, onStash }) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState(item.note || "");
  const videoEmbed = item.store === "videos" && item.kind === "video" ? videoEmbedUrl(item.url) : null;
  const source = sourceName(item.url);

  const dirty = note !== (item.note || "");
  const stashedDate = item.stashedAt ? new Date(item.stashedAt).toLocaleString(i18n.language) : "";

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

        {videoEmbed && (
          <div>
            <div className={styles.labelRow}>
              <label className={styles.label}>{t("app.video")}</label>
              <a href={item.url} target="_blank" rel="noreferrer" className={styles.shotLink}>
                {t("app.videoOpen")} ↗
              </a>
            </div>
            <div className={styles.videoWrap}>
              <iframe
                src={videoEmbed}
                title={item.name}
                className={styles.video}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
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
