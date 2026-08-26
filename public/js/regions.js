// Countries and their first-level subdivisions, for organization registration.
//
// Asking for country and region before the street address is not paperwork for
// its own sake. It does two things the address box alone cannot:
//
//   Accuracy   "Springfield" and "London" and "Hamilton" exist in a dozen
//              countries. Narrowing before the search means the first result
//              is far more likely to be the right building, and a masjid
//              registered at the wrong coordinates is invisible to every
//              nearby alert without anyone noticing.
//   Honesty    The registrant states where they are, rather than the app
//              inferring it from a geocoder's guess and storing that.
//
// Canada and the United States get real subdivision lists, because those are
// the launch markets and their postal geography is what the distance features
// were built against. Everywhere else takes a free-text region: inventing a
// half-accurate list of another country's provinces is worse than a text box.

/** ISO 3166-1 alpha-2 code and English name. Canada first: this launches there. */
export const COUNTRIES = [
  { code: 'CA', name: 'Canada' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'QA', name: 'Qatar' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'OM', name: 'Oman' },
  { code: 'JO', name: 'Jordan' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'EG', name: 'Egypt' },
  { code: 'MA', name: 'Morocco' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'LY', name: 'Libya' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'KE', name: 'Kenya' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'IN', name: 'India' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'AF', name: 'Afghanistan' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'SY', name: 'Syria' },
  { code: 'PS', name: 'Palestine' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'BN', name: 'Brunei' },
  { code: 'PH', name: 'Philippines' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'AL', name: 'Albania' },
  { code: 'BA', name: 'Bosnia and Herzegovina' },
  { code: 'XK', name: 'Kosovo' },
];

/**
 * First-level subdivisions, where the app carries a real list.
 *
 * The value stored is the full name, not the postal abbreviation, because it
 * is shown to people and read by administrators reviewing a registration.
 */
export const SUBDIVISIONS = {
  CA: [
    'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick',
    'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia',
    'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan',
    'Yukon',
  ],
  US: [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia',
    'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
    'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
    'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina',
    'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
    'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas',
    'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin',
    'Wyoming',
  ],
};

/** What to call the region box, since "province" is wrong in most countries. */
export const REGION_LABEL = {
  CA: 'Province or territory',
  US: 'State',
  GB: 'Nation or county',
  AU: 'State or territory',
};

export const regionLabelFor = (code) => REGION_LABEL[code] || 'State, province or region';

/** A known list for this country, or null when the region is free text. */
export const subdivisionsFor = (code) => SUBDIVISIONS[code] || null;

export const countryName = (code) =>
  COUNTRIES.find((c) => c.code === code)?.name || '';

/**
 * A rough centre to bias address search towards, so results in the chosen
 * country rank first. Only a handful are listed: everywhere else falls back
 * to appending the country name to the query, which the geocoder handles
 * well on its own.
 */
const CENTRES = {
  CA: [56.13, -106.35], US: [39.83, -98.58], GB: [54.0, -2.0],
  AU: [-25.27, 133.78], PK: [30.38, 69.35], IN: [20.59, 78.96],
  BD: [23.68, 90.36], ZA: [-30.56, 22.94], AE: [23.42, 53.85],
  SA: [23.89, 45.08], EG: [26.82, 30.80], MY: [4.21, 101.98],
  ID: [-0.79, 113.92], TR: [38.96, 35.24], NG: [9.08, 8.68],
  FR: [46.23, 2.21], DE: [51.17, 10.45], NL: [52.13, 5.29],
};

export const centreFor = (code) => {
  const point = CENTRES[code];
  return point ? { lat: point[0], lon: point[1] } : null;
};
