import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { registerSW } from "virtual:pwa-register";

const updateServiceWorker = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new Event("my-music-update-available"));
  },
  onOfflineReady() {
    window.dispatchEvent(new Event("my-music-offline-ready"));
  },
  onRegisterError(error) {
    console.error("Não foi possível preparar a aplicação offline:", error);
  },
});

window.addEventListener("my-music-apply-update", () => {
  void updateServiceWorker(true);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
