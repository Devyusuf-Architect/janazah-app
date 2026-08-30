// Let `node --test` resolve the app's imports.
//
// The app writes `import { x } from './thing'`, which is what React Native,
// Metro and TypeScript all expect. Node's ESM resolver requires the extension.
// Rather than write `./thing.ts` throughout the app to suit the test runner,
// the test runner is taught the one rule it is missing.
//
// Registered by the `test` script in package.json.

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./extensionless-hooks.mjs', pathToFileURL(`${import.meta.dirname}/`));
