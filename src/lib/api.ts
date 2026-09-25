// The one place the dashboard talks to the API.
//
// Mirrors the mobile client: bearer access token, a single-flight refresh on
// 401, and a request timeout so a server that has gone dark surfaces as an
// error instead of a spinner that never ends.
import { sessionStore, type AdminUser } from "./session";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  // Plain fields, not constructor parameter properties: this project compiles
  // with `erasableSyntaxOnly`, which allows only type syntax TypeScript can
  // strip without emitting code.
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: abort.signal });
  } catch (e) {
    if (abort.signal.aborted) throw new ApiError(0, "Server is not responding");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// The backend rotates refresh tokens and revokes the whole family if one is
// replayed, so two parallel refreshes would sign the admin out. Exactly one
// runs; everything else waits for it.
let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const current = sessionStore.get();
  if (!current) return false;
  try {
    const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!res.ok) {
      // The server answered and refused: this session really is over.
      sessionStore.clear();
      return false;
    }
    const data = (await res.json()) as SessionResponse;
    sessionStore.save(data);
    return true;
  } catch {
    // Never reached the server: keep the stored token and let the caller fail
    // with a network error rather than bouncing the admin to the login page.
    return false;
  }
}

function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

interface Options extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;

  const build = (): RequestInit => ({
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(auth && sessionStore.getAccessToken()
        ? { Authorization: `Bearer ${sessionStore.getAccessToken()}` }
        : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let res = await fetchWithTimeout(`${API_URL}${path}`, build());

  if (res.status === 401 && auth) {
    if (!(await refreshSession())) throw new ApiError(401, "Session expired");
    res = await fetchWithTimeout(`${API_URL}${path}`, build());
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
      code?: string;
    };
    throw new ApiError(
      res.status,
      Array.isArray(err.message) ? err.message[0] : (err.message ?? "Request failed"),
      err.code,
    );
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const adminApi = {
  login: (phone: string, password: string) =>
    api<SessionResponse>("/auth/phone/login", {
      method: "POST",
      auth: false,
      body: { phone, password },
    }),

  logout: () => api<void>("/auth/logout", { method: "POST" }),

  overview: () => api<Overview>("/admin/overview"),

  users: (params: { q?: string; limit?: number; offset?: number }) =>
    api<Page<AdminUserRow>>(`/admin/users?${qs(params)}`),

  listings: (params: {
    q?: string;
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) =>
    api<Page<AdminListingRow> & { byCategory?: CategoryCounts }>(
      `/admin/listings?${qs(params)}`,
    ),

  // ---- categories ---------------------------------------------------------

  categories: () => api<AdminCategory[]>("/admin/categories"),

  createCategory: (body: CategoryInput & { slug: string }) =>
    api<AdminCategory>("/admin/categories", { method: "POST", body }),

  updateCategory: (slug: string, body: Partial<CategoryInput>) =>
    api<AdminCategory>(`/admin/categories/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body,
    }),

  /** `moveTo` is required by the server when any listing uses the category. */
  deleteCategory: (slug: string, moveTo?: string) =>
    api<{ deleted: string; moved: number; moveTo: string | null }>(
      `/admin/categories/${encodeURIComponent(slug)}${
        moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ""
      }`,
      { method: "DELETE" },
    ),

  // ---- amenities ----------------------------------------------------------

  amenities: () => api<AdminAmenity[]>("/admin/amenities"),

  createAmenity: (body: AmenityInput & { key: string }) =>
    api<AdminAmenity>("/admin/amenities", { method: "POST", body }),

  updateAmenity: (key: string, body: Partial<AmenityInput>) =>
    api<AdminAmenity>(`/admin/amenities/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body,
    }),

  /** Deleting also strips the key from every listing that picked it. */
  deleteAmenity: (key: string) =>
    api<{ deleted: string; strippedFrom: number }>(
      `/admin/amenities/${encodeURIComponent(key)}`,
      { method: "DELETE" },
    ),

  // ---- reports ------------------------------------------------------------

  reports: (params: { status?: string; limit?: number; offset?: number }) =>
    api<Page<AdminReport>>(`/admin/reports?${qs(params)}`),

  setReportStatus: (id: string, status: "OPEN" | "RESOLVED" | "DISMISSED") =>
    api<AdminReport>(`/admin/reports/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  // ---- chat reports -------------------------------------------------------
  // A reported conversation is the ONLY chat an admin can open: the API has no
  // endpoint that takes a conversation id, so unreported chats stay private.

  chatReports: (params: { status?: string; limit?: number; offset?: number }) =>
    api<Page<AdminChatReport>>(`/admin/chat-reports?${qs(params)}`),

  chatReport: (id: string) => api<AdminChatReportDetail>(`/admin/chat-reports/${id}`),

  setChatReportStatus: (id: string, status: "OPEN" | "RESOLVED" | "DISMISSED") =>
    api<AdminChatReport>(`/admin/chat-reports/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  // ---- reviews ------------------------------------------------------------

  reviews: ({
    withText,
    ...params
  }: {
    limit?: number;
    offset?: number;
    maxRating?: number;
    withText?: boolean;
  }) =>
    api<Page<AdminReview>>(
      // The flag only exists when it is on: `withText=false` would still
      // reach the server as a string, and `qs` drops undefined for us.
      `/admin/reviews?${qs({ ...params, withText: withText ? "true" : undefined })}`,
    ),

  /** For abuse, not for opinions — the listing's average is recomputed. */
  deleteReview: (id: string) =>
    api<{ success: boolean }>(`/admin/reviews/${id}`, { method: "DELETE" }),

  user: (id: string) => api<AdminUserDetail>(`/admin/users/${id}`),

  system: () => api<AdminSystem>("/admin/system"),

  // ---- support ------------------------------------------------------------

  supportThreads: (params: {
    status?: string;
    limit?: number;
    offset?: number;
  }) => api<Page<AdminSupportThread>>(`/admin/support?${qs(params)}`),

  /** Their thread, created if they have never written. */
  supportThreadByUser: (userId: string) =>
    api<AdminSupportThread>(`/admin/support/by-user/${userId}`, {
      method: "POST",
    }),

  supportThread: (id: string) =>
    api<AdminSupportThreadDetail>(`/admin/support/${id}`),

  supportSend: (
    id: string,
    body: string,
    opts?: { image?: { url: string; thumbUrl: string }; replyToId?: string },
  ) =>
    api<AdminSupportMessage>(`/admin/support/${id}/messages`, {
      method: "POST",
      body: {
        ...(body ? { body } : {}),
        ...(opts?.image ? { image: opts.image } : {}),
        ...(opts?.replyToId ? { replyToId: opts.replyToId } : {}),
      },
    }),

  supportSetStatus: (id: string, status: "OPEN" | "CLOSED") =>
    api<AdminSupportThread>(`/admin/support/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  /** `messageId: null` clears it. The same pin the customer sees. */
  supportPin: (id: string, messageId: string | null) =>
    api<AdminSupportThread>(`/admin/support/${id}/pin`, {
      method: "POST",
      body: { messageId },
    }),

  supportMarkRead: (id: string) =>
    api<{ success: boolean }>(`/admin/support/${id}/read`, { method: "POST" }),

  supportWaiting: () => api<{ waiting: number }>("/admin/support/waiting"),

  // ---- comments -----------------------------------------------------------

  comments: (params: { limit?: number; offset?: number }) =>
    api<Page<AdminComment>>(`/admin/comments?${qs(params)}`),

  comment: (id: string) => api<AdminCommentDetail>(`/admin/comments/${id}`),

  /** Takes the comment's replies with it. */
  deleteComment: (id: string) =>
    api<{ success: boolean }>(`/admin/comments/${id}`, { method: "DELETE" }),

  // ---- moderation ---------------------------------------------------------

  setUserStatus: (id: string, body: { status: "ACTIVE" | "BANNED"; banReason?: string }) =>
    api<AdminUserRow>(`/admin/users/${id}/status`, { method: "PATCH", body }),

  setUserRole: (id: string, body: { role: "USER" | "ADMIN" }) =>
    api<AdminUserRow>(`/admin/users/${id}/role`, { method: "PATCH", body }),

  listing: (id: string) => api<AdminListingDetail>(`/admin/listings/${id}`),

  updateListing: (id: string, body: AdminListingPatch) =>
    api<AdminListingDetail>(`/admin/listings/${id}`, { method: "PATCH", body }),

  setListingStatus: (id: string, status: "ACTIVE" | "ARCHIVED") =>
    api<AdminListingDetail>(`/admin/listings/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),
};

export interface AdminReport {
  id: string;
  reason: string;
  comment: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  listing: {
    id: string;
    title: string | null;
    status: string | null;
    address: string | null;
  };
  reporter: {
    id: string;
    name: string | null;
    surname: string | null;
    phoneNumber: string | null;
  } | null;
}

export interface AmenityInput {
  nameUz: string;
  nameRu: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface AdminAmenity {
  key: string;
  nameUz: string;
  nameRu: string;
  sortOrder: number;
  isActive: boolean;
  listingCount: number;
}

/** API-relative media paths (avatars, listing photos) need the origin back. */
export const resolveMediaUrl = (url: string | null | undefined) =>
  !url ? undefined : /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;

const qs = (params: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      v === undefined || v === "" ? [] : [[k, String(v)]],
    ),
  ).toString();

/** Listings per category; a category with none is simply absent (read as 0). */
export type CategoryCounts = Partial<Record<string, number>>;

export interface Overview {
  users: { total: number; admins: number; newThisWeek: number };
  listings: {
    total: number;
    active: number;
    archived: number;
    newThisWeek: number;
    byCategory?: CategoryCounts;
  };
  reports?: { open: number };
  chatReports?: { open: number };
}

export interface Page<T> {
  total: number;
  items: T[];
}

export interface AdminUserRow {
  id: string;
  name: string | null;
  surname: string | null;
  phoneNumber: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: "USER" | "ADMIN";
  status: string;
  isVerifiedRealtor: boolean;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AdminListingRow {
  id: string;
  thumbUrl: string | null;
  title: string | null;
  status: string;
  category: string;
  address: string | null;
  rooms: number | null;
  areaM2: string | null;
  createdAt: string;
  /** Denormalized from the reviews; null until somebody rates it. */
  ratingAvg: number | null;
  ratingCount: number;
  /** Distinct viewers — one per person, not per page open. */
  viewCount: number;
  offers?: { purpose: string; price: string; currency: string; isActive: boolean }[];
  owner: { id: string; name: string | null; surname: string | null; phoneNumber: string | null } | null;
}

/** The fields the drawer's edit form is allowed to change. */
export interface AdminListingPatch {
  title?: string;
  address?: string;
  rooms?: number;
  floor?: number;
  totalFloors?: number;
  contactPhone?: string;
  areaM2?: number;
}

export interface AdminListingDetail {
  id: string;
  title: string | null;
  status: string;
  category: string;
  address: string | null;
  rooms: number | null;
  areaM2: string | null;
  floor: number | null;
  totalFloors: number | null;
  contactPhone: string | null;
  descriptionText?: string | null;
  descriptionHtml?: string | null;
  /** Amenity keys (REPAIRED, AC, …). */
  properties?: string[] | null;
  /** Boundary listings: the drawn outline, GeoJSON [lng, lat]. */
  geom?: { type: "Polygon"; coordinates: [number, number][][] } | null;
  /** Always set once located: the pin, or the boundary's centre. [lng, lat]. */
  centroid?: { type: "Point"; coordinates: [number, number] } | null;
  createdAt: string;
  updatedAt?: string;
  publishedAt: string | null;
  ratingAvg?: number | null;
  ratingCount?: number;
  viewCount?: number;
  images?: {
    id: string;
    url: string;
    thumbUrl: string | null;
    isPrimary?: boolean;
    position?: number;
  }[];
  offers?: { id: string; purpose: string; price: string; currency: string; isActive: boolean }[];
  owner: { id: string; name: string | null; surname: string | null; phoneNumber: string | null } | null;
}

/** Must match CATEGORY_ICON_KEYS on the server and the app's icon map. */
export const CATEGORY_ICON_KEYS = [
  "apartment",
  "house",
  "land",
  "shop",
  "building",
  "dacha",
  "hotel",
  "office",
  "warehouse",
  "garage",
  "farm",
  "grid",
] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export interface CategoryInput {
  nameUz: string;
  nameRu: string;
  icon: CategoryIconKey;
  sortOrder?: number;
  isActive?: boolean;
  floorCapable?: boolean;
}

export interface AdminCategory extends Required<CategoryInput> {
  slug: string;
  createdAt: string;
  updatedAt: string;
  listingCount: number;
}

export interface ChatPerson {
  id: string;
  name: string | null;
  surname: string | null;
  phoneNumber: string | null;
}

export interface AdminChatReport {
  id: string;
  reason: string;
  comment: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  createdAt: string;
  reporter: ChatPerson | null;
  conversation: {
    id: string;
    lastMessageAt: string | null;
    host: ChatPerson | null;
    guest: ChatPerson | null;
    listing: { id: string; title: string | null; status: string } | null;
  } | null;
}

/** One person's whole record, as the profile drawer shows it. */
export interface AdminUserDetail extends AdminUserRow {
  lastSeenAt: string | null;
  listings: {
    total: number;
    active: number;
    draft: number;
    archived: number;
    /** Distinct viewers across everything they have posted. */
    views: number;
  };
  reviewsWritten: { count: number; average: number | null };
  commentsWritten: number;
  /** Reports about their listings, and reports they filed about others. */
  reports: { against: number; filed: number };
  identities: { provider: string; linkedAt: string }[];
}

export interface AdminSystem {
  usdToUzs: number;
  /** Null until the first successful fetch after the API booted. */
  rateUpdatedAt: string | null;
  /** Null when the provider could not be reached — `smsError` says why. */
  smsBalance: number | null;
  smsError: string | null;
  serverTime: string;
}

export interface AdminSupportMessage {
  id: string;
  threadId: string;
  senderId: string;
  /** Which side wrote it — the only thing bubble alignment depends on. */
  fromAdmin: boolean;
  /** TEXT, IMAGE, VOICE, VIDEO, VIDEO_NOTE or FILE. */
  type: string;
  body: string;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  /** Non-image attachments, which arrive here by forwarding from a chat. */
  mediaUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  durationSec: number | null;
  /** 0–100 amplitude bars, so a forwarded voice note draws its real shape. */
  waveform: number[] | null;
  /** Whose words these originally were, on a forwarded message. */
  forwardedFromName: string | null;
  forwardedFromUserId: string | null;
  /** The message this answers, within the same thread. */
  replyToId: string | null;
  createdAt: string;
}

export interface AdminSupportThread {
  id: string;
  userId: string;
  status: "OPEN" | "CLOSED";
  lastMessageAt: string | null;
  userUnread: number;
  /** Messages the desk has not read — what the queue sorts on. */
  adminUnread: number;
  /** The message kept at the top, shared with the customer. */
  pinnedMessageId: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    surname: string | null;
    phoneNumber: string | null;
    avatarThumbUrl: string | null;
  } | null;
  /** The last line said, for the queue row. */
  lastMessage?: string | null;
}

export interface AdminSupportThreadDetail extends AdminSupportThread {
  messages: AdminSupportMessage[];
}

export interface AdminReview {
  id: string;
  authorId: string;
  /** 1–5. */
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  /** Null when the account has since been deleted. */
  author: {
    id: string;
    name: string | null;
    surname: string | null;
    avatarThumbUrl: string | null;
  } | null;
  listingId: string;
  listingTitle: string | null;
}

export interface AdminComment {
  id: string;
  authorId: string;
  body: string;
  /** Comments can be a photo with no words at all. */
  imageUrl: string | null;
  imageThumbUrl: string | null;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  /** Null when the account has since been deleted. */
  author: {
    id: string;
    name: string | null;
    surname: string | null;
    avatarThumbUrl: string | null;
  } | null;
  listingId: string;
  listingTitle: string | null;
  /** A reply rather than a top-level comment. */
  isReply: boolean;
}

/** One row of the exchange a comment belongs to. */
export interface AdminThreadComment extends Omit<AdminComment, "listingId" | "listingTitle"> {
  /** The row the moderator clicked, so the drawer can point at it. */
  isSelected: boolean;
}

export interface AdminCommentDetail extends AdminComment {
  /** Root first, then its replies in order. */
  thread: AdminThreadComment[];
  /** Up to 20 of the people who liked it, most recent first. */
  likedBy: {
    id: string;
    name: string | null;
    surname: string | null;
    avatarThumbUrl: string | null;
  }[];
  listing: { id: string; title: string | null; thumbUrl: string | null } | null;
}

export interface AdminChatMessage {
  id: string;
  senderId: string;
  type: "TEXT" | "IMAGE" | "VOICE" | "FILE" | string;
  /** Null for a deleted message — its place is kept, its text is not. */
  body: string | null;
  mediaUrl: string | null;
  thumbUrl: string | null;
  fileName: string | null;
  durationSec: number | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface AdminChatReportDetail extends AdminChatReport {
  /** Oldest first. */
  messages: AdminChatMessage[];
  /** The message the report was sent from, when it came from one. */
  reportedMessageId: string | null;
  /** True when older messages were cut off (the newest 300 are returned). */
  truncated: boolean;
}
