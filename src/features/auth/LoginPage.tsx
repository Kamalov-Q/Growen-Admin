import { useState, useRef, type FormEvent, type KeyboardEvent } from "react";
import { useAuth } from "./useAuth";
import { usePrefs, setPrefs } from "../../lib/prefs";

/** What the panel actually opens onto — taken from the sidebar, not invented. */
const SECTIONS = [
  "E'lonlar va kategoriyalar",
  "Foydalanuvchilar va tasdiqlash",
  "Tariflar va to'lovlar",
  "Shikoyatlar va yordam",
];

/**
 * `+998 90 123 45 67` as it is typed.
 *
 * The country code is part of the field rather than a decoration, so it
 * cannot be deleted by accident — every admin here is on a 998 number, and
 * the server strips separators anyway, so the spaces are purely for reading.
 */
const UZ_CODE = "998";

function maskPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  const local = (digits.startsWith(UZ_CODE) ? digits.slice(3) : digits).slice(0, 9);
  const groups = [local.slice(0, 2), local.slice(2, 5), local.slice(5, 7), local.slice(7, 9)];
  return `+${UZ_CODE}${groups.filter(Boolean).length ? " " + groups.filter(Boolean).join(" ") : ""}`;
}

/** Nine local digits is a complete number; anything less cannot be submitted. */
const isComplete = (masked: string) => masked.replace(/\D/g, "").length === 12;

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const PATHS = {
  phone:
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  eyeOff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22",
  alert: "M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z",
  sun: "M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z",
  check: "M20 6 9 17l-5-5",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
};

/**
 * Phone + password, the same credentials as the mobile app. An admin who has
 * never set a password sets one there (or with the server's grant script),
 * because this screen deliberately has no way to create or reset an account.
 */
export function LoginPage() {
  const { login, pending, error } = useAuth();
  const { theme } = usePrefs();
  const [phone, setPhone] = useState(`+${UZ_CODE}`);
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const ready = isComplete(phone) && password.length > 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending && ready) void login(phone.trim(), password);
  };

  // A wrong password that was actually the right one in capitals is the most
  // common sign-in failure there is, and the only one the page can warn about.
  const trackCaps = (e: KeyboardEvent<HTMLInputElement>) =>
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);

  const dark = theme === "dark";

  return (
    <main className="login">
      {/* ---- Brand side. Hidden below 900px, where it would only push the
              form under the fold. ---- */}
      <aside className="login__aside">
        <div className="login__aside-inner">
          <img src="/emblem.png" alt="" className="login__logo" width={52} height={52} />
          <h1 className="login__headline">Growen City</h1>
          <p className="login__tagline">Boshqaruv paneli</p>

          <ul className="login__list">
            {SECTIONS.map((item) => (
              <li key={item} className="login__list-item">
                <span className="login__tick">
                  <Icon path={PATHS.check} size={13} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="login__note">
          <Icon path={PATHS.shield} size={14} />
          Faqat administratorlar uchun
        </p>
      </aside>

      {/* ---- Form side ---- */}
      <section className="login__panel">
        <button
          type="button"
          className="login__theme"
          onClick={() => setPrefs({ theme: dark ? "light" : "dark" })}
          aria-label={dark ? "Yorug' rejim" : "Qorong'i rejim"}
          title={dark ? "Yorug' rejim" : "Qorong'i rejim"}
        >
          <Icon path={dark ? PATHS.sun : PATHS.moon} size={17} />
        </button>

        <form className="login__form login__card" onSubmit={onSubmit} noValidate>
          {/* Shown only on narrow screens, where the aside is gone. */}
          <div className="login__compact-brand">
            <img src="/emblem.png" alt="" width={44} height={44} className="login__logo" />
            <div>
              <h1 className="login__title">Growen City</h1>
              <p className="muted">Boshqaruv paneli</p>
            </div>
          </div>

          <div className="login__intro">
            <h2 className="login__h2">Xush kelibsiz</h2>
            <p className="muted">Davom etish uchun hisobingizga kiring.</p>
          </div>

          <label className="field">
            <span className="field__label">Telefon raqami</span>
            <div className="login__input-wrap">
              <span className="login__input-icon">
                <Icon path={PATHS.phone} size={16} />
              </span>
              <input
                className="input login__input"
                type="tel"
                inputMode="numeric"
                autoComplete="username"
                autoFocus
                placeholder="+998 90 123 45 67"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                aria-invalid={!!error}
                required
              />
            </div>
          </label>

          <label className="field">
            <span className="field__label">Parol</span>
            <div className="login__input-wrap">
              <span className="login__input-icon">
                <Icon path={PATHS.lock} size={16} />
              </span>
              <input
                ref={passwordRef}
                className="input login__input login__input--password"
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={trackCaps}
                onBlur={() => setCapsOn(false)}
                aria-invalid={!!error}
                required
              />
              <button
                type="button"
                className="login__reveal"
                onClick={() => {
                  setReveal((v) => !v);
                  passwordRef.current?.focus();
                }}
                aria-label={reveal ? "Parolni yashirish" : "Parolni ko'rsatish"}
                title={reveal ? "Parolni yashirish" : "Parolni ko'rsatish"}
                tabIndex={-1}
              >
                <Icon path={reveal ? PATHS.eyeOff : PATHS.eye} size={17} />
              </button>
            </div>
            {capsOn ? (
              <p className="login__hint">Caps Lock yoqilgan</p>
            ) : null}
          </label>

          {error ? (
            <p className="alert login__alert" role="alert">
              <Icon path={PATHS.alert} size={16} />
              <span>{error}</span>
            </p>
          ) : null}

          <button
            className="btn btn--primary login__submit"
            type="submit"
            disabled={pending || !ready}
          >
            {pending ? <span className="login__spinner" aria-hidden="true" /> : null}
            {pending ? "Kirilmoqda…" : "Kirish"}
          </button>

          <p className="login__foot muted">
            Parolingiz yo'qmi? Uni Growen City ilovasida o'rnating.
          </p>
        </form>
      </section>
    </main>
  );
}
