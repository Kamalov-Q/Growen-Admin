// The one place the dashboard talks to the API.
//
// Mirrors the mobile client: bearer access token, a single-flight refresh on
// 401, and a request timeout so a server that has gone dark surfaces as an
// error instead of a spinner that never ends.
import { sessionStore, type AdminUser } from "./session";

// The server uses a global /api prefix; append it here so all requests
// automatically go to /api/... without changing any individual call site.
// VITE_API_URL should be the bare origin, e.g. https://api.growencity.uz
const _apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
/** Bare server origin — use for resolving media URLs from the CDN/static paths. */
export const API_ORIGIN = _apiBase.replace(/\/+$/, "");
/** All REST endpoints are prefixed with /api. Use this for api() calls. */
export const API_URL = API_ORIGIN + "/api";


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

/** Exported for the socket: an expired token breaks the live thread the same
 *  way it breaks a request, and it is repaired the same way. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

interface Options extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
}

/** Nest's error envelope. `message` is an array when class-validator wrote it. */
interface ErrorBody {
  message?: string | string[];
  code?: string;
}

/** A failed Response as an ApiError. Exported for the multipart uploads,
 *  which cannot go through `api()` — their body is FormData. */
export async function errorFromResponse(
  res: Response,
  fallback = "Request failed",
): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as ErrorBody;
  const message = Array.isArray(body.message) ? body.message[0] : body.message;
  return new ApiError(res.status, message ?? fallback, body.code);
}

/**
 * Sends, and on a 401 refreshes the session and sends again — the same retry
 * `api()` does for JSON requests. `send` is called afresh each time because a
 * FormData body cannot be replayed once consumed.
 */
