// Keeps every bit of the real location logic (settings, radius, staleness,
// distance, erase-on-opt-out) and replaces only the browser geolocation call,
// which a sandboxed preview frame is not permitted to make.
export * from '../public/js/location.js';
import { update } from '../public/js/location.js';

const PREVIEW_POSITION = { lat: 43.6602, lng: -79.3820 };  // downtown Toronto

export const canUseLocation = () => true;

export async function requestPosition() {
  await new Promise((r) => setTimeout(r, 450));
  const point = { ...PREVIEW_POSITION, at: Date.now() };
  update({ last: point });
  return point;
}
