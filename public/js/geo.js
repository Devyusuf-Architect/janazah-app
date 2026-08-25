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

/**
 * Width and height of one geohash cell, in degrees, at a given precision.
 * Each character adds five bits, split between longitude and latitude
 * starting with longitude.
 */
export function cellSizeDegrees(precision) {
  const bits = precision * 5;
  const lngBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return { lat: 180 / 2 ** latBits, lng: 360 / 2 ** lngBits };
}

/**
 * Every geohash cell that overlaps a circle of `radiusKm` around a point.
 *
 * Computed by sampling a grid across the bounding box rather than by walking
 * geohash neighbours: neighbour arithmetic is fiddly and wrong at the
 * meridian and the poles, while sampling is obviously correct as long as the
 * step is smaller than a cell.
 *
 * This is how a device decides which notification topics to subscribe to. The
 * cells are coarse on purpose: a topic name reveals an area, never a point.
 */
export function cellsCovering(lat, lng, radiusKm, precision) {
  const size = cellSizeDegrees(precision);
  const latDegPerKm = 1 / 110.574;
  // Longitude degrees shrink towards the poles; guard against the cosine
  // reaching zero so the span stays finite.
  const lngDegPerKm = 1 / Math.max(0.01, 111.320 * Math.cos((lat * Math.PI) / 180));

  const latSpan = Math.min(90, radiusKm * latDegPerKm);
  // Near the poles a modest radius spans every longitude. Clamp to a full
  // circle so the sampling loop stays bounded instead of going round twice.
  const lngSpan = Math.min(180, radiusKm * lngDegPerKm);
  const latStep = size.lat / 2;
  const lngStep = size.lng / 2;

  const cells = new Set();
  for (let dLat = -latSpan; dLat <= latSpan + latStep; dLat += latStep) {
    for (let dLng = -lngSpan; dLng <= lngSpan + lngStep; dLng += lngStep) {
      const sampleLat = Math.min(90, Math.max(-90, lat + Math.min(dLat, latSpan)));
      let sampleLng = lng + Math.min(dLng, lngSpan);
      // Wrap rather than clamp: longitude is circular.
      if (sampleLng > 180) sampleLng -= 360;
      if (sampleLng < -180) sampleLng += 360;
      cells.add(geohash(sampleLat, sampleLng, precision));
    }
  }
  return [...cells].sort();
}

/**
 * Cell precision to use for a given radius, and the resulting cell set.
 *
 * A tighter radius deserves finer cells, but the number of topics a device
 * subscribes to has to stay small, so precision drops a step whenever the
 * count would get out of hand. Every push a device receives is therefore one
 * it should see: the filtering happens at subscription time rather than by
 * discarding notifications on arrival, which browsers penalise.
 */
export function subscriptionCells(lat, lng, radiusKm, { maxCells = 40 } = {}) {
  const effectiveRadius = radiusKm === 0 ? 400 : radiusKm;
  for (const precision of [5, 4, 3, 2]) {
    const cells = cellsCovering(lat, lng, effectiveRadius, precision);
    if (cells.length <= maxCells) return { precision, cells };
  }
  return { precision: 2, cells: cellsCovering(lat, lng, effectiveRadius, 2) };
}

/** Deep link that opens directions in whatever maps app the device prefers. */
export function directionsUrl(loc) {
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`;
  }
  const q = encodeURIComponent([loc?.name, loc?.address].filter(Boolean).join(', '));
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}
