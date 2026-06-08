import { FormEvent, useState } from "react";

type Props = {
  mode: "open" | "close";
  staffName?: string;
  defaultUsername?: string;
  usernameReadonly?: boolean;
  onSubmit: (username: string, password: string) => Promise<void>;
  onCancel: () => void;
};

export default function StaffLoginModal({
  mode,
  staffName,
  defaultUsername = "",
  usernameReadonly = false,
  onSubmit,
  onCancel,
}: Props) {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onSubmit(username.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 100,
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{ maxWidth: 400, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{mode === "open" ? "Start your shift" : `End shift — ${staffName}`}</h2>
        <p style={{ color: "var(--muted)", marginBottom: "1rem", fontSize: "0.95rem" }}>
          {mode === "open"
            ? "Enter your username and password to open a shift and take orders."
            : "Enter your password to confirm and close this shift."}
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <label>
              Username
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                readOnly={usernameReadonly}
                required
                placeholder="e.g. ghassan"
                style={usernameReadonly ? { background: "var(--bg)" } : undefined}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={mode === "open" ? "current-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus={usernameReadonly}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? "Please wait…" : mode === "open" ? "Open shift" : "End shift"}
            </button>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
