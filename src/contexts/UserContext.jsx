import { createContext, useContext, useEffect, useState } from "react";
import * as api from "@utils/api";

const KEY = "stash:user";
const USERNAME_RE =
  /^[a-z0-9_\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}-]{1,32}$/u;
// One of those characters has to be a letter, in any of the scripts above: digits,
// dashes and underscores on their own make an account number rather than a name.
// The server holds the same rule and is the one that enforces it; this is here so
// that a name it would refuse is answered before it is sent.
const USERNAME_LETTER_RE =
  /[a-z\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}]/u;
const UserContext = createContext(null);

export const isValidUsername = (username) =>
  USERNAME_RE.test(username) && USERNAME_LETTER_RE.test(username);

// The last name signed in from this browser. Not a credential and no longer a way
// back in on its own — it is the name the sign-in form opens with in its field, so
// that coming back after a session has gone is a password to type rather than both
// halves of one.
export const rememberedUsername = () => localStorage.getItem(KEY) || "";

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        const { username } = await api.getSession();
        if (!cancelled) {
          localStorage.setItem(KEY, username);
          setUser(username);
        }
      } catch {
        // Nobody is signed in here, or the server restarted and dropped the
        // session it had. Either way the sign-in form is the answer: a name alone
        // is not a way in any more, and a password is not something this browser
        // is holding on anybody's behalf.
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username, password) => {
    await api.login(username, password);
    localStorage.setItem(KEY, username);
    setUser(username);
  };

  // Opening an account and signing into it are one request: the name has been
  // confirmed and the password just chosen, and what comes back is a session.
  const register = async (username, password) => {
    await api.createUser(username, password);
    localStorage.setItem(KEY, username);
    setUser(username);
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    localStorage.removeItem(KEY);
    setUser(null);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        ready,
        login,
        register,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
