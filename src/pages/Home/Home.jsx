import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher, SignIn } from "@components";
import { useUser } from "@contexts/UserContext";
import styles from "./home.module.css";

export default function Home() {
  const { t } = useTranslation();
  const { user, ready } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedUsername = typeof location.state?.username === "string" ? location.state.username : "";

  if (!ready) return null;
  if (user && (!requestedUsername || user === requestedUsername)) {
    return <Navigate to={`/${encodeURIComponent(user)}`} replace />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.lang}>
        <LanguageSwitcher />
      </div>
      <main className={styles.hero}>
        <h1 className={styles.title}>stash</h1>
        <p className={styles.tagline}>{t("app.tagline")}</p>
        {/* The name, then the password: two steps in the one form, which is also
            the form the stash page's sheet holds (see SignIn). The page keeps its
            wordmark and its line — the second step is a step of this screen rather
            than a screen of its own, and neither of them moves. */}
        <SignIn
          className={styles.signin}
          initialUsername={requestedUsername}
          onSignedIn={(username) => navigate(`/${encodeURIComponent(username)}`, { replace: true })}
        />
      </main>
    </div>
  );
}
