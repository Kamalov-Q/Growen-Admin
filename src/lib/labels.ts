// Display names for the API's fixed enum values (purposes, amenities) — the
// same Uzbek wording the mobile app uses, so an admin and a user describe a
// listing the same way. Categories are NOT here: they are admin-managed data
// with their own names — see useCategories.

export const PURPOSE_LABEL: Record<string, string> = {
  SALE: "Sotuv",
  RENT_MONTHLY: "Oylik ijara",
  RENT_DAILY: "Kunlik ijara",
};

/** What a price is "per" — nothing for a sale, the period for a rent. */
export const PURPOSE_PERIOD: Record<string, string> = {
  SALE: "",
  RENT_MONTHLY: " / oy",
  RENT_DAILY: " / kun",
};

export const PROPERTY_LABEL: Record<string, string> = {
  REPAIRED: "Ta'mirlangan",
  FURNISHED: "Mebel bilan",
  AC: "Konditsioner",
  HEATING: "Isitish tizimi",
  PARKING: "Avtoturargoh",
  GARAGE: "Garaj",
  BALCONY: "Balkon",
  ELEVATOR: "Lift",
  INTERNET: "Internet",
  SECURITY: "Qo'riqlanadi",
  POOL: "Basseyn",
  GARDEN: "Bog'",
};

export const label = (map: Record<string, string>, key: string | null | undefined) =>
  key ? (map[key] ?? key) : "—";
