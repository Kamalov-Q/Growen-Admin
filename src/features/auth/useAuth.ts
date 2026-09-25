import { useCallback, useState } from "react";
import { adminApi, ApiError } from "../../lib/api";
import { sessionStore, useSession } from "../../lib/session";

/** Sign-in, sign-out, and who is signed in. */
export function useAuth() {
  const session = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (phone: string, password: string) => {
    setPending(true);
    setError(null);
    try {
      const result = await adminApi.login(phone, password);
      // The same endpoint serves the mobile app, so the account may well be a
      // real user with the right password and no business here. Nothing is
      // stored in that case — the API would refuse every admin call anyway,
      // but a dashboard that looked signed in would be a puzzle, not a guard.
      if (result.user.role !== "ADMIN") {
        setError("Bu hisob administrator emas / Этот аккаунт не администратор");
        return false;
      }
      sessionStore.save(result);
      return true;
    } catch (e) {
      setError(
        e instanceof ApiError
          ? // The server distinguishes "no password on this account" from bad
            // credentials — worth passing on, since the fix is different.
            e.code === "PASSWORD_NOT_SET"
            ? "Bu hisobda parol yo'q — ilovada parol o'rnating / У аккаунта нет пароля — задайте его в приложении"
            : e.status === 401 || e.status === 400
              ? "Telefon raqami yoki parol noto'g'ri / Неверный номер или пароль"
              : e.message
          : "Serverga ulanib bo'lmadi / Не удалось связаться с сервером",
      );
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // Revoke server-side first, while the access token is still held: a token
    // only dropped locally stays valid until it expires.
    await adminApi.logout().catch(() => undefined);
    sessionStore.clear();
  }, []);

  return { session, user: session?.user ?? null, login, logout, pending, error };
}
