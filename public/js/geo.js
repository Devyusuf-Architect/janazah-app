// Geohash encoding and distance maths.
//
// Phase 1 uses this to stamp a coarse cell onto organizations and prayer
// locations. Phase 3 uses the same cell to decide what is near the user, and
// Phase 4 uses it to route notifications, so the grid is fixed here once.
//
// Deliberately not using a geo-query library. The active notice set is tens of
// documents for the foreseeable future; fetching it and filtering in the
// client is simpler, cheaper and avoids a dependency.

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Encode a lat/lng as a geohash of the given character length. */
export function geohash(lat, lng, precision = 5) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new TypeError('geohash: lat and lng must be finite numbers');
  }
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = '';
  let bits = 0;
  let bit = 0;
  let even = true;

  while (hash.length < precision) {
    const range = even ? lngRange : latRange;
    const mid = (range[0] + range[1]) / 2;
    const value = even ? lng : lat;
    if (value > mid) {
      bit = (bit << 1) + 1;
      range[0] = mid;
    } else {
      bit = bit << 1;
      range[1] = mid;
    }
    even = !even;
    if (++bits === 5) {
      hash += BASE32[bit];
      bits = 0;
      bit = 0;
    }
  }
  return hash;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Human-readable approximate distance, deliberately coarse. */
export function formatDistance(km) {
  if (km < 1) return 'under 1 km';
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Deep link that opens directions in whatever maps app the device prefers. */
export function directionsUrl(loc) {
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
  }
  const q = encodeURIComponent([loc?.name, loc?.address].filter(Boolean).join(', '));
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}
