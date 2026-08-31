import React from "react";
import { createRoot } from "react-dom/client";
import MafiaAccount from "./MafiaAccount.jsx";
import "./mafia.css";
import "./bright-theme.css";

class CrashScreen extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("The Family failed to start", error); }
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
