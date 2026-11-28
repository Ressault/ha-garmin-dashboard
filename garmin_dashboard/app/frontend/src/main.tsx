import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Hors ligne : l'interface reste ouvrable (page et fichiers gardés par le navigateur), les données viennent du dernier chargement.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* contexte non sécurisé (adresse http locale) : pas de mode hors ligne, rien d'autre ne change */
    });
  });
}
