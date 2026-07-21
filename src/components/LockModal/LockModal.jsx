import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, showToast } from "@ui";
import styles from "./lock.module.css";

export default function LockModal({ isOpen, mode, onClose, onSubmit, onSuccess }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setPassword("");
    setError("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  async function save() {
    if (saving) return;
    if (!password) {
      setError("empty");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(password);
      showToast(t(mode === "unlock" ? "app.unlockSaved" : "app.lockSaved"));
      onSuccess?.();
      onClose();
    } catch (err) {
      if (err.code === "INVALID_PASSWORD") setError("incorrect");
      else showToast(t("app.toastError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(mode === "unlock" ? "app.unlockStash" : "app.lockStash")}
      closeOnOverlay
      className={styles.modal}
    >
      <div className={styles.form}>
        <input
          ref={inputRef}
          className={styles.input}
          type="password"
          value={password}
          name="stash-lock-password"
          placeholder={t("app.passwordPlaceholder")}
          aria-label={t("app.passwordPlaceholder")}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          spellCheck={false}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        {error && <p className={styles.error}>{t(error === "incorrect" ? "app.passwordIncorrect" : "app.passwordEmpty")}</p>}
        <button type="button" className={styles.submit} onClick={save} disabled={saving}>
          {t(mode === "unlock" ? "app.unlock" : "app.lock")}
        </button>
      </div>
    </Modal>
  );
}
