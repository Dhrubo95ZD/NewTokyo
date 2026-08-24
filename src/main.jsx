import React from "react";
import { createRoot } from "react-dom/client";
import NeoTokyoUnderworld from "./NeoTokyoUnderworld.jsx";
import { createStorageBridge } from "./storage.js";
import "./mobile.css";

window.storage = createStorageBridge({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

createRoot(document.getElementById("root")).render(<NeoTokyoUnderworld />);
