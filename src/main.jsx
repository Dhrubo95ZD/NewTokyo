import React from "react";
import { createRoot } from "react-dom/client";
import MafiaAccount from "./MafiaAccount.jsx";
import "./mafia.css";
import "./bright-theme.css";
import "./mobile-trading-fixes.css";
import "./living-city.css";
import { supabase } from "./online/supabase.js";

const reportClientError = (error, context = {}) => {
  if (!supabase) return;
  const value = error instanceof Error ? error : new Error(String(error));
  supabase.rpc("bw_log_client_error", { p_message: value.message, p_stack: value.stack || "", p_context: { ...context, path: location.pathname } }).then(() => {});
};
window.addEventListener("error", event => reportClientError(event.error || event.message, { source: "window.error" }));
window.addEventListener("unhandledrejection", event => reportClientError(event.reason, { source: "unhandledrejection" }));

class CrashScreen extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("The Family failed to start", error); reportClientError(error, { source: "react-boundary", componentStack: String(info?.componentStack || "").slice(0, 1500) }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="crash-screen">
        <h1>The city went quiet.</h1>
        <p>{this.state.error.message || String(this.state.error)}</p>
        <button onClick={() => location.reload()}>Retry</button>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <CrashScreen><MafiaAccount /></CrashScreen>,
);
