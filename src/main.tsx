import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/components.css";
import "./styles/payment.css";
import "./styles/receipt.css";
import "./styles/request.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
