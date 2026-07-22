import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher, UsernameInput } from "@components";
import { useUser, isValidUsername } from "@contexts/UserContext";
import styles from "./home.module.css";

export default function Home() {
  const { t } = useTranslation();
  const { user, ready, login } = useUser();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!ready) return null;
  if (user) return <Navigate to={`/${encodeURIComponent(user)}`} replace />;

  async function submit() {
    if (submitting) return;
    const username = name.trim().normalize("NFKC").toLowerCase();
    if (!isValidUsername(username)) {
      setError("username");
      return;
    }
    setSubmitting(true);
    try {
      await login(username);
      // Dismiss the iOS keyboard before the route swap; unmounting a focused
      // input can leave the viewport stuck where the keyboard pushed it
      document.activeElement?.blur();
    } catch {
      setError("login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.lang}>
        <LanguageSwitcher />
      </div>
      <main className={styles.hero}>
        <h1 className={styles.title}>stash</h1>
        <p className={styles.tagline}>{t("app.tagline")}</p>
        <div className={styles.form} role="search">
          <div className={styles.row}>
            <UsernameInput
              className={styles.input}
              placeholder={t("app.usernamePlaceholder")}
              ariaLabel={t("app.usernamePlaceholder")}
              onChange={(v) => {
                setName(v);
                setError("");
              }}
              onSubmit={submit}
            />
            <button type="button" className={styles.go} onClick={submit} disabled={submitting}>
              {t("app.go")}
            </button>
          </div>
          {error ? (
            <p className={styles.error}>
              {t(error === "username" ? "app.usernameInvalid" : "app.toastError")}
            </p>
          ) : (
            <p className={styles.hint}>{t("app.loginHint")}</p>
          )}
        </div>
      </main>
    </div>
  );
}
