import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, TextArea } from "@ui";
import AppIcon from "@components/AppIcon";
import styles from "./detail.module.css";

const PLATFORM_LABELS = { ios: "iOS", android: "Android" };

export default function AppDetailModal({ app, isOwner, onClose, onSave, onDelete }) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState(app.note || "");

  const dirty = note !== (app.note || "");
  const stashedDate = app.stashedAt ? new Date(app.stashedAt).toLocaleString(i18n.language) : "";

  return (
    <Modal isOpen onClose={onClose} title={app.name} closeOnOverlay>
      <div className={styles.body}>
        <div className={styles.top}>
          <AppIcon src={app.iconUrl} name={app.name} className={styles.bigIcon} />
          <div className={styles.info}>
            {app.developer && <span>{app.developer}</span>}
            <span className={styles.bundle}>
              {PLATFORM_LABELS[app.platform]} · {app.bundleId}
            </span>
            <span>
              {t("app.stashedAt")}: {stashedDate}
            </span>
            {app.storeUrl && (
              <a href={app.storeUrl} target="_blank" rel="noreferrer">
                {t("app.viewInStore")} ↗
              </a>
            )}
          </div>
        </div>

        <label className={styles.label}>{t("app.note")}</label>
        {isOwner ? (
          <TextArea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("app.notePlaceholder")}
          />
        ) : (
          <p className={styles.readNote}>{app.note || "—"}</p>
        )}

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
