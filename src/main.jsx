import React from "react";
import { createRoot } from "react-dom/client";
import NeoTokyoUnderworld from "./NeoTokyoUnderworld.jsx";
import { createStorageBridge } from "./storage.js";
import OnlineHub from "./online/OnlineHub.jsx";
import { supabase } from "./online/supabase.js";
import "./mobile.css";

class CrashScreen extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("Neo-Tokyo crashed", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash-screen">
        <h1>Neo-Tokyo failed to start</h1>
        <p>{this.state.error.message || String(this.state.error)}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </main>
    );
  }
}

window.storage = createStorageBridge({ client: supabase });

createRoot(document.getElementById("root")).render(
  <CrashScreen><OnlineHub><NeoTokyoUnderworld /></OnlineHub></CrashScreen>,
);
