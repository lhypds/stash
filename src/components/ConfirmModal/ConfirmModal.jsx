import { useTranslation } from "react-i18next";
import { Modal } from "@ui";
import styles from "./confirm.module.css";

export default function ConfirmModal({ isOpen, message, confirmLabel, onCancel, onConfirm }) {
  const { t } = useTranslation();
  return (
    <Modal isOpen={isOpen} onClose={onCancel} closeOnOverlay className={styles.modal}>
      <div className={styles.body}>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onCancel}>
            {t("button.cancel")}
          </button>
          <button className={styles.confirm} onClick={onConfirm}>
            {confirmLabel ?? t("button.delete")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
