import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "@ui";
import UsernameInput from "@components/UsernameInput";
import { useUser, isValidUsername } from "@contexts/UserContext";
import styles from "./login.module.css";

export default function LoginModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const { login } = useUser();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState(false);

  function submit() {
    const username = name.trim().toLowerCase();
    if (!isValidUsername(username)) {
      setError(true);
      return;
    }
    // Dismiss the iOS keyboard before the route swap; unmounting a focused
    // input can leave the viewport stuck where the keyboard pushed it
    document.activeElement?.blur();
    login(username);
    setName("");
    setError(false);
    onClose();
    navigate(`/${username}`);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("app.login")}
      closeOnOverlay
      className={styles.modal}
    >
      <div className={styles.form} role="search">
        <UsernameInput
          className={styles.input}
          placeholder={t("app.usernamePlaceholder")}
          ariaLabel={t("app.usernamePlaceholder")}
          onChange={(v) => {
            setName(v);
            setError(false);
          }}
          onSubmit={submit}
        />
        {error ? (
          <p className={styles.error}>{t("app.usernameInvalid")}</p>
        ) : (
          <p className={styles.hint}>{t("app.loginHint")}</p>
        )}
        <button type="button" className={styles.submit} onClick={submit}>
          {t("app.login")}
        </button>
      </div>
    </Modal>
  );
}
