import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
import { useT } from "../lib/i18n";
import { useRate } from "../lib/useRate";
import { usePrefs } from "../lib/prefs";
import { Avatar, Toaster } from "./ui";

const ICONS = {
  home: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  ),
  users: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5.4M21.5 20c-.5-2.2-1.8-3.8-3.8-4.5" />
    </svg>
  ),
  categories: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  ),
  listings: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  amenities: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.9 5.6L20 9l-4.6 3.6L17 19l-5-3.4L7 19l1.6-6.4L4 9l6.1-.4z" />
    </svg>
  ),
  chatReports: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 21 12z" />
      <path d="M12 8v4" />
      <path d="M12 15.5h.01" />
    </svg>
  ),
  comments: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
    </svg>
  ),
  support: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1v-8H5v-0a7 7 0 0 1 14 0v0h-2v8h1a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9z" />
      <path d="M16 19a3 3 0 0 1-3 3h-1" />
    </svg>
  ),
  settings: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  ),
  reviews: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  ),
  reports: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4L18 12H5" />
    </svg>
  ),
} as const;

const NAV = [
  { to: "/", label: "Boshqaruv", end: true, icon: ICONS.home },
  { to: "/users", label: "Foydalanuvchilar", icon: ICONS.users },
  { to: "/listings", label: "E'lonlar", icon: ICONS.listings },
  { to: "/categories", label: "Kategoriyalar", icon: ICONS.categories },
  { to: "/amenities", label: "Xususiyatlar", icon: ICONS.amenities },
  { to: "/reviews", label: "Sharhlar", icon: ICONS.reviews },
  { to: "/comments", label: "Izohlar", icon: ICONS.comments },
  { to: "/reports", label: "Shikoyatlar", icon: ICONS.reports },
  { to: "/chat-reports", label: "Suhbat shikoyatlari", icon: ICONS.chatReports },
  { to: "/support", label: "Yordam", icon: ICONS.support },
  { to: "/settings", label: "Sozlamalar", icon: ICONS.settings },
];

// Remembered per browser: an admin who prefers the rail keeps it across
// reloads. Wrapped in try — storage can be blocked, and that must never stop
// the dashboard from rendering.
const COLLAPSED_KEY = "growen.admin.sidebarCollapsed";
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

/** Sidebar shell: the frame every signed-in page renders inside. */
export function Layout() {
  const { user, logout } = useAuth();
  const t = useT();
  // Loaded here so every table can render converted prices, not just the
  // settings page that shows the rate.
  useRate();
  // Subscribed, not read: a currency or page-size change has to repaint the
  // tables rendered inside <Outlet/>, and this is what makes them re-render.
  usePrefs();
  const fullName = [user?.name, user?.surname].filter(Boolean).join(" ");
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        /* the toggle still works for this visit */
      }
      return !c;
    });

  return (
    <div className={`shell${collapsed ? " shell--collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <img src="/emblem.png" alt="" width={44} height={44} className="sidebar__logo" />
          <div className="sidebar__brand-text">
            <strong>Growen City</strong>
            <span className="muted sidebar__subtitle">{t("Admin panel")}</span>
          </div>
        </div>

        {/* A tab on the sidebar's edge, so it sits in the same place whether
            the sidebar is open or folded to its icon rail. */}
        <button
          className="sidebar__toggle"
          onClick={toggle}
          aria-label={collapsed ? "Menyuni ochish" : "Menyuni yig'ish"}
          aria-expanded={!collapsed}
          title={collapsed ? "Menyuni ochish" : "Menyuni yig'ish"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <nav className="nav">
          <p className="nav__label">{t("MENYU")}</p>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              // Folded to icons, the label is gone — the tooltip says where it goes.
              title={collapsed ? t(item.label) : undefined}
              className={({ isActive }) => `nav__link${isActive ? " nav__link--active" : ""}`}
            >
              {item.icon}
              <span className="nav__text">{t(item.label)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__card">
            <Avatar name={user?.name ?? null} surname={user?.surname ?? null} />
            <div className="sidebar__user">
              <span className="sidebar__name">{fullName || user?.phoneNumber}</span>
              <span className="muted">{user?.phoneNumber}</span>
            </div>
            <button
              className="icon-btn"
              onClick={() => void logout()}
              title={t("Chiqish")}
              aria-label={t("Chiqish")}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>

      <Toaster />
    </div>
  );
}
