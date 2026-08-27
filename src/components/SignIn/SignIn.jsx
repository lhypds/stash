import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@ui";
import ConfirmModal from "@components/ConfirmModal";
import UsernameInput from "@components/UsernameInput";
import * as api from "@utils/api";
import { isValidUsername, rememberedUsername, useUser } from "@contexts/UserContext";
import styles from "./signin.module.css";

// Where the administrator's word can be had, and the whole of what stash can do
// about a forgotten password: there is no reset link, because there is no address
// on file to send one to — an account is a name and a password and nothing else.
// Set in .env, and left out of the sheet below where it is not.
const ADMIN_EMAIL = String(import.meta.env.VITE_ADMIN_EMAIL ?? "").trim();

// What the field will take, and what the line under it says a password has to be.
// The server holds the same two numbers and is the one that enforces them (see
// usablePassword); these are here so that the form can say so before it asks.
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 64;

// The gap between the words on the line under the field and the ways out of the
// step at the end of it, and between those two words themselves. One typographic
// space — an en, which is two of the space bar's — because each of those words is
// underlined, and a single word space between two underlined words reads as one
// underline with a nick in it rather than as two words. A character rather than a
// margin, since it is a space in a line of type; the space bar's own would not do,
// two of those being collapsed into one by the time they are drawn.
const SPACE = "\u2002";

