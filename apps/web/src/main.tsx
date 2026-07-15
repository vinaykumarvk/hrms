import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles/tokens.css";
import "./styles.css";

/* Prevent FOUC: apply theme class before React hydrates. */
(function applyInitialTheme() {
  try {
    const stored = localStorage.getItem("hrms.theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
    } else if (stored === "light") {
      document.documentElement.classList.add("light");
    }
    /* Otherwise let @media (prefers-color-scheme: dark) decide via tokens.css */
  } catch { /* localStorage blocked — OS preference fallback applies */ }
})();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("HRMS root element is missing");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary onError={() => window.dispatchEvent(new Event("hrms:render-error"))}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
