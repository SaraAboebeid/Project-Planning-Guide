/* Sign in by email link. /login asks for the address; /login/verify is where the
   emailed link lands. The verify page asks for one click instead of signing in
   on load: mail scanners (e.g. Outlook Safe Links) open links in advance, and
   would otherwise use up the one-time token before the person does. */

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, LogIn, CheckCircle2, Loader2 } from "lucide-react";
import { accounts } from "../api/accounts";
import { useAuth } from "../store/auth";
import { useT } from "../i18n";
import { C, tint } from "../config/colors";

const card: React.CSSProperties = {
  maxWidth: 440, margin: "48px auto", padding: "28px 28px 24px", borderRadius: 16,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)",
};
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 14, color: "#fff",
  background: "#0d1117", border: "1px solid rgba(255,255,255,0.15)", outline: "none",
};
const primary = (disabled: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "10px 16px",
  borderRadius: 10, border: 0, fontSize: 14, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer",
  background: disabled ? "rgba(255,255,255,0.08)" : "var(--brand-deep)", color: disabled ? "rgba(255,255,255,0.4)" : "#fff",
});

/** Where to go after signing in — set by whoever sent the user to /login. */
export const RETURN_KEY = "ppg-login-return";

export function LoginPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [delivery, setDelivery] = useState<"email" | "log">("email");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setState("sending");
    try {
      const res = await accounts.requestLink(email.trim());
      setDelivery(res.delivery);
      setState("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Mail size={20} color={C.selected} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>{t("Sign in")}</h1>
      </div>
      {state !== "sent" ? (
        <>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, margin: "0 0 18px" }}>
            {t("Enter your work email and we'll send you a sign-in link. Signing in lets you save projects and open them again later.")}
          </p>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 6 }} htmlFor="login-email">
            {t("Work email")}
          </label>
          <input id="login-email" type="email" autoComplete="email" value={email} autoFocus
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && email.trim()) send(); }}
            placeholder="name@chalmers.se" style={{ ...input, marginBottom: 12 }} />
          {error && (
            <div role="alert" style={{ fontSize: 12.5, color: C.bad, background: tint(C.bad, 0.1), border: `1px solid ${tint(C.bad, 0.35)}`,
              borderRadius: 8, padding: "8px 10px", marginBottom: 12, lineHeight: 1.5 }}>⚠ {error}</div>
          )}
          <button onClick={send} disabled={!email.trim() || state === "sending"} style={primary(!email.trim() || state === "sending")}>
            {state === "sending" ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
            {t("Email me a sign-in link")}
          </button>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "14px 0 0", lineHeight: 1.5 }}>
            {t("For now, sign-in is open to partner organisations (Chalmers, Framtiden, Poseidon, Nacka, Chalmers Next Labs, HSB).")}
          </p>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
          <p style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "0 0 10px" }}>
            <CheckCircle2 size={17} color={C.good} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{delivery === "email"
              ? t("Check your inbox at {email}. The link works once and expires in 15 minutes.", { email: email.trim() })
              : t("This server has no outgoing email set up yet, so the sign-in link was written to the backend log. Ask the administrator, or set SMTP_* in .env.")}</span>
          </p>
          <button onClick={() => setState("idle")} style={{ background: "transparent", border: 0, color: C.selected, cursor: "pointer", fontSize: 12.5, fontWeight: 700, padding: 0 }}>
            {t("Use a different email")}
          </button>
        </div>
      )}
    </div>
  );
}

export function LoginVerifyPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const refresh = useAuth((s) => s.refresh);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : t("This sign-in link is incomplete. Request a new one."));

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await accounts.verify(token);
      await refresh();
      let to = "/projects";
      try { to = sessionStorage.getItem(RETURN_KEY) || to; sessionStorage.removeItem(RETURN_KEY); } catch { /* storage blocked */ }
      navigate(to, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <LogIn size={20} color={C.selected} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>{t("Finish signing in")}</h1>
      </div>
      {error ? (
        <>
          <div role="alert" style={{ fontSize: 13, color: C.bad, lineHeight: 1.5, marginBottom: 14 }}>⚠ {error}</div>
          <button onClick={() => navigate("/login")} style={primary(false)}>{t("Request a new link")}</button>
        </>
      ) : (
        <button onClick={signIn} disabled={busy} style={primary(busy)}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />} {t("Sign in")}
        </button>
      )}
    </div>
  );
}
