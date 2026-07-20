import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "@pages/Home";
import Stash from "@pages/Stash";
import { Toast } from "@ui";
import { UserProvider } from "@utils/UserContext";

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
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
