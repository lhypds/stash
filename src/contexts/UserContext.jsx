import { createContext, useContext, useState } from "react";
import { ensureUser } from "@utils/api";

const KEY = "stash:user";
const USERNAME_RE = /^[a-z0-9_-]{1,32}$/;
const UserContext = createContext(null);

export const isValidUsername = (username) => USERNAME_RE.test(username);

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => localStorage.getItem(KEY) || null);

  const login = (username) => {
    localStorage.setItem(KEY, username);
    setUser(username);
    ensureUser(username).catch(() => {});
  };

  const logout = () => {
    localStorage.removeItem(KEY);
    setUser(null);
  };

  return <UserContext.Provider value={{ user, login, logout }}>{children}</UserContext.Provider>;
}

export const useUser = () => useContext(UserContext);
