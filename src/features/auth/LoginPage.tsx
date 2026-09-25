import { useState, type FormEvent } from "react";
import { useAuth } from "./useAuth";

/**
 * Phone + password, the same credentials as the mobile app. An admin who has
 * never set a password sets one there (or with the server's grant script),
 * because this screen deliberately has no way to create or reset an account.
 */
export function LoginPage() {
  const { login, pending, error } = useAuth();
  const [phone, setPhone] = useState("+998");
  const [password, setPassword] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending) void login(phone.trim(), password);
  };

  return (
    <main className="login">
      <form className="card login__card" onSubmit={onSubmit}>
        <div className="login__brand">
          <img src="/emblem.png" alt="" className="login__logo" width={56} height={56} />
          <div>
            <h1 className="login__title">Growen City</h1>
            <p className="muted">Admin panel</p>
          </div>
        </div>

        <label className="field">
          <span className="field__label">Telefon raqami</span>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="+998 90 123 45 67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field__label">Parol</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}

        <button className="btn btn--primary" type="submit" disabled={pending}>
          {pending ? "Kirilmoqda…" : "Kirish"}
        </button>
      </form>
    </main>
  );
}
