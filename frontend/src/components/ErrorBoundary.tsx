import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

/** App-wide error boundary — a render error now shows a readable message (with the
 *  stack) instead of blanking the whole page, and offers a session reset. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the console for diagnosis.
    console.error("App crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", background: "#0d1117", color: "#fff", fontFamily: "Inter, system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 720, margin: "48px auto", background: "rgba(226,72,59,0.07)", border: "1px solid rgba(226,72,59,0.3)", borderRadius: 14, padding: 26 }}>
          <h2 style={{ color: "#fca5a5", margin: "0 0 6px", fontSize: 18 }}>Something went wrong on this screen</h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "0 0 14px", lineHeight: 1.6 }}>
            A component hit an error. Copy the details below so it can be fixed — or reset the session if it keeps happening.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11.5, background: "#000", padding: 12, borderRadius: 8, color: "#fca5a5", overflow: "auto", maxHeight: 320, margin: 0 }}>
            {error.message}
            {"\n\n"}
            {error.stack}
          </pre>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11.5, margin: "12px 0 0", lineHeight: 1.6 }}>
            If the tool was just updated, <b style={{ color: "rgba(255,255,255,0.65)" }}>Reload page</b> fetches the newest version — a plain in-page retry keeps running the old code.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button onClick={() => { location.reload(); }}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              Reload page
            </button>
            <button onClick={() => { try { sessionStorage.clear(); localStorage.removeItem("ppg-wizard-v1"); } catch { /**/ } location.href = "/"; }}
              style={{ padding: "8px 16px", borderRadius: 8, border: 0, background: "#721CB8", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              Reset session &amp; reload
            </button>
            <button onClick={() => this.setState({ error: null })}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontWeight: 500, fontSize: 13 }}>
              Dismiss (keep old code)
            </button>
          </div>
        </div>
      </div>
    );
  }
}
