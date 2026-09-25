import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main style={{ fontFamily: "Georgia, serif", maxWidth: 720, margin: "96px auto", padding: "0 16px", color: "#1d2433" }}>
      <h1 style={{ fontSize: 48, fontWeight: 400 }}>ListingBoost</h1>
      <p style={{ fontSize: 20 }}>One property. Every piece of marketing you need.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
