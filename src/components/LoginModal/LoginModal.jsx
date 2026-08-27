import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "@ui";
import SignIn from "@components/SignIn";
import styles from "./login.module.css";

// Signing in from inside somebody else's stash. The form is the front page's own
// (see SignIn) — the name, then the password — because there is one way into an
// account and a sheet is not a reason to ask for it differently.
export default function LoginModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("app.login")} closeOnOverlay className={styles.modal}>
      <div className={styles.body}>
        <SignIn
          onSignedIn={(username) => {
            onClose();
            navigate(`/${encodeURIComponent(username)}`);
          }}
        />
      </div>
    </Modal>
  );
}
