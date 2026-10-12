import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
import { useT } from "../lib/i18n";
import { confirmDialog } from "../lib/confirm";
import { useRate } from "../lib/useRate";
import { usePrefs } from "../lib/prefs";
import { Avatar, ConfirmHost, Toaster } from "./ui";

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
  tariffs: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
      <path d="M2.5 10.5h19" />
      <path d="M6.5 15h4" />
    </svg>
  ),
  billing: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
    </svg>
  ),
  verification: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7.5 3v5.5c0 4.3-3 7.7-7.5 9-4.5-1.3-7.5-4.7-7.5-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  ),
  storyReports: (
    <svg className="nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="3" width="12" height="18" rx="3" />
      <path d="M3 7.5v9M21 7.5v9" />
      <path d="M12 9.5v3M12 15.5h.01" />
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

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}
interface NavGroupItem {
  label: string;
  icon: React.ReactNode;
  children: NavItem[];
}

const NAV: (NavItem | NavGroupItem)[] = [
  { to: "/", label: "Boshqaruv", end: true, icon: ICONS.home },
  { to: "/users", label: "Foydalanuvchilar", icon: ICONS.users },
  { to: "/listings", label: "E'lonlar", icon: ICONS.listings },
  { to: "/categories", label: "Kategoriyalar", icon: ICONS.categories },
  { to: "/amenities", label: "Xususiyatlar", icon: ICONS.amenities },
  { to: "/tariffs", label: "Tariflar", icon: ICONS.tariffs },
  { to: "/billing", label: "To'lovlar", icon: ICONS.billing },
  {
    label: "Fikrlar",
    icon: ICONS.comments,
    children: [
      { to: "/reviews", label: "Sharhlar", icon: ICONS.reviews },
      { to: "/comments", label: "Izohlar", icon: ICONS.comments },
    ],
  },
  {
    label: "Shikoyatlar",
    icon: ICONS.reports,
    children: [
      { to: "/reports", label: "E'lon shikoyatlari", icon: ICONS.listings },
      { to: "/chat-reports", label: "Suhbat shikoyatlari", icon: ICONS.chatReports },
      { to: "/story-reports", label: "Hikoya shikoyatlari", icon: ICONS.storyReports },
    ],
  },
  { to: "/verification", label: "Tasdiqlash so'rovlari", icon: ICONS.verification },
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

  const onLogout = async () => {
    const ok = await confirmDialog({
      title: t("Chiqishni tasdiqlaysizmi?"),
      message: t("Hisobingizdan chiqasiz."),
      confirmLabel: t("Chiqish"),
      destructive: true,
    });
    if (ok) await logout();
  };
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
          {NAV.map((item) =>
            "children" in item ? (
              <NavGroup key={item.label} group={item} collapsed={collapsed} />
            ) : (
              <NavItemLink key={item.to} item={item} collapsed={collapsed} />
            ),
          )}
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
              // Confirmed: signing out is one click from every page in the
              // dashboard, and the cost of a misclick is losing whatever was
              // half-written in a support reply.
              onClick={() => void onLogout()}
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
      <ConfirmHost />
    </div>
  );
}

function NavItemLink({ item, collapsed, sub }: { item: NavItem; collapsed: boolean; sub?: boolean }) {
  const t = useT();
  return (
    <NavLink
      to={item.to}
      end={item.end}
      // Folded to icons, the label is gone — the tooltip says where it goes.
      title={collapsed ? t(item.label) : undefined}
      className={({ isActive }) =>
        `nav__link${sub ? " nav__link--sub" : ""}${isActive ? " nav__link--active" : ""}`
      }
    >
      {item.icon}
      <span className="nav__text">{t(item.label)}</span>
    </NavLink>
  );
}

/**
 * A heading that folds its pages away behind a chevron.
 *
 * It follows the route until the admin touches it: on one of its pages it is
 * open, elsewhere closed — and once toggled by hand, it stays the way it was
 * left. On the icon rail and on a phone there is no room for a heading, so
 * the pages show as ordinary items (see .nav-group in index.css).
 */
function NavGroup({ group, collapsed }: { group: NavGroupItem; collapsed: boolean }) {
  const t = useT();
  const { pathname } = useLocation();
  const childActive = group.children.some(
    (c) => pathname === c.to || pathname.startsWith(`${c.to}/`),
  );
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? childActive;

  return (
    <div className={`nav-group${open ? " nav-group--open" : ""}`}>
      <button
        type="button"
        className={`nav__link nav-group__head${childActive && !open ? " nav__link--active" : ""}`}
        aria-expanded={open}
        onClick={() => setChosen(!open)}
      >
        {group.icon}
        <span className="nav__text">{t(group.label)}</span>
        <svg
          className="nav-group__chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <div className="nav-group__items">
        {group.children.map((c) => (
          <NavItemLink key={c.to} item={c} collapsed={collapsed} sub />
        ))}
      </div>
    </div>
  );
}