// Signing in, in two steps. The name first, on its own, because it is the half that
// decides what the second step is: a name nobody has used is an account waiting to
// be opened, one opened before there were passwords is a password waiting to be
// chosen, and everything else is a password to be given.
//
// One component for both the places stash asks — the front page and the sheet the
// stash page opens over somebody else's — because it is one question, and asking it
// twice in two hands is how the two of them come to disagree.
export default function SignIn({ initialUsername = "", className, onSignedIn }) {
  const { t } = useTranslation();
  const { login, register } = useUser();
  // A name carried here — a link's, or the one this browser last signed in with:
  // the field opens on whichever there is, and on nothing where there is neither.
  const [name, setName] = useState(initialUsername || rememberedUsername());
  const [password, setPassword] = useState("");
  // Which of the two steps is up, and — on the second — whether the password is
  // being asked for or being chosen, and whether the account behind it has still
  // to be opened.
  const [step, setStep] = useState("name");
  const [choosing, setChoosing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [pending, setPending] = useState("");
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef(null);

  const naming = step === "name";

  // The password field is what the second step is for, so it takes the cursor as
  // it arrives — a frame late, the same way the lock sheet does it, because the
  // field is not in the document yet when the step changes.
  useEffect(() => {
    if (naming) return;
    const frame = requestAnimationFrame(() => passwordRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [naming]);

  // Whatever the server said, in the reader's own language. The plain message is
  // the fallback rather than the rule: the coded answers are the ones a reader is
  // meant to act on, and those are worth saying properly.
  function nameError(requestError) {
    if (requestError.code === "USERNAME_NO_LETTER") return t("app.usernameInvalid");
    if (requestError.code === "USER_EXISTS") return t("app.usernameTaken");
    return t("app.toastError");
  }

  function passwordError(requestError) {
    if (requestError.code === "INVALID_PASSWORD") return t("app.passwordIncorrect");
    if (requestError.code === "PASSWORD_INVALID") {
      return t("app.passwordRule", { min: PASSWORD_MIN, max: PASSWORD_MAX });
    }
    return t("app.toastError");
  }

  async function submitName() {
    if (submitting) return;
    const username = name.trim().normalize("NFKC").toLowerCase();
    // An empty field is nothing to answer: the field says what it is for, and
    // being told to type a name into the box that says "username" is a line of
    // type in exchange for a press that plainly did nothing.
    if (!username) return;
    if (!isValidUsername(username)) return setError(t("app.usernameInvalid"));
    setSubmitting(true);
    setError("");
    try {
      const { hasPassword } = await api.checkLogin(username);
      setName(username);
      setChoosing(!hasPassword);
      setOpening(false);
      setStep("password");
    } catch (requestError) {
      // A name nobody has used is an account waiting to be opened — but it is just
      // as often a mistyped one, so it is offered, not assumed.
      if (requestError.code === "USER_NOT_FOUND") setPending(username);
      else setError(nameError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  // Confirming a new name does not open the account: it moves on to the step that
  // asks for the password the account will be opened with, which is the same step
  // everybody else is signing in through.
  function confirmNew() {
    setName(pending);
    setPending("");
    setChoosing(true);
    setOpening(true);
    setStep("password");
  }

  async function submitPassword() {
    if (submitting) return;
    if (!password) return setError(t("app.passwordEmpty"));
    setSubmitting(true);
    setError("");
    try {
      if (opening) await register(name, password);
      else await login(name, password);
      // Dismiss the iOS keyboard before the route swap; unmounting a focused
      // input can leave the viewport stuck where the keyboard pushed it
      document.activeElement?.blur();
      onSignedIn?.(name);
    } catch (requestError) {
      // The two answers that are about the name rather than the password: it was
      // taken, or it went, between the two steps. Neither is anything the password
      // field can be used to fix, so the name comes back up.
      if (requestError.code === "USER_NOT_FOUND" || requestError.code === "USER_EXISTS") {
        back();
        setError(nameError(requestError));
      } else {
        setError(passwordError(requestError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setStep("name");
    setPassword("");
    setChoosing(false);
    setOpening(false);
    setError("");
  }

  // What the line under the field says when there is nothing wrong: what a name
  // may be, or what a password is being asked to be. Nothing, when the password
  // asked for is one the reader already has — the field says "password", the two
  // ways out of the step are on that line, and a sentence between them saying so
  // again is a sentence nobody reads.
  const hint = naming
    ? t("app.loginHint")
    : choosing
      ? t("app.passwordChooseHint", { min: PASSWORD_MIN })
      : "";
  const message = error || hint;
  // Whether the words on that line need a space before the way out of the step at
  // the end of them. A sentence brings its own separation — the stop is the space —
  // but a line like "password must be 4–64 characters" ends in a character that
  // would otherwise run straight into the word after it. Where there are no words
  // there is nothing to separate, and an en space is not the space bar's: it would
  // not be dropped at the start of a line, and would sit there pushing the pair off
  // centre.
  const spaced = Boolean(message) && !/[.。!！?？]$/.test(message);

  return (
    <>
      <div className={className ? `${styles.form} ${className}` : styles.form}>
        <div className={styles.row}>
          {naming ? (
            <UsernameInput
              className={styles.input}
              initialValue={name}
              placeholder={t("app.usernamePlaceholder")}
              ariaLabel={t("app.usernamePlaceholder")}
              onChange={(value) => {
                setName(value);
                setError("");
              }}
              onSubmit={submitName}
            />
          ) : (
            <input
              ref={passwordRef}
              className={styles.input}
              type="password"
              name="stash-login-password"
              value={password}
              placeholder={t("app.passwordPlaceholder")}
              aria-label={t("app.passwordPlaceholder")}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="go"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              maxLength={PASSWORD_MAX}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) submitPassword();
              }}
            />
          )}
          <button
            type="button"
            className={styles.go}
            onClick={naming ? submitName : submitPassword}
            disabled={submitting}
          >
            {t(naming ? "app.next" : "app.go")}
          </button>
        </div>

        {/* The one line under the field, the same on both steps: what the field
            wants, or what went wrong with what it was given, and — on the password
            step — the ways out of that step at the end of it. They are part of the
            line rather than controls set beside it, so the way out reads as the end
            of what the line is saying: the forgotten one first and then back, one
            space between the two of them and, in front of the pair, a space only
            where the words did not end in a full stop.
            Neither is on the first step, where the name is what back would go back
            to and a password not yet asked for is not one to have forgotten; nor is
            the forgotten one offered while a password is being chosen this minute,
            which leaves that line with back on the end of it alone. */}
        <p className={styles.message}>
          {message}
          {!naming && spaced && SPACE}
          {!naming && !choosing && (
            <>
              <button
                type="button"
                className={styles.word}
                onClick={() => setForgot(true)}
                disabled={submitting}
              >
                {t("app.forgot")}
              </button>
              {SPACE}
            </>
          )}
          {!naming && (
            <button type="button" className={styles.word} onClick={back} disabled={submitting}>
              {t("app.back")}
            </button>
          )}
        </p>
      </div>

      <ConfirmModal
        isOpen={Boolean(pending)}
        message={t("app.createConfirm", { name: pending })}
        confirmLabel={t("button.create")}
        onCancel={() => setPending("")}
        onConfirm={confirmNew}
      />

      {/* stash cannot put a password back: an account is a name and a password and
          no address to send anything to, and the field holding it is plain text so
          that the one person who can read it can also set a new one. So the answer
          is a word to that person, written from the reader's own mail app with the
          account already named in it. */}
      <Modal
        isOpen={forgot}
        title={t("app.forgotTitle")}
        onClose={() => setForgot(false)}
        onSubmit={() => setForgot(false)}
        closeOnOverlay
        className={styles.sheet}
      >
        <div className={styles.sheetBody}>
          <p className={styles.sheetText}>
            {ADMIN_EMAIL ? t("app.forgotBody", { email: ADMIN_EMAIL }) : t("app.forgotNoAdmin")}
          </p>
          <div className={styles.sheetActions}>
            <button type="button" className={styles.cancel} onClick={() => setForgot(false)}>
              {t("button.cancel")}
            </button>
            {ADMIN_EMAIL && (
              <a
                className={styles.confirm}
                href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(
                  t("app.forgotSubject", { name }),
                )}&body=${encodeURIComponent(t("app.forgotMail", { name }))}`}
                onClick={() => setForgot(false)}
              >
                {t("app.forgotSend")}
              </a>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
