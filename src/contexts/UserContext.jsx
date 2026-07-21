import { createContext, useContext, useEffect, useState } from "react";
import * as api from "@utils/api";

const KEY = "stash:user";
const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;
const UserContext = createContext(null);

export const isValidUsername = (username) => USERNAME_RE.test(username);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [hasLock, setHasLock] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem(KEY);

    async function restore() {
      try {
        const { username, hasLock: sessionHasLock, locked: sessionLocked } = await api.getSession();
        if (!cancelled) {
          localStorage.setItem(KEY, username);
          setUser(username);
          setHasLock(sessionHasLock);
          setLocked(sessionLocked);
        }
      } catch {
        // Migrate the old localStorage-only login into a server session.
        if (stored && isValidUsername(stored)) {
          try {
            const session = await api.login(stored);
            if (!cancelled) {
              setUser(stored);
              setHasLock(session.hasLock);
              setLocked(session.locked);
            }
          } catch {
            localStorage.removeItem(KEY);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username) => {
    const session = await api.login(username);
    localStorage.setItem(KEY, username);
    setUser(username);
    setHasLock(session.hasLock);
    setLocked(session.locked);
  };

  const unlock = async (password) => {
    const status = await api.unlockUser(user, password);
    setHasLock(status.hasLock);
    setLocked(status.locked);
  };

  const setPasswordAndLock = async (password) => {
    const status = await api.lockUser(user, password);
    setHasLock(status.hasLock);
    setLocked(status.locked);
  };

  const relock = async () => {
    const status = await api.relockUser(user);
    setHasLock(status.hasLock);
    setLocked(status.locked);
  };

  const refreshLock = async () => {
    const status = await api.getLock(user);
    setHasLock(status.hasLock);
    setLocked(status.locked);
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    localStorage.removeItem(KEY);
    setUser(null);
    setHasLock(false);
    setLocked(false);
  };

  return (
    <UserContext.Provider
      value={{ user, ready, hasLock, locked, login, logout, unlock, setPasswordAndLock, relock, refreshLock }}
    >
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);
