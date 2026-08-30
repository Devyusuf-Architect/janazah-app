// Geohash, distance and directions. Implementation: public/js/geo.js.
//
// Shared with the web app on purpose. The cell grid this computes is the same
// grid the Cloud Function publishes notices to (functions/lib/topics.js), so
// a divergence here would silently stop notifications arriving.

import * as geo from '../../../public/js/geo.js';

export const geohash: (lat: number, lng: number, precision?: number) => string =
  geo.geohash;

export const distanceKm: (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) => number = geo.distanceKm;

export const formatDistance: (km: number) => string = geo.formatDistance;

export const cellSizeDegrees: (precision: number) => { lat: number; lng: number } =
  geo.cellSizeDegrees;

export const cellsCovering: (
  lat: number, lng: number, radiusKm: number, precision: number,
) => string[] = geo.cellsCovering;

export const subscriptionCells: (
  lat: number, lng: number, radiusKm: number, options?: { maxCells?: number },
) => { precision: number; cells: string[] } = geo.subscriptionCells;

export type MapDestination = {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
};

export type DirectionsOption = { key: string; label: string; href: string };

export const directionsOptions: (loc: MapDestination) => DirectionsOption[] =
  geo.directionsOptions;

export const directionsUrl: (loc: MapDestination) => string = geo.directionsUrl;
