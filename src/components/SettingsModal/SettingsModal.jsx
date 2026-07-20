import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, TextArea, showToast } from "@ui";
import * as api from "@utils/api";
import { useUser } from "@contexts/UserContext";
import styles from "./settings.module.css";

export default function SettingsModal({ isOpen, onClose, onSaved }) {
  const { t } = useTranslation();
  const { user } = useUser();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    setText("");
    setSaved("");
    setInvalid(false);
    api
      .getSettings(user)
      .then(({ settings }) => {
        if (cancelled) return;
        const pretty = JSON.stringify(settings, null, 2);
        setText(pretty);
        setSaved(pretty);
      })
      .catch(() => !cancelled && showToast(t("app.toastError")));
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, t]);

  async function save() {
    let settings;
    try {
      settings = JSON.parse(text);
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("not an object");
    } catch {
      setInvalid(true);
      return;
    }
    try {
      await api.saveSettings(user, settings);
      showToast(t("app.toastSaved"));
      onSaved?.();
      onClose();
    } catch {
      showToast(t("app.toastError"));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="settings.json" closeOnOverlay>
      <div className={styles.body}>
        <TextArea
          className={styles.textarea}
          value={text}
          minHeight={240}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          spellCheck={false}
        />
        {invalid && <p className={styles.error}>{t("app.invalidJson")}</p>}
        <div className={styles.actions}>
          <button className={styles.saveBtn} disabled={text === saved} onClick={save}>
            {t("button.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
