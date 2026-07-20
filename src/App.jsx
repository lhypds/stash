import { useLayoutEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Home from "@pages/Home";
import Stash from "@pages/Stash";
import { Toast } from "@ui";
import { UserProvider } from "@contexts/UserContext";

// React Router keeps the scroll offset across route changes, so a page can
// mount pre-scrolled (e.g. after iOS scrolled Home to fit the keyboard)
function ScrollToTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/:username" element={<Stash />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toast />
    </UserProvider>
  );
}
