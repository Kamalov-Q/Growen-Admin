import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { ApiError } from "../lib/api";
import { toastItems, toastSubs } from "../lib/toast";
import { t } from "../lib/i18n";
import { confirmSubs, currentConfirm, settleConfirm } from "../lib/confirm";
import { PAGE_SIZES } from "../lib/usePaging";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

/** Grey block standing in for content that has not arrived yet. */
export function Skeleton({ width, height = 16 }: { width: number | string; height?: number }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden />;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  // 403 is its own story: signed in, but not (or no longer) an admin.
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div className="card empty">
      <p className="empty__title">
        {forbidden ? "Ruxsat yo'q" : "Ma'lumotni olishda xatolik"}
      </p>
      <p className="muted">
        {forbidden
          ? "Bu hisobda administrator huquqi yo'q."
          : error instanceof Error
            ? error.message
            : "Noma'lum xatolik"}
      </p>
      {forbidden ? null : (
        <button className="btn btn--ghost" onClick={onRetry}>
          Qayta urinish
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card empty">
      <p className="empty__title">{title}</p>
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

/** Coloured initials disc — the table's face for a user without a photo. */
export function Avatar({
  name,
  surname,
  photo,
}: {
  name: string | null;
  surname: string | null;
  photo?: string;
}) {
  const initials =
    [name, surname]
      .filter(Boolean)
      .map((s) => s![0]!.toUpperCase())
      .join("") || "•";
  // A stable pastel per person, derived from the initials.
  const hue =
    ([...(name ?? ""), ...(surname ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;
  return photo ? (
    <img className="avatar" src={photo} alt="" />
  ) : (
    <span className="avatar" style={{ background: `hsl(${hue} 45% 42%)` }}>
      {initials}
    </span>
  );
}

/**
 * The app's own confirmation dialog.
 *
 * Mounted once, next to the Toaster. The browser's `confirm()` blocks the
 * whole tab, cannot be translated, cannot be styled, and announces itself as
 * "localhost:5173 says" — which is a strange voice for a product to speak in
 * when it is about to delete somebody's data.
 */
export function ConfirmHost() {
  const request = useSyncExternalStore(
    (fn) => {
      confirmSubs.add(fn);
      return () => confirmSubs.delete(fn);
    },
    () => currentConfirm(),
  );

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape cancels, Enter confirms — the two keys a dialog owes you.
      if (e.key === "Escape") settleConfirm(false);
      if (e.key === "Enter") settleConfirm(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request]);

  if (!request) return null;

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && settleConfirm(false)}
    >
      <div
        className="modal card confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title}
      >
        <div className="modal__body confirm__body">
          <h2 className="confirm__title">{request.title}</h2>
          {request.message ? (
            <p className="confirm__text muted">{request.message}</p>
          ) : null}
        </div>
        <footer className="modal__foot">
          <button className="btn btn--ghost" onClick={() => settleConfirm(false)}>
            {request.cancelLabel ?? t("Bekor qilish")}
          </button>
          <button
            className={`btn ${request.destructive ? "btn--danger" : "btn--primary"}`}
            onClick={() => settleConfirm(true)}
            autoFocus
          >
            {request.confirmLabel ?? t("Tasdiqlash")}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---- toasts ----------------------------------------------------------------
export function Toaster() {
  const items = useSyncExternalStore(
    (fn) => {
      toastSubs.add(fn);
      return () => toastSubs.delete(fn);
    },
    () => toastItems(),
  );
  if (!items.length) return null;
  return (
    <div className="toaster" role="status">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---- overlays --------------------------------------------------------------

/** Centred dialog with a scrim; Escape and scrim-click both close it. */
export function Modal({
  open,
  title,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Right-hand slide-over for record detail; same closing gestures as Modal. */
export function Drawer({
  open,
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay overlay--right" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer__head">
          <div className="drawer__headings">
            <h2 className="modal__title">{title}</h2>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Yopish">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer ? <footer className="drawer__foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

/** Page N of M, with the controls that move between them. */
export function Pager({
  offset,
  limit,
  total,
  onChange,
  onLimitChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (next: number) => void;
  /** Omit to keep a fixed page size (no rows-per-page control is shown). */
  onLimitChange?: (next: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  // One page of rows needs no controls at all — but the row count is still
  // worth showing once a table is big enough to have a page size chosen for it.
  if (total <= Math.min(limit, PAGE_SIZES[0])) return null;

  return (
    <div className="pager">
      <button
        className="btn btn--ghost"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        {t("← Oldingi")}
      </button>
      <div className="pager__mid">
        <span className="muted">
          {page} / {pages} · jami {total.toLocaleString("ru-RU")}
        </span>

        {onLimitChange ? (
          <label className="pager__size">
            <span className="muted">{t("Sahifada")}</span>
            <select
              className="input"
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <button
        className="btn btn--ghost"
        disabled={page >= pages}
        onClick={() => onChange(offset + limit)}
      >
        {t("Keyingi →")}
      </button>
    </div>
  );
}
