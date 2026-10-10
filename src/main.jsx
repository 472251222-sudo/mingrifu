import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

const WorldPrototype = React.lazy(() => import("./growth/WorldPrototype.jsx"));
const isWorldPrototype = window.location.pathname.replace(/\/$/, "") === "/growth-p1";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isWorldPrototype ? (
      <React.Suspense fallback={<div role="status">正在打开成长世界…</div>}>
        <WorldPrototype />
      </React.Suspense>
    ) : <App />}
  </React.StrictMode>,
);