export async function sendWithAuthRetry(
  send: () => Promise<Response>,
): Promise<Response> {
  const res = await send();
  if (res.status !== 401) return res;

  if (!(await refreshSession())) throw new ApiError(401, "Session expired");
  return send();
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

  if (!res.ok) throw await errorFromResponse(res);

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** One entry of the official SOATO classifier. */
export interface UzDistrict {
  code: string;
  uz: string;
  ru: string;
}

export interface UzRegion extends UzDistrict {
  districts: UzDistrict[];
}

export const adminApi = {
  login: (phone: string, password: string) =>
    api<SessionResponse>("/auth/phone/login", {
      method: "POST",
      auth: false,
      body: { phone, password },
    }),

  logout: () => api<void>("/auth/logout", { method: "POST" }),

  /**
   * The fourteen regions with their districts — public, and the same list
   * the app's profile uses. The map's search resolves a typed district name
   * against it before asking OSM; see lib/geosearch.ts.
   */
  regions: () => api<UzRegion[]>("/regions", { auth: false }),

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

  // ---- tariffs & top-up bonuses ------------------------------------------
  // Entirely the admin's to create, edit and delete. A tariff for one of the
  // built-in actions is charged by the server automatically; one under a
  // custom code is listed to the app but charged by nothing yet.

  tariffs: () => api<AdminTariff[]>("/admin/tariffs"),

  createTariff: (body: TariffInput & { action: string }) =>
    api<AdminTariff>("/admin/tariffs", { method: "POST", body }),

  updateTariff: (id: string, body: Partial<TariffInput>) =>
    api<AdminTariff>(`/admin/tariffs/${id}`, { method: "PATCH", body }),

  /** With no tariff left, a one-off action is free and TOP is not on sale. */
  deleteTariff: (id: string) =>
    api<{ deleted: boolean }>(`/admin/tariffs/${id}`, { method: "DELETE" }),

  bonusTiers: () => api<AdminBonusTier[]>("/admin/bonus-tiers"),

  createBonusTier: (body: { minAmount: number; percent: number }) =>
    api<AdminBonusTier>("/admin/bonus-tiers", { method: "POST", body }),

  updateBonusTier: (
    id: string,
    body: { minAmount?: number; percent?: number; isActive?: boolean },
  ) => api<AdminBonusTier>(`/admin/bonus-tiers/${id}`, { method: "PATCH", body }),

  deleteBonusTier: (id: string) =>
    api<{ deleted: boolean }>(`/admin/bonus-tiers/${id}`, { method: "DELETE" }),

  // ---- payments & wallets -------------------------------------------------

  payments: (params: {
    status?: string;
    provider?: string;
    limit?: number;
    offset?: number;
  }) => api<Page<AdminPaymentRow>>(`/admin/payments?${qs(params)}`),

  /** One payment in full, with the ledger rows it produced. */
  payment: (id: string) => api<AdminPaymentDetail>(`/admin/payments/${id}`),

  wallets: (params: { limit?: number; offset?: number }) =>
    api<Page<AdminWalletRow>>(`/admin/wallets?${qs(params)}`),

  /**
   * Every manual balance change, newest first. The totals are for the whole
   * filtered set rather than the page on screen — "how much has been handed
   * out by hand" should not change as the pager moves.
   */
  walletAdjustments: (params: {
    userId?: string;
    adminId?: string;
    direction?: "credit" | "debit";
    limit?: number;
    offset?: number;
  }) => api<AdjustmentsPage>(`/admin/wallet-adjustments?${qs(params)}`),

  /**
   * `clientId` makes the adjustment idempotent: send the same key when
   * retrying and the money moves once. `repeated` comes back true when the
   * server recognised the key and returned the earlier result.
   */
  adjustWallet: (
    userId: string,
    body: { amount: number; note: string; clientId?: string },
  ) =>
    api<{ userId: string; balance: string; repeated?: boolean }>(
      `/admin/wallets/${userId}/adjust`,
      { method: "POST", body },
    ),

  // ---- reports ------------------------------------------------------------

  reports: (params: { status?: string; limit?: number; offset?: number }) =>
    api<Page<AdminReport>>(`/admin/reports?${qs(params)}`),

  setReportStatus: (id: string, status: "OPEN" | "RESOLVED" | "DISMISSED") =>
    api<AdminReport>(`/admin/reports/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),

  // ---- verification -------------------------------------------------------
  // Deciding an application also deletes its documents on the server: the
  // review is the last moment anybody can look at them.

  verificationRequests: (params: {
    status?: string;
    limit?: number;
    offset?: number;
  }) => api<Page<AdminVerificationRequest>>(`/admin/verification-requests?${qs(params)}`),

  approveVerification: (id: string) =>
    api<{ id: string; status: "APPROVED"; userId: string }>(
      `/admin/verification-requests/${id}/approve`,
      { method: "POST" },
    ),

  /** Puts a decided one back in the queue; an approval loses its badge. */
  reopenVerification: (id: string) =>
    api<{ id: string; status: "PENDING"; userId: string }>(
      `/admin/verification-requests/${id}/reopen`,
      { method: "POST" },
    ),

  /** `reason` is delivered to the applicant as a support message, verbatim. */
  rejectVerification: (id: string, reason: string) =>
    api<{ id: string; status: "REJECTED"; userId: string }>(
      `/admin/verification-requests/${id}/reject`,
      { method: "POST", body: { reason } },
    ),

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

  // ---- videos -------------------------------------------------------------
  // Short-form video: the Videos tab in the app, and the clip that can hang
  // off a listing. Everyone can post, which is why the two pages below exist
  // rather than being a nice-to-have.

  videos: (params: {
    status?: string;
    authorId?: string;
    listingId?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) => api<Page<AdminVideo>>(`/admin/videos?${qs(params)}`),

  video: (id: string) => api<AdminVideo>(`/admin/videos/${id}`),

  /**
   * Fix a caption, or clear a wrong listing link.
   *
   * The only two things about a reel that can be WRONG rather than against
   * the rules. A clip that should not be up at all is `removeVideo`, not an
   * edit — moderation rewriting footage is not a thing, and the server will
   * not accept anything else anyway.
   */
  updateVideo: (
    id: string,
    body: { caption?: string; listingId?: string | null },
  ) => api<AdminVideo>(`/admin/videos/${id}`, { method: "PATCH", body }),

  /** Takes it out of the feed. The file is deleted at Bunny a month later. */
  removeVideo: (id: string, reason?: string) =>
    api<{ success: boolean }>(`/admin/videos/${id}`, {
      method: "DELETE",
      body: reason ? { reason } : {},
    }),

  videoReports: (params: {
    status?: string;
    videoId?: string;
    limit?: number;
    offset?: number;
  }) => api<Page<AdminVideoReport>>(`/admin/video-reports?${qs(params)}`),

  openVideoReports: () =>
    api<{ count: number }>("/admin/video-reports/open-count"),

  /**
   * Uphold or dismiss one report. `removeVideo` takes the clip down in the
   * same call — upholding a complaint and acting on it are one decision, and
   * upholding also closes the other open reports about the same video.
   */
  resolveVideoReport: (
    id: string,
    body: {
      status: "RESOLVED" | "DISMISSED";
      note?: string;
      removeVideo?: boolean;
    },
  ) =>
    api<AdminVideoReport>(`/admin/video-reports/${id}`, {
      method: "PATCH",
      body,
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

  supportSend: (id: string, payload: SupportSendPayload) =>
    api<AdminSupportMessage>(`/admin/support/${id}/messages`, {
      method: "POST",
      body: payload,
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

  updateListingImages: (id: string, images: ListingImageInput[]) =>
    api<AdminListingDetail>(`/admin/listings/${id}/images`, {
      method: "PUT",
      body: { images },
    }),

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

export interface AdminVerificationRequest {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  /** Kept after a decision; null only on applications decided before that
   *  was the rule. */
  passportFrontUrl: string | null;
  passportBackUrl: string | null;
  selfieUrl: string | null;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: {
    id: string;
    name: string | null;
    surname: string | null;
    phoneNumber: string | null;
    avatarThumbUrl: string | null;
    isVerifiedRealtor: boolean;
    createdAt: string;
  } | null;
}

/**
 * Mirrors the server's TARIFF_ACTIONS (billing.constants.ts): the actions it
 * charges for by itself.
 *
 * STORY_POST was one of these until stories came out of the product — the
 * server dropped it from this list too. A tariff still sitting in the table
 * under that code is simply not built-in any more: it shows up as a custom
 * code, which stays editable and deletable, but nothing can create a new one.
 *
 * VIDEO_POST took its place. It is charged when Bunny confirms the encoded
 * file, not when the upload starts, so the price set here is what the app
 * promises on the upload screen for a charge that happens a minute later.
 */
export const TARIFF_ACTIONS = [
  "LISTING_POST",
  "LISTING_PROMOTE",
  "VIDEO_POST",
] as const;
export const isBuiltInAction = (action: string) =>
  (TARIFF_ACTIONS as readonly string[]).includes(action);

/** The built-in action that sells time: its tariffs must carry days. */
export const isTimedAction = (action: string) => action === "LISTING_PROMOTE";

export interface AdminTariff {
  id: string;
  /** A built-in action, or a code the admin made up. */
  action: string;
  nameUz: string;
  nameRu: string;
  /** So'm, as the server's decimal string ("5000.00"). */
  price: string;
  /** Days the paid effect lasts; null for one-off actions with no duration. */
  durationDays: number | null;
  /** Off = not charged (and, for a timed action, not on sale). */
  isActive: boolean;
  updatedAt: string;
}

export interface TariffInput {
  nameUz: string;
  nameRu: string;
  price: number;
  durationDays?: number;
  isActive?: boolean;
}

export interface AdminBonusTier {
  id: string;
  /** So'm, decimal string. A top-up at or above this earns `percent`. */
  minAmount: string;
  percent: number;
  isActive: boolean;
  createdAt: string;
}

export type PaymentProvider = "CLICK" | "PAYME" | "PAYNET";
export type PaymentStatus = "CREATED" | "PREPARED" | "PAID" | "CANCELLED";
export type FiscalStatus =
  | "NONE"
  | "BY_PROVIDER"
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED";

export interface AdminPaymentRow {
  id: string;
  userId: string;
  provider: PaymentProvider;
  amount: string;
  bonusAmount: string | null;
  status: PaymentStatus;
  prepareId: string | null;
  providerTxnId: string | null;
  providerDocId: string | null;
  providerError: string | null;
  cancelReason: string | null;
  fiscalStatus: FiscalStatus;
  fiscalSentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  userName: string | null;
  userSurname: string | null;
  userPhone: string | null;
}

/** One ledger entry a payment produced. */
export interface AdminPaymentLedgerRow {
  id: string;
  kind: string;
  amount: string;
  balanceAfter: string;
  note: string | null;
  createdAt: string;
}

/**
 * Everything about one payment, fetched when the detail modal opens.
 *
 * `ledger` and `credited` are the part the list cannot answer: whether the
 * money actually reached the wallet. A PAID payment with an empty ledger is
 * the failure mode worth seeing.
 */
export interface AdminPaymentDetail extends AdminPaymentRow {
  clientId: string | null;
  providerPayload: Record<string, unknown> | null;
  providerCreateTime: string | null;
  providerPerformTime: string | null;
  providerCancelTime: string | null;
  fiscalAttempts: number;
  fiscalResponse: Record<string, unknown> | null;
  updatedAt: string;
  credited: string;
  ledger: AdminPaymentLedgerRow[];
}

export interface AdminWalletRow {
  userId: string;
  balance: string;
  updatedAt: string;
  userName: string | null;
  userSurname: string | null;
  userPhone: string | null;
}

/**
 * One manual balance change, read back out of the ledger it was written to.
 * `amount` carries the sign: positive credited the wallet, negative took it
 * back. `adminName`/`adminPhone` are null only for rows written before the
 * admin was recorded.
 */
export interface AdminAdjustmentRow {
  id: string;
  userId: string;
  adminId: string | null;
  amount: string;
  balanceAfter: string;
  note: string | null;
  clientId: string | null;
  createdAt: string;
  userName: string | null;
  userSurname: string | null;
  userPhone: string | null;
  adminName: string | null;
  adminSurname: string | null;
  adminPhone: string | null;
}

export interface AdjustmentsPage extends Page<AdminAdjustmentRow> {
  limit: number;
  offset: number;
  /** Sum of the credits in the filtered set, as a positive number. */
  credited: string;
  /** Sum of the debits, also positive — the sign lives in the label. */
  debited: string;
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
  !url ? undefined : /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `${API_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;

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
  verification?: { pending: number };
  /**
   * Optional like the rest: a dashboard pointed at a server that predates
   * video should lose these numbers, not the whole page.
   */
  videos?: {
    total: number;
    published: number;
    /** Encoded, valid, and waiting for a wallet. A pile of it is a price problem. */
    awaitingPayment: number;
    failed: number;
    newThisWeek: number;
  };
  videoReports?: { open: number };
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
  /**
   * What the user told us about themselves at registration.
   *
   * `age` is derived server-side from `birthDate` so it never goes stale.
   * These five are NOT on the public profile the app serves — moderation is
   * the case they were collected for, and this dashboard is the only place
   * they are shown.
   */
  birthDate: string | null;
  age: number | null;
  gender: "MALE" | "FEMALE" | null;
  address: string | null;
  bio: string | null;
  socialLinks: Partial<Record<SocialPlatform, string>> | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export const SOCIAL_PLATFORMS = [
  "tiktok",
  "instagram",
  "facebook",
  "x",
  "threads",
  "whatsapp",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

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
  /**
   * When the paid TOP placement runs out. Null if never promoted; a date in
   * the past means it was, and expired — worth seeing, since somebody paid
   * once and may pay again.
   */
  promotedUntil: string | null;
  offers?: { purpose: string; price: string; currency: string; isActive: boolean }[];
  owner: { id: string; name: string | null; surname: string | null; phoneNumber: string | null } | null;
}

export type OfferPurpose = "SALE" | "RENT_MONTHLY" | "RENT_DAILY";
export type SellerType = "OWNER" | "REALTOR";
export type BuildingType = "NEW" | "SECONDARY";
export type RepairType =
  | "NEEDS_REPAIR"
  | "AVERAGE"
  | "COSMETIC"
  | "EURO"
  | "DESIGNER"
  | "CAPITAL";

/** One price as PATCH /admin/listings/:id takes it. */
export interface OfferInput {
  purpose: OfferPurpose;
  price: number;
  currency: "USD" | "UZS";
}

/**
 * Everything PATCH /admin/listings/:id can change — the owner's update DTO.
 * `null` clears a field; a key left out is not touched. `offers` replaces the
 * whole price set; `coordinates` (an outline) and `point` (a pin) are
 * alternatives, never both.
 */
export interface AdminListingPatch {
  category?: string;
  title?: string | null;
  descriptionHtml?: string | null;
  sellerType?: SellerType | null;
  buildingType?: BuildingType | null;
  repairType?: RepairType | null;
  rooms?: number | null;
  areaM2?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  address?: string | null;
  contactPhone?: string | null;
  properties?: string[];
  offers?: OfferInput[];
  coordinates?: [number, number][][];
  point?: [number, number];
}

/** One photo as PUT /admin/listings/:id/images takes it. */
export interface ListingImageInput {
  url: string;
  thumbUrl: string;
  width?: number;
  height?: number;
  position: number;
  isPrimary: boolean;
}

export interface AdminListingDetail {
  id: string;
  title: string | null;
  status: string;
  category: string;
  address: string | null;
  rooms: number | null;
  sellerType: SellerType | null;
  buildingType: BuildingType | null;
  repairType: RepairType | null;
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
    width?: number | null;
    height?: number | null;
    isPrimary?: boolean;
    position?: number;
  }[];
  offers?: {
    id: string;
    purpose: OfferPurpose;
    price: string;
    currency: "USD" | "UZS";
    isActive: boolean;
  }[];
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
  /** Whether the post form asks "4 of 9 floors" for listings in it. */
  floorCapable?: boolean;
  /** Whether it asks "new build or resale". Off for land. */
  buildingTypeCapable?: boolean;
  /** Whether it asks about the state of repair. Off for land. */
  repairTypeCapable?: boolean;
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

/** Anything the desk can send: words, a photo, a file or a voice note. */
export interface SupportSendPayload {
  type?: "TEXT" | "IMAGE" | "VIDEO" | "VOICE" | "FILE";
  body?: string;
  image?: { url: string; thumbUrl: string };
  mediaUrl?: string;
  thumbUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSec?: number;
  waveform?: number[];
  replyToId?: string;
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
  /** When each side last read — what the ticks are computed from. */
  userReadAt: string | null;
  adminReadAt: string | null;
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

/** The seven states a video can be in. Only READY is public. */
export type AdminVideoStatus =
  | "UPLOADING"
  | "AWAITING_PAYMENT"
  | "READY"
  | "FAILED"
  | "EXPIRED"
  | "REMOVED";

/**
 * One row of the Videolar table.
 *
 * `hlsUrl` and `thumbUrl` come from Bunny's CDN and are null until the file
 * is playable — which is exactly how a stuck upload looks from here.
 */
export interface AdminVideo {
  id: string;
  authorId: string;
  listingId: string | null;
  status: AdminVideoStatus;
  failReason: string | null;
  caption: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hlsUrl: string | null;
  thumbUrl: string | null;
  /** Bunny's iframe player — what the drawer below plays the clip in. */
  embedUrl: string | null;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  likedByMe: boolean;
  publishedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    surname: string | null;
    avatarThumbUrl: string | null;
    isVerifiedRealtor: boolean;
  } | null;
  listing: {
    id: string;
    title: string | null;
    thumbUrl: string | null;
    price: string | null;
    currency: string | null;
    purpose: string | null;
  } | null;
}

export interface AdminVideoReport {
  id: string;
  reason: string;
  comment: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  resolutionNote: string | null;
  createdAt: string;
  video: {
    id: string;
    authorId: string | null;
    caption: string | null;
    status: AdminVideoStatus | null;
    listingId: string | null;
  };
  reporter: {
    id: string;
    name: string | null;
    surname: string | null;
    phoneNumber: string | null;
  } | null;
}
