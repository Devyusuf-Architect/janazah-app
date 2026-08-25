// Address lookup for organization registration.
//
// Why this exists: a masjid office should never be asked for latitude and
// longitude. They type an address, pick it from a list, and the coordinates
// the nearby-matching system needs are taken from the result.
//
// What this is NOT: anything to do with a *user's* location. That still never
// leaves the browser and is never geocoded (see location.js). This looks up
// the public, published address of an organization, typed by someone who is
// registering that organization on purpose. The only thing sent to the
// geocoder is text the coordinator entered about their own masjid.
//
// Photon rather than Google Places: no API key to hold or leak, no billing
// account, no third-party script tag, and it is built for
// type-ahead specifically (Nominatim's usage policy forbids using it that
// way). One fetch() and the Firebase SDK remains this app's only runtime
// dependency, which is the rule in docs/HANDOFF.md section 9.

/** Overridable so tests can point at a local stub instead of the network. */
export const GEOCODER = {
  url: 'https://photon.komoot.io/api/',
  // Biased towards Canada, where this launches. Results elsewhere still
  // appear; they just rank lower.
  bias: { lat: 56.13, lon: -106.35 },
};

/** Photon returns GeoJSON; this is the shape the rest of the app wants. */
export function normalizeFeature(feature) {
  const p = feature?.properties;
  const coords = feature?.geometry?.coordinates;
  if (!p || !Array.isArray(coords) || coords.length < 2) return null;

  const [lng, lat] = coords.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  // A named place ("Masjid Al-Noor") keeps its name; a plain address does
  // not repeat its own street number back at itself.
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const address = street || p.name || '';
  const city = p.city || p.town || p.village || p.district || p.county || '';

  return {
    name: p.name || '',
    address,
    city,
    province: p.state || '',
    postalCode: p.postcode || '',
    country: p.country || '',
    lat,
    lng,
    // What the person reads in the suggestion list and in the confirmation.
    label: [p.name, street, city, p.state, p.postcode, p.country]
      .filter(Boolean)
      // A named place whose name and street are identical reads badly twice.
      .filter((part, i, all) => all.indexOf(part) === i)
      .join(', '),
  };
}

/**
 * Address suggestions for a partial query.
 *
 * @param {string} query
 * @param {{ signal?: AbortSignal, limit?: number }} [options]
 * @returns {Promise<Array<ReturnType<typeof normalizeFeature>>>}
 */
export async function searchAddresses(query, { signal, limit = 6 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  const url = new URL(GEOCODER.url);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('lang', 'en');
  url.searchParams.set('lat', String(GEOCODER.bias.lat));
  url.searchParams.set('lon', String(GEOCODER.bias.lon));

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
  const data = await res.json();

  return (data?.features || []).map(normalizeFeature).filter(Boolean);
}
