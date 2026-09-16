import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
