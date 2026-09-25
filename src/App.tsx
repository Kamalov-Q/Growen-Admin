import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./lib/api";
import { useSession } from "./lib/session";
import { LoginPage } from "./features/auth/LoginPage";
import { Layout } from "./components/Layout";
import { OverviewPage } from "./pages/OverviewPage";
import { UsersPage } from "./pages/UsersPage";
import { ListingsPage } from "./pages/ListingsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { ChatReportsPage } from "./pages/ChatReportsPage";
import { AmenitiesPage } from "./pages/AmenitiesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { CommentsPage } from "./pages/CommentsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SupportPage } from "./pages/SupportPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retrying a 401/403 only repeats the refusal: the api client already
      // tried one token refresh before the error got here.
      retry: (count, error) =>
        error instanceof ApiError && (error.status === 401 || error.status === 403)
          ? false
          : count < 2,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicOnly />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<OverviewPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="listings" element={<ListingsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="chat-reports" element={<ChatReportsPage />} />
              <Route path="amenities" element={<AmenitiesPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="reviews" element={<ReviewsPage />} />
              <Route path="comments" element={<CommentsPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

/**
 * The gate is the stored session, not a permission check: the real check is
 * the server's, on every admin request. This only decides which screen to
 * show, and a session that is no longer an admin lands on a 403 the pages
 * explain rather than a blank dashboard.
 */
function RequireAuth() {
  const session = useSession();
  // Outlet, not <Layout/>: the route tree below already nests the layout, and
  // returning it here would render the sidebar twice.
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicOnly() {
  const session = useSession();
  return session ? <Navigate to="/" replace /> : <LoginPage />;
}
