// Moved to public/js/sample-data.js.
//
// The deployed app can now show this data itself (see APP.sampleData in
// public/js/config.js), and only files under public/ are served, so the one
// source has to live there. This re-export keeps the preview build, the demo
// seeder, the live seeder and tests/sample-data.test.js pointing at it
// without four separate path changes.

export * from '../public/js/sample-data.js';
