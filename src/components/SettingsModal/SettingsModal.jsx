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
  // The i18n key of what's wrong with the text as it stands — unparseable JSON,
  // or a value the server refused — rather than the message itself, so it
  // follows a language switch while the modal is open.
  const [errorKey, setErrorKey] = useState("");

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    setText("");
    setSaved("");
    setErrorKey("");
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
      setErrorKey("app.invalidJson");
      return;
    }
    try {
      await api.saveSettings(user, settings);
      showToast(t("app.toastSaved"));
      onSaved?.();
      onClose();
      window.location.reload();
    } catch (err) {
      // A rejected safeIPs rule is a typo in the text still on screen, so it's
      // named next to the field instead of thrown away in a generic toast.
      if (err.code === "INVALID_SAFE_IPS") setErrorKey("app.invalidSafeIPs");
      else showToast(t("app.toastError"));
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={text === saved ? undefined : save}
      title="settings.json"
      closeOnOverlay
    >
      <div className={styles.body}>
        <TextArea
          className={styles.textarea}
          value={text}
          minHeight={240}
          onChange={(e) => {
            setText(e.target.value);
            setErrorKey("");
          }}
          spellCheck={false}
        />
        {errorKey && <p className={styles.error}>{t(errorKey)}</p>}
        <div className={styles.actions}>
          <button className={styles.saveBtn} disabled={text === saved} onClick={save}>
            {t("button.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
