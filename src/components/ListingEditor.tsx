import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  resolveMediaUrl,
  type AdminListingDetail,
  type AdminListingPatch,
  type BuildingType,
  type ListingImageInput,
  type OfferPurpose,
  type RepairType,
  type SellerType,
} from "../lib/api";
import { date, fullName, money } from "../lib/format";
import { useCategories } from "../lib/useCategories";
import { toast } from "../lib/toast";
import { confirmDialog } from "../lib/confirm";
import { useT } from "../lib/i18n";
import { uploadListingPhotos } from "../lib/upload";
import {
  closeRing,
  locationFromListing,
  ringAreaM2,
  ringCenter,
  sameLocation,
  type MapLocation,
} from "../lib/geo";
import { Avatar, Badge, ErrorState, Skeleton } from "./ui";
import { PhotoSwiper } from "./PhotoSwiper";
import { Lightbox } from "./Lightbox";

// MapLibre is most of a megabyte; fetched the first time a listing opens, not
// with the rest of the dashboard.
const LazyMap = lazy(() => import("./ListingMap").then((m) => ({ default: m.ListingMap })));
type MapProps = Parameters<typeof LazyMap>[0];
function ListingMap(props: MapProps & { height?: number }) {
  return (
    <Suspense fallback={<div className="map__canvas map__canvas--loading" style={{ height: props.height ?? 320 }} />}>
      <LazyMap {...props} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Faol",
  DRAFT: "Qoralama",
  ARCHIVED: "Arxiv",
};
const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
};

const PURPOSES: { key: OfferPurpose; label: string; period: string }[] = [
  { key: "SALE", label: "Sotuv", period: "" },
  { key: "RENT_MONTHLY", label: "Oylik ijara", period: "oyiga" },
  { key: "RENT_DAILY", label: "Kunlik ijara", period: "kuniga" },
];

const REPAIR_OPTIONS: { key: RepairType; label: string }[] = [
  { key: "NEEDS_REPAIR", label: "Remont talab" },
  { key: "AVERAGE", label: "O'rtacha" },
  { key: "COSMETIC", label: "Kosmetik" },
  { key: "EURO", label: "Yevroremont" },
  { key: "DESIGNER", label: "Dizaynerlik" },
  { key: "CAPITAL", label: "Kapital ta'mir" },
];

/** Same limits as the server: 30 photos of up to 10 MB each. */
const MAX_PHOTOS = 30;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type Tab = "overview" | "details" | "prices" | "amenities" | "photos" | "location";

// ---------------------------------------------------------------------------
// The draft: everything editable, as the form holds it
// ---------------------------------------------------------------------------

interface OfferDraft {
  enabled: boolean;
  price: string;
  currency: "USD" | "UZS";
}

interface Photo {
  /** The URL is the identity — it is what the server matches on. */
  url: string;
  thumbUrl: string;
  width?: number;
  height?: number;
}

interface Draft {
  category: string;
  title: string;
  description: string;
  sellerType: SellerType | "";
  buildingType: BuildingType | "";
  repairType: RepairType | "";
  rooms: string;
  areaM2: string;
  floor: string;
  totalFloors: string;
  address: string;
  contactPhone: string;
  properties: string[];
  offers: Record<OfferPurpose, OfferDraft>;
  location: MapLocation;
  /** In display order; the first one is the cover. */
  photos: Photo[];
}

const num = (v: number | string | null | undefined) =>
  v == null || v === "" ? "" : String(Number(v));

function draftFrom(l: AdminListingDetail): Draft {
  const offers = Object.fromEntries(
    PURPOSES.map(({ key }) => {
      const o = l.offers?.find((x) => x.purpose === key && x.isActive);
      return [
        key,
        {
          enabled: !!o,
          price: o ? num(o.price) : "",
          currency: o?.currency ?? "USD",
        },
      ];
    }),
  ) as Record<OfferPurpose, OfferDraft>;

  // Cover first, then the owner's order — how the app shows them.
  const photos = [...(l.images ?? [])]
    .sort(
      (a, b) =>
        Number(b.isPrimary ?? false) - Number(a.isPrimary ?? false) ||
        (a.position ?? 0) - (b.position ?? 0),
    )
    .map((i) => ({
      url: i.url,
      thumbUrl: i.thumbUrl ?? i.url,
      width: i.width ?? undefined,
      height: i.height ?? undefined,
    }));

  return {
    category: l.category,
    title: l.title ?? "",
    description: l.descriptionText?.trim() ?? "",
    sellerType: l.sellerType ?? "",
    buildingType: l.buildingType ?? "",
    repairType: l.repairType ?? "",
    rooms: num(l.rooms),
    areaM2: num(l.areaM2),
    floor: num(l.floor),
    totalFloors: num(l.totalFloors),
    address: l.address ?? "",
    contactPhone: l.contactPhone ?? "",
    properties: [...(l.properties ?? [])],
    offers,
    location: locationFromListing(l),
    photos,
  };
}

/** The description is plain text here; the column is HTML. Escaped, so a
 *  typed "<" stays a character — the same conversion the app does. */
function textToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => `<p>${b.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const cleanPhone = (s: string) => s.replace(/[\s()-]/g, "");
const sameList = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

interface CategoryRules {
  floors: boolean;
  building: boolean;
  repair: boolean;
}

type Errors = Partial<Record<string, string>>;

/** The server's DTO rules, mirrored so mistakes show before the request. */
function validate(d: Draft, base: Draft, rules: CategoryRules): Errors {
  const e: Errors = {};
  const intIn = (s: string, min: number, max: number) => {
    if (s.trim() === "") return null;
    const n = Number(s);
    return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
  };

  if (!d.category) e.category = "Kategoriyani tanlang";
  if (d.title.trim().length > 160) e.title = "Ko'pi bilan 160 ta belgi";
  if (d.address.trim().length > 500) e.address = "Ko'pi bilan 500 ta belgi";
  if (d.description.length > 5000) e.description = "Ko'pi bilan 5000 ta belgi";

  if (Number.isNaN(intIn(d.rooms, 0, 1000))) e.rooms = "0 dan katta butun son";
  if (d.areaM2.trim() !== "") {
    const a = Number(d.areaM2);
    if (!Number.isFinite(a) || a < 0) e.areaM2 = "0 dan katta son";
  }
  if (rules.floors) {
    const floor = intIn(d.floor, -10, 200);
    const total = intIn(d.totalFloors, 1, 200);
    if (Number.isNaN(floor)) e.floor = "-10 dan 200 gacha butun son";
    if (Number.isNaN(total)) e.totalFloors = "1 dan 200 gacha butun son";
    if (typeof floor === "number" && typeof total === "number" && !Number.isNaN(floor) && !Number.isNaN(total) && floor > total) {
      e.floor = "Qavat qavatlar sonidan katta bo'lmasin";
    }
  }

  // Checked only once edited: the app stores numbers as 998901234567 and
  // older listings may hold other shapes; neither should block other edits.
  const phone = cleanPhone(d.contactPhone);
  if (
    phone &&
    phone !== cleanPhone(base.contactPhone) &&
    !/^\+?998\d{9}$/.test(phone)
  ) {
    e.contactPhone = "+998 va 9 ta raqam: +998901234567";
  }

  const enabled = PURPOSES.filter((p) => d.offers[p.key].enabled);
  if (!enabled.length) e.offers = "Kamida bitta narx kerak";
  for (const p of enabled) {
    const v = d.offers[p.key].price.trim();
    const n = Number(v);
    if (!v || !Number.isFinite(n) || n <= 0) e[`offer.${p.key}`] = "Narxni kiriting";
  }

  if (d.location.kind === "none") e.location = "Joylashuvni belgilang";
  if (d.location.kind === "polygon" && d.location.ring.length < 3) {
    e.location = "Chegara uchun kamida 3 ta nuqta kerak";
  }
  return e;
}

/** Which tab each error lives on, so the tab can wear a red dot. */
const errorTab = (key: string): Tab =>
  key.startsWith("offer") ? "prices" : key === "location" ? "location" : "details";

/** Only what changed, so an edit never overwrites a field nobody touched. */
function buildPatch(d: Draft, base: Draft, rules: CategoryRules): AdminListingPatch {
  const p: AdminListingPatch = {};
  const text = (v: string) => v.trim() || null;
  const n = (v: string) => (v.trim() === "" ? null : Number(v));

  if (d.category !== base.category) p.category = d.category;
  if (d.title.trim() !== base.title.trim()) p.title = text(d.title);
  if (d.description.trim() !== base.description.trim()) {
    p.descriptionHtml = d.description.trim() ? textToHtml(d.description.trim()) : null;
  }
  if (d.sellerType !== base.sellerType) p.sellerType = d.sellerType || null;

  // Answers the new category does not ask are cleared only when the admin
  // moves the listing into it. Old listings can carry such leftovers (a land
  // plot with a repair type); opening one must not count as an edit.
  const recategorised = d.category !== base.category;
  const buildingType = rules.building || !recategorised ? d.buildingType : "";
  if (buildingType !== base.buildingType) p.buildingType = buildingType || null;
  const repairType = rules.repair || !recategorised ? d.repairType : "";
  if (repairType !== base.repairType) p.repairType = repairType || null;

  if (d.rooms !== base.rooms) p.rooms = n(d.rooms);
  if (d.areaM2 !== base.areaM2) p.areaM2 = n(d.areaM2);
  // A category without floors has them cleared by the server itself.
  if (rules.floors) {
    if (d.floor !== base.floor) p.floor = n(d.floor);
    if (d.totalFloors !== base.totalFloors) p.totalFloors = n(d.totalFloors);
  }
  if (d.address.trim() !== base.address.trim()) p.address = text(d.address);
  if (cleanPhone(d.contactPhone) !== cleanPhone(base.contactPhone)) {
    p.contactPhone = cleanPhone(d.contactPhone) || null;
  }
  if (!sameSet(d.properties, base.properties)) p.properties = d.properties;

  const offersChanged = PURPOSES.some(({ key }) => {
    const a = d.offers[key];
    const b = base.offers[key];
    return (
      a.enabled !== b.enabled ||
      (a.enabled && (Number(a.price) !== Number(b.price) || a.currency !== b.currency))
    );
  });
  if (offersChanged) {
    p.offers = PURPOSES.filter(({ key }) => d.offers[key].enabled).map(({ key }) => ({
      purpose: key,
      price: Number(d.offers[key].price),
      currency: d.offers[key].currency,
    }));
  }

  if (!sameLocation(d.location, base.location)) {
    if (d.location.kind === "polygon") p.coordinates = [closeRing(d.location.ring)];
    else if (d.location.kind === "point") p.point = d.location.point;
  }
  return p;
}

const photosChanged = (d: Draft, base: Draft) =>
  !sameList(
    d.photos.map((x) => x.url),
    base.photos.map((x) => x.url),
  );

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

/**
 * Everything about one listing, editable: the details, prices, amenities,
 * photos and the location (MapLibre, satellite by default). One Save sends
 * only what changed — fields through PATCH, photos through PUT.
 *
 * Opened from every page that shows a listing: listings, reports, reviews
 * and comments.
 */
export function ListingEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const t = useT();
  const { categories, bySlug, nameOf } = useCategories();
  const [tab, setTab] = useState<Tab>("overview");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<Draft | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin", "listing", id],
    queryFn: () => adminApi.listing(id!),
    enabled: !!id,
  });

  const amenities = useQuery({
    queryKey: ["admin", "amenities"],
    queryFn: adminApi.amenities,
    staleTime: 60_000,
    enabled: !!id,
  });

  // Re-seed whenever a new copy arrives (another listing, or the copy saved).
  // During render, React's pattern for state derived from props.
  const [seededFrom, setSeededFrom] = useState<AdminListingDetail | null>(null);
  if (data && data !== seededFrom) {
    setSeededFrom(data);
    const fresh = draftFrom(data);
    setDraft(fresh);
    setBase(fresh);
    setShowErrors(false);
  }

  // A different listing opens on its overview.
  const [openedId, setOpenedId] = useState(id);
  if (id !== openedId) {
    setOpenedId(id);
    setTab("overview");
  }

  const category = draft ? bySlug.get(draft.category) : undefined;
  const rules: CategoryRules = {
    floors: category?.floorCapable ?? false,
    building: category?.buildingTypeCapable ?? false,
    repair: category?.repairTypeCapable ?? false,
  };

  const errors = draft && base ? validate(draft, base, rules) : {};
  const errorTabs = new Set(Object.keys(errors).map(errorTab));
  const patch = draft && base ? buildPatch(draft, base, rules) : {};
  const changedPhotos = draft && base ? photosChanged(draft, base) : false;
  const changeCount = Object.keys(patch).length + (changedPhotos ? 1 : 0);
  const dirty = changeCount > 0;

  const dirtyTabs = new Set<Tab>();
  for (const key of Object.keys(patch)) {
    if (key === "offers") dirtyTabs.add("prices");
    else if (key === "properties") dirtyTabs.add("amenities");
    else if (key === "coordinates" || key === "point") dirtyTabs.add("location");
    else dirtyTabs.add("details");
  }
  if (changedPhotos) dirtyTabs.add("photos");

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = useMutation({
    mutationFn: async () => {
      if (!draft || !id) return;
      // Photos first: a field error then leaves the photo edit saved rather
      // than both lost, and the PATCH answer is the freshest copy.
      if (changedPhotos) {
        const images: ListingImageInput[] = draft.photos.map((p, i) => ({
          url: p.url,
          thumbUrl: p.thumbUrl,
          ...(p.width ? { width: p.width } : {}),
          ...(p.height ? { height: p.height } : {}),
          position: i,
          isPrimary: i === 0,
        }));
        await adminApi.updateListingImages(id, images);
      }
      if (Object.keys(patch).length) await adminApi.updateListing(id, patch);
    },
    onSuccess: () => {
      toast.success(t("Saqlandi"));
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  const setStatus = useMutation({
    mutationFn: (status: "ACTIVE" | "ARCHIVED") => adminApi.setListingStatus(id!, status),
    onSuccess: (_d, status) => {
      toast.success(status === "ARCHIVED" ? t("E'lon arxivlandi") : t("E'lon faollashtirildi"));
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e),
  });

  const onSave = () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      const first = Object.keys(errors)[0];
      setTab(errorTab(first));
      toast.error(t(errors[first]!));
      return;
    }
    save.mutate();
  };

  const requestClose = async () => {
    if (dirty && !save.isPending) {
      const ok = await confirmDialog({
        title: t("Saqlanmagan o'zgarishlar"),
        message: t("Yopsangiz, kiritilgan o'zgarishlar yo'qoladi."),
        confirmLabel: t("Yopish"),
        cancelLabel: t("Qolish"),
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const archive = async () => {
    const ok = await confirmDialog({
      title: t("E'lonni arxivlash"),
      message: t(
        "E'lon xaritadan va lentadan olib tashlanadi. Yozuv saqlanib qoladi va keyinroq faollashtirish mumkin.",
      ),
      confirmLabel: t("Arxivlash"),
      destructive: true,
    });
    if (ok) setStatus.mutate("ARCHIVED");
  };

  // Escape closes (through the unsaved-changes check); Ctrl/Cmd+S saves.
  const closeRef = useRef(requestClose);
  const saveRef = useRef(onSave);
  useEffect(() => {
    closeRef.current = requestClose;
    saveRef.current = onSave;
  });
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".confirm, .lightbox")) {
        void closeRef.current();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  if (!id) return null;

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "overview", label: t("Umumiy"), icon: <IconEye /> },
    { key: "details", label: t("Ma'lumotlar"), icon: <IconForm /> },
    { key: "prices", label: t("Narxlar"), icon: <IconTag /> },
    { key: "amenities", label: t("Qulayliklar"), icon: <IconCheck /> },
    { key: "photos", label: t("Rasmlar"), icon: <IconPhoto /> },
    { key: "location", label: t("Joylashuv"), icon: <IconPin /> },
  ];

  const err = (key: string) => (showErrors && errors[key] ? t(errors[key]!) : null);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && void requestClose()}
    >
      <div className="editor card" role="dialog" aria-modal="true" aria-label={data?.title ?? t("E'lon")}>
        {/* ---- header ---- */}
        <header className="editor__head">
          <div className="editor__cover">
            {draft?.photos[0] ? (
              <img src={resolveMediaUrl(draft.photos[0].thumbUrl)} alt="" />
            ) : (
              <IconPhoto />
            )}
          </div>
          <div className="editor__headings">
            <h2 className="editor__title">
              {data ? data.title || t("Sarlavhasiz e'lon") : t("E'lon")}
            </h2>
            {data ? (
              <div className="editor__meta">
                <Badge tone={STATUS_TONE[data.status] ?? "neutral"}>
                  {t(STATUS_LABEL[data.status] ?? data.status)}
                </Badge>
                <span>{nameOf(data.category)}</span>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  className="editor__id"
                  title={t("ID nusxalash")}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(data.id)
                      .then(() => toast.success(t("ID nusxalandi")))
                  }
                >
                  #{data.id.slice(0, 8)} ⧉
                </button>
              </div>
            ) : null}
          </div>
          <button className="icon-btn" onClick={() => void requestClose()} aria-label={t("Yopish")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="editor__main">
          {/* ---- tabs ---- */}
          <nav className="editor__tabs" aria-label={t("Bo'limlar")}>
            {tabs.map((x) => (
              <button
                key={x.key}
                type="button"
                className={`editor__tab${tab === x.key ? " editor__tab--active" : ""}`}
                onClick={() => setTab(x.key)}
                disabled={!draft}
              >
                {x.icon}
                <span>{x.label}</span>
                {showErrors && errorTabs.has(x.key) ? (
                  <span className="editor__dot editor__dot--error" title={t("Xato bor")} />
                ) : dirtyTabs.has(x.key) ? (
                  <span className="editor__dot" title={t("O'zgartirilgan")} />
                ) : null}
              </button>
            ))}
          </nav>

          {/* ---- body ---- */}
          <div className="editor__body">
            {isError ? (
              <ErrorState error={error} onRetry={() => void refetch()} />
            ) : isLoading || !data || !draft || !base ? (
              <div className="editor__section">
                <Skeleton width="100%" height={220} />
                <Skeleton width="60%" />
                <Skeleton width="80%" />
              </div>
            ) : tab === "overview" ? (
              <Overview data={data} draft={draft} nameOf={nameOf} />
            ) : tab === "details" ? (
              <DetailsTab
                draft={draft}
                update={update}
                rules={rules}
                categories={categories}
                err={err}
              />
            ) : tab === "prices" ? (
              <PricesTab draft={draft} update={update} err={err} />
            ) : tab === "amenities" ? (
              <AmenitiesTab
                selected={draft.properties}
                onChange={(next) => update("properties", next)}
                amenities={amenities.data ?? []}
                loading={amenities.isLoading}
              />
            ) : tab === "photos" ? (
              <PhotosTab photos={draft.photos} onChange={(next) => update("photos", next)} />
            ) : (
              <LocationTab
                listingId={data.id}
                location={draft.location}
                onChange={(next) => update("location", next)}
                areaM2={draft.areaM2}
                onUseArea={(a) => update("areaM2", String(a))}
                err={err("location")}
                changed={!sameLocation(draft.location, base.location)}
                onReset={() => update("location", base.location)}
              />
            )}
          </div>
        </div>

        {/* ---- footer ---- */}
        {data && draft ? (
          <footer className="editor__foot">
            <div className="editor__foot-left">
              {data.status === "ARCHIVED" ? (
                <button
                  className="btn btn--ghost"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate("ACTIVE")}
                >
                  {t("Faollashtirish")}
                </button>
              ) : (
                <button className="btn btn--danger-soft" disabled={setStatus.isPending} onClick={() => void archive()}>
                  {t("Arxivlash")}
                </button>
              )}
            </div>
            <span className={`editor__state${dirty ? " editor__state--dirty" : ""}`}>
              {dirty
                ? `${t("Saqlanmagan o'zgarishlar")}: ${changeCount}`
                : t("Barcha o'zgarishlar saqlangan")}
            </span>
            <button
              className="btn btn--ghost"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setDraft(base);
                setShowErrors(false);
              }}
            >
              {t("Bekor qilish")}
            </button>
            <button
              className="btn btn--primary"
              disabled={!dirty || save.isPending}
              onClick={onSave}
              title="Ctrl + S"
            >
              {save.isPending ? t("Saqlanmoqda...") : t("Saqlash")}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function Overview({
  data,
  draft,
  nameOf,
}: {
  data: AdminListingDetail;
  draft: Draft;
  nameOf: (slug: string) => string;
}) {
  const t = useT();
  const offers = data.offers?.filter((o) => o.isActive) ?? [];
  const location = locationFromListing(data);

  return (
    <div className="editor__section">
      {data.images?.length ? (
        <PhotoSwiper
          images={draft.photos.map((p) => ({ id: p.url, url: p.url, thumbUrl: p.thumbUrl }))}
        />
      ) : (
        <div className="empty-inline">
          <IconPhoto />
          {t("Rasmlar yo'q")}
        </div>
      )}

      <div className="stat-tiles">
        <StatTile label={t("Narx")}>
          {offers.length
            ? offers.map((o) => (
                <div key={o.id}>
                  {money(o.price, o.currency)}
                  <span className="muted">
                    {" "}
                    {t(PURPOSES.find((p) => p.key === o.purpose)?.period ?? "")}
                  </span>
                </div>
              ))
            : "—"}
        </StatTile>
        <StatTile label={t("Ko'rishlar")}>{(data.viewCount ?? 0).toLocaleString("ru-RU")}</StatTile>
        <StatTile label={t("Baho")}>
          {data.ratingCount ? (
            <>
              ★ {data.ratingAvg?.toFixed(1)}{" "}
              <span className="muted">({data.ratingCount})</span>
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </StatTile>
        <StatTile label={t("Maydon")}>
          {data.areaM2 != null ? `${Number(data.areaM2)} m²` : "—"}
        </StatTile>
      </div>

      <div className="panel">
        <p className="section-title">{t("Egasi")}</p>
        <div className="person">
          <Avatar name={data.owner?.name ?? null} surname={data.owner?.surname ?? null} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cell-main">{data.owner ? fullName(data.owner) || "—" : "—"}</div>
            {data.owner?.phoneNumber ? (
              <a className="link muted" href={`tel:${data.owner.phoneNumber}`}>
                {data.owner.phoneNumber}
              </a>
            ) : (
              <span className="muted">{t("Telefon yo'q")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <p className="section-title">{t("Ma'lumotlar")}</p>
        <dl className="kv">
          <dt>{t("Turi")}</dt>
          <dd>{nameOf(data.category)}</dd>
          <dt>{t("Manzil")}</dt>
          <dd>{data.address || "—"}</dd>
          <dt>{t("Xonalar")}</dt>
          <dd>{data.rooms ?? "—"}</dd>
          <dt>{t("Qavat")}</dt>
          <dd>
            {data.floor != null
              ? data.totalFloors != null
                ? `${data.floor} / ${data.totalFloors}`
                : data.floor
              : "—"}
          </dd>
          <dt>{t("Aloqa telefoni")}</dt>
          <dd>
            {data.contactPhone ? (
              <a className="link" href={`tel:${data.contactPhone}`}>
                {data.contactPhone}
              </a>
            ) : (
              "—"
            )}
          </dd>
          <dt>{t("E'lon qilingan")}</dt>
          <dd>{date(data.publishedAt)}</dd>
          <dt>{t("Yaratilgan")}</dt>
          <dd>{date(data.createdAt)}</dd>
          <dt>{t("Yangilangan")}</dt>
          <dd>{date(data.updatedAt ?? null)}</dd>
        </dl>
      </div>

      {data.descriptionText?.trim() ? (
        <div className="panel">
          <p className="section-title">{t("Tavsif")}</p>
          <p className="description">{data.descriptionText.trim()}</p>
        </div>
      ) : null}

      <div className="panel">
        <p className="section-title">{t("Joylashuv")}</p>
        <ListingMap value={location} fitKey={`view-${data.id}`} height={240} />
      </div>
    </div>
  );
}

function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <div className="stat-tile__value">{children}</div>
    </div>
  );
}

type Update = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

function Field({
  label,
  hint,
  error,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={`field${wide ? " field--wide" : ""}`}>
      <span className="field__label">{label}</span>
      {children}
      {error ? <p className="field__error">{error}</p> : hint ? <p className="field__hint">{hint}</p> : null}
    </label>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented segmented--fill" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.key || "none"}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          className={`segmented__btn${value === o.key ? " segmented__btn--active" : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DetailsTab({
  draft,
  update,
  rules,
  categories,
  err,
}: {
  draft: Draft;
  update: Update;
  rules: CategoryRules;
  categories: { slug: string; nameUz: string; isActive: boolean }[];
  err: (key: string) => string | null;
}) {
  const t = useT();
  const input = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    update(key, e.target.value as never);
  const cls = (key: string) => `input${err(key) ? " input--error" : ""}`;

  return (
    <div className="editor__section">
      <section className="form-card">
        <h3 className="form-card__title">{t("Asosiy")}</h3>
        <div className="form-grid">
          <Field label={t("Kategoriya")} error={err("category")}>
            <select
              className={cls("category")}
              value={draft.category}
              onChange={(e) => update("category", e.target.value)}
            >
              {categories.map((c) => (
                <option
                  key={c.slug}
                  value={c.slug}
                  // A hidden category can be kept but not newly chosen — the
                  // server refuses it (CATEGORY_UNKNOWN).
                  disabled={!c.isActive && c.slug !== draft.category}
                >
                  {c.nameUz}
                  {c.isActive ? "" : ` (${t("yashirin")})`}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Sotuvchi")}>
            <Segmented
              value={draft.sellerType}
              onChange={(v) => update("sellerType", v)}
              options={[
                { key: "OWNER", label: t("Mulkdor") },
                { key: "REALTOR", label: t("Rieltor") },
                { key: "", label: "—" },
              ]}
            />
          </Field>
          <Field
            label={t("Sarlavha")}
            wide
            error={err("title")}
            hint={`${draft.title.length} / 160`}
          >
            <input
              className={cls("title")}
              value={draft.title}
              maxLength={160}
              placeholder={t("3 xonali kvartira, Chorsu yaqinida")}
              onChange={input("title")}
            />
          </Field>
          <Field
            label={t("Tavsif")}
            wide
            error={err("description")}
            hint={`${draft.description.length} / 5000 · ${t("Bo'sh qator — yangi xatboshi")}`}
          >
            <textarea
              className={`${cls("description")} input--area`}
              value={draft.description}
              rows={7}
              onChange={input("description")}
            />
          </Field>
        </div>
      </section>

      <section className="form-card">
        <h3 className="form-card__title">{t("Xususiyatlar")}</h3>
        <div className="form-grid form-grid--3">
          <Field label={t("Xonalar")} error={err("rooms")}>
            <input className={cls("rooms")} inputMode="numeric" value={draft.rooms} placeholder="3" onChange={(e) => update("rooms", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("Maydon, m²")} error={err("areaM2")}>
            <input
              className={cls("areaM2")}
              inputMode="decimal"
              value={draft.areaM2}
              placeholder="78.5"
              onChange={(e) => update("areaM2", e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, ""))}
            />
          </Field>
          {rules.floors ? (
            <>
              <Field label={t("Qavat")} error={err("floor")}>
                <input
                  className={cls("floor")}
                  inputMode="numeric"
                  value={draft.floor}
                  placeholder="4"
                  onChange={(e) => update("floor", e.target.value.replace(/[^\d-]/g, ""))}
                />
              </Field>
              <Field label={t("Qavatlar soni")} error={err("totalFloors")}>
                <input
                  className={cls("totalFloors")}
                  inputMode="numeric"
                  value={draft.totalFloors}
                  placeholder="9"
                  onChange={(e) => update("totalFloors", e.target.value.replace(/\D/g, ""))}
                />
              </Field>
            </>
          ) : null}
        </div>
        {rules.building ? (
          <Field label={t("Bino turi")}>
            <Segmented
              value={draft.buildingType}
              onChange={(v) => update("buildingType", v)}
              options={[
                { key: "NEW", label: t("Yangi bino") },
                { key: "SECONDARY", label: t("Ikkilamchi") },
                { key: "", label: "—" },
              ]}
            />
          </Field>
        ) : null}
        {rules.repair ? (
          <Field label={t("Ta'mirlash")}>
            <div className="choice-chips">
              {REPAIR_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={`choice-chip${draft.repairType === o.key ? " choice-chip--on" : ""}`}
                  onClick={() => update("repairType", draft.repairType === o.key ? "" : o.key)}
                >
                  {t(o.label)}
                </button>
              ))}
            </div>
          </Field>
        ) : null}
        {!rules.floors || !rules.building || !rules.repair ? (
          <p className="field__hint">
            {t("Bu kategoriyada ba'zi maydonlar so'ralmaydi va ilovada ko'rsatilmaydi.")}
          </p>
        ) : null}
      </section>

      <section className="form-card">
        <h3 className="form-card__title">{t("Manzil va aloqa")}</h3>
        <div className="form-grid">
          <Field label={t("Manzil")} wide error={err("address")}>
            <input
              className={cls("address")}
              value={draft.address}
              maxLength={500}
              placeholder={t("Toshkent, Shayxontohur tumani, Navoiy ko'chasi 12")}
              onChange={input("address")}
            />
          </Field>
          <Field label={t("Aloqa telefoni")} error={err("contactPhone")}>
            <input
              className={cls("contactPhone")}
              type="tel"
              value={draft.contactPhone}
              placeholder="+998 90 123 45 67"
              onChange={input("contactPhone")}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

function PricesTab({
  draft,
  update,
  err,
}: {
  draft: Draft;
  update: Update;
  err: (key: string) => string | null;
}) {
  const t = useT();
  const set = (key: OfferPurpose, patch: Partial<OfferDraft>) =>
    update("offers", { ...draft.offers, [key]: { ...draft.offers[key], ...patch } });

  return (
    <div className="editor__section">
      <p className="muted editor__lead">
        {t("E'lon bir nechta maqsadda bo'lishi mumkin — masalan, ham sotuv, ham ijara. Har biriga bitta narx.")}
      </p>
      {err("offers") ? <p className="field__error">{err("offers")}</p> : null}
      {PURPOSES.map((p) => {
        const o = draft.offers[p.key];
        const error = err(`offer.${p.key}`);
        return (
          <section key={p.key} className={`offer-card${o.enabled ? " offer-card--on" : ""}`}>
            <label className="offer-toggle">
              <input
                type="checkbox"
                checked={o.enabled}
                onChange={(e) => set(p.key, { enabled: e.target.checked })}
              />
              <span className="offer-toggle__track" aria-hidden />
              <span className="offer-card__title">{t(p.label)}</span>
            </label>
            {o.enabled ? (
              <div className="offer-card__fields">
                <Field label={p.period ? `${t("Narx")} (${t(p.period)})` : t("Narx")} error={error}>
                  <input
                    className={`input input--price${error ? " input--error" : ""}`}
                    inputMode="numeric"
                    // Grouped as it is typed (65 000), stored as plain digits.
                    value={o.price ? Number(o.price).toLocaleString("ru-RU") : ""}
                    placeholder={o.currency === "USD" ? "65 000" : "850 000 000"}
                    onChange={(e) => set(p.key, { price: e.target.value.replace(/\D/g, "") })}
                  />
                </Field>
                <Field label={t("Valyuta")}>
                  <Segmented
                    value={o.currency}
                    onChange={(currency) => set(p.key, { currency })}
                    options={[
                      { key: "USD", label: "USD $" },
                      { key: "UZS", label: "UZS so'm" },
                    ]}
                  />
                </Field>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function AmenitiesTab({
  selected,
  onChange,
  amenities,
  loading,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  amenities: { key: string; nameUz: string; isActive: boolean }[];
  loading: boolean;
}) {
  const t = useT();
  // Hidden amenities stay listed while this listing still carries them, so
  // the admin can see and remove them; otherwise only live ones are offered.
  const shown = amenities.filter((a) => a.isActive || selected.includes(a.key));
  const unknown = selected.filter((k) => !amenities.some((a) => a.key === k));
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  if (loading) return <div className="editor__section"><Skeleton width="100%" height={120} /></div>;

  return (
    <div className="editor__section">
      <p className="muted editor__lead">
        {t("Tanlangan")}: <b>{selected.length}</b> · {t("Ro'yxat Xususiyatlar sahifasida boshqariladi.")}
      </p>
      <div className="amenity-grid">
        {shown.map((a) => {
          const on = selected.includes(a.key);
          return (
            <button
              key={a.key}
              type="button"
              className={`amenity${on ? " amenity--on" : ""}`}
              onClick={() => toggle(a.key)}
              aria-pressed={on}
            >
              <span className="amenity__check" aria-hidden>
                {on ? "✓" : ""}
              </span>
              {a.nameUz}
              {a.isActive ? null : <span className="muted"> ({t("yashirin")})</span>}
            </button>
          );
        })}
        {unknown.map((k) => (
          <button key={k} type="button" className="amenity amenity--on" onClick={() => toggle(k)}>
            <span className="amenity__check" aria-hidden>✓</span>
            {k} <span className="muted">({t("o'chirilgan")})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PhotosTab({ photos, onChange }: { photos: Photo[]; onChange: (next: Photo[]) => void }) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  // The latest list, for uploads that finish after more edits were made.
  const latest = useRef(photos);
  useEffect(() => {
    latest.current = photos;
  });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const addFiles = async (list: FileList | File[]) => {
    const room = MAX_PHOTOS - photos.length;
    const all = [...list].filter((f) => f.type.startsWith("image/"));
    const tooBig = all.filter((f) => f.size > MAX_PHOTO_BYTES);
    const files = all.filter((f) => f.size <= MAX_PHOTO_BYTES).slice(0, Math.max(0, room));
    if (tooBig.length) toast.error(`${tooBig.length} ${t("ta rasm 10 MB dan katta")}`);
    if (all.length - tooBig.length > room) toast.error(`${t("Ko'pi bilan")} ${MAX_PHOTOS} ${t("ta rasm")}`);
    if (!files.length) return;

    setUploading((n) => n + files.length);
    try {
      const { images, failed } = await uploadListingPhotos(files);
      if (failed.length) toast.error(`${failed.length} ${t("ta rasmni yuklab bo'lmadi")}`);
      onChange([
        ...latest.current,
        ...images.map((i) => ({ url: i.url, thumbUrl: i.thumbUrl, width: i.width, height: i.height })),
      ]);
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading((n) => n - files.length);
    }
  };

  const remove = async (index: number) => {
    const ok = await confirmDialog({
      title: t("Rasmni o'chirish"),
      message: t("Saqlaganingizdan so'ng rasm butunlay o'chiriladi."),
      confirmLabel: t("O'chirish"),
      destructive: true,
    });
    if (ok) onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="editor__section">
      <div
        className={`dropzone${dragOver ? " dropzone--over" : ""}`}
        onDragOver={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <IconUpload />
        <div>
          <b>{t("Rasmlarni shu yerga tashlang")}</b>
          <p className="muted">
            {t("yoki")}{" "}
            <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>
              {t("kompyuterdan tanlang")}
            </button>{" "}
            · JPG, PNG, WebP · {t("10 MB gacha")} · {photos.length}/{MAX_PHOTOS}
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <p className="muted editor__lead">
        {t("Birinchi rasm — muqova. Tartibni sudrab o'zgartiring.")}
      </p>

      <div className="photo-grid">
        {photos.map((p, i) => (
          <figure
            key={p.url}
            className={`photo-tile${i === 0 ? " photo-tile--cover" : ""}${dragIndex === i ? " photo-tile--dragging" : ""}`}
            draggable
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.stopPropagation();
              move(dragIndex, i);
              setDragIndex(null);
            }}
          >
            <img
              src={resolveMediaUrl(p.thumbUrl)}
              alt=""
              loading="lazy"
              onClick={() => setViewing(resolveMediaUrl(p.url) ?? null)}
            />
            {i === 0 ? <span className="photo-tile__badge">{t("Muqova")}</span> : null}
            <span className="photo-tile__index">{i + 1}</span>
            <figcaption className="photo-tile__actions">
              <button type="button" title={t("Chapga")} disabled={i === 0} onClick={() => move(i, i - 1)}>
                ←
              </button>
              {i !== 0 ? (
                <button type="button" title={t("Muqova qilish")} onClick={() => move(i, 0)}>
                  ★
                </button>
              ) : null}
              <button type="button" title={t("O'ngga")} disabled={i === photos.length - 1} onClick={() => move(i, i + 1)}>
                →
              </button>
              <button type="button" className="danger" title={t("O'chirish")} onClick={() => void remove(i)}>
                🗑
              </button>
            </figcaption>
          </figure>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={`up-${i}`} className="photo-tile photo-tile--loading">
            <span className="spinner" aria-label={t("Yuklanmoqda")} />
          </div>
        ))}
      </div>

      {!photos.length && !uploading ? (
        <div className="empty-inline">
          <IconPhoto />
          {t("Rasmlar yo'q")}
        </div>
      ) : null}

      <Lightbox url={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function LocationTab({
  listingId,
  location,
  onChange,
  areaM2,
  onUseArea,
  err,
  changed,
  onReset,
}: {
  listingId: string;
  location: MapLocation;
  onChange: (next: MapLocation) => void;
  areaM2: string;
  onUseArea: (area: number) => void;
  err: string | null;
  changed: boolean;
  onReset: () => void;
}) {
  const t = useT();
  const mode = location.kind === "polygon" ? "polygon" : "point";
  const drawnArea =
    location.kind === "polygon" && location.ring.length >= 3
      ? Math.round(ringAreaM2(location.ring) * 10) / 10
      : null;
  const center =
    location.kind === "point"
      ? location.point
      : location.kind === "polygon" && location.ring.length
        ? ringCenter(location.ring)
        : null;

  const switchMode = (next: "point" | "polygon") => {
    if (next === mode) return;
    if (next === "point") {
      onChange(
        location.kind === "polygon" && location.ring.length
          ? { kind: "point", point: ringCenter(location.ring) }
          : { kind: "none" },
      );
    } else {
      onChange({ kind: "polygon", ring: [] });
    }
  };

  // Hint for the step the admin is on, not a manual.
  const hint =
    mode === "point"
      ? location.kind === "point"
        ? t("Pinni sudrab yoki xaritaga bosib joyini o'zgartiring.")
        : t("Xaritaga bosib pin qo'ying.")
      : location.kind === "polygon" && location.ring.length < 3
        ? t("Chegaraning burchaklarini ketma-ket bosing (kamida 3 ta).")
        : t("Burchakni sudrab suring, bosib o'chiring; yangi burchak uchun xaritaga bosing.");

  return (
    <div className="editor__section">
      <div className="location-bar">
        <Segmented
          value={mode}
          onChange={switchMode}
          options={[
            { key: "point", label: `📍 ${t("Nuqta")}` },
            { key: "polygon", label: `⬠ ${t("Chegara")}` },
          ]}
        />
        {mode === "polygon" ? (
          <>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={location.kind !== "polygon" || !location.ring.length}
              onClick={() =>
                location.kind === "polygon" &&
                onChange({ kind: "polygon", ring: location.ring.slice(0, -1) })
              }
            >
              ↶ {t("Oxirgisini qaytarish")}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={location.kind !== "polygon" || !location.ring.length}
              onClick={() => onChange({ kind: "polygon", ring: [] })}
            >
              {t("Tozalash")}
            </button>
          </>
        ) : null}
        {changed ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onReset}>
            {t("Asl holiga qaytarish")}
          </button>
        ) : null}
      </div>

      <p className={`location-hint${err ? " location-hint--error" : ""}`}>{err ?? hint}</p>

      <ListingMap value={location} editable onChange={onChange} fitKey={`edit-${listingId}`} height={440} />

      <div className="location-facts">
        {center ? (
          <span>
            {t("Koordinatalar")}: <code className="mono">{center[1].toFixed(6)}, {center[0].toFixed(6)}</code>{" "}
            <a
              className="link"
              href={`https://www.google.com/maps?q=${center[1]},${center[0]}`}
              target="_blank"
              rel="noreferrer"
            >
              Google Maps ↗
            </a>
          </span>
        ) : null}
        {location.kind === "polygon" ? (
          <span>
            {t("Burchaklar")}: <b>{location.ring.length}</b>
          </span>
        ) : null}
        {drawnArea != null ? (
          <span>
            {t("Chizilgan maydon")}: <b>≈ {drawnArea.toLocaleString("ru-RU")} m²</b>
            {areaM2 && Math.abs(Number(areaM2) - drawnArea) > 1 ? (
              <>
                {" "}
                <span className="muted">
                  ({t("e'londa")} {Number(areaM2).toLocaleString("ru-RU")} m²)
                </span>{" "}
                <button type="button" className="link-btn" onClick={() => onUseArea(drawnArea)}>
                  {t("Maydonga yozish")}
                </button>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons — stroke icons in the dashboard's style, inline so nothing is fetched
// ---------------------------------------------------------------------------

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const IconEye = () => (
  <Svg>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
const IconForm = () => (
  <Svg>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </Svg>
);
const IconTag = () => (
  <Svg>
    <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </Svg>
);
const IconCheck = () => (
  <Svg>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="m8 12 3 3 5-6" />
  </Svg>
);
const IconPhoto = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m5 19 5.5-5.5L14 17l3-3 4 4" />
  </Svg>
);
const IconPin = () => (
  <Svg>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Svg>
);
const IconUpload = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);
