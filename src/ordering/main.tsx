import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OrderApp } from "./OrderApp";
import "../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OrderApp />
  </StrictMode>,
);
