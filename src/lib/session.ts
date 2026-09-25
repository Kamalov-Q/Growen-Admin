// Who is signed in, and the tokens that prove it.
//
// The access token is kept in memory only: it is short-lived and a variable
// cannot be read out of localStorage by injected script. The refresh token and
// the user do persist, so a page reload does not sign the admin out — that is
// the accepted trade for this dashboard, and the reason logout revokes the
// token server-side rather than only dropping it here.
import { useSyncExternalStore } from "react";

export interface AdminUser {
  id: string;
  name: string | null;
  surname: string | null;
  phoneNumber: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
}

export interface Session {
  refreshToken: string;
  user: AdminUser;
}

const KEY = "growen.admin.session";

let accessToken: string | null = null;
let session: Session | null = read();
const listeners = new Set<() => void>();

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed?.refreshToken && parsed?.user ? parsed : null;
  } catch {
    // Unparseable or storage blocked: treat it as signed out.
    return null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export const sessionStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => session,
  getAccessToken: () => accessToken,
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  save(next: { accessToken: string; refreshToken: string; user: AdminUser }) {
    accessToken = next.accessToken;
    session = { refreshToken: next.refreshToken, user: next.user };
    try {
      localStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      // Private mode or blocked storage — the session still works until reload.
    }
    emit();
  },
  clear() {
    accessToken = null;
    session = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clean up */
    }
    emit();
  },
};

/** The current session, re-rendering the component when it changes. */
export function useSession(): Session | null {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
}
