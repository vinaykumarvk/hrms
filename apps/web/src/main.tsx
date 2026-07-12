import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./styles/tokens.css";
import "./styles.css";

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
