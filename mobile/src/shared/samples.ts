// The fictional sample records. Implementation: public/js/sample-data.js.
//
// Shared rather than copied so that tests/sample-data.test.js, which enforces
// that every name is a "Fulan", every organization a "Sample Masjid" and every
// address an example street, covers what this app can show as well. A demo of
// a funeral app must not look like a real funeral, and that check should not
// have to be written twice to stay true.

import * as samples from '../../../public/js/sample-data.js';

export const SAMPLE_ORGS: Record<string, unknown>[] = samples.SAMPLE_ORGS;
export const SAMPLE_NOTICES: Record<string, unknown>[] = samples.SAMPLE_NOTICES;
