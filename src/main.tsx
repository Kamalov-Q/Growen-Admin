import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootPrefs } from "./lib/prefs";
import { getLang } from "./lib/i18n";

// Before React renders: a theme applied afterwards flashes the other one,
// and <html lang> should be right for the first screen reader pass too.
bootPrefs();
document.documentElement.lang = getLang();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
