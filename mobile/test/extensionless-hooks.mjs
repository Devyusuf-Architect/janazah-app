// The resolve hook itself. See extensionless.mjs for why this exists.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs'];

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    // Only relative specifiers get a second chance. A bare package name that
    // does not resolve is a genuinely missing dependency and must still fail.
    if (!specifier.startsWith('.') || !context.parentURL) throw error;

    for (const extension of EXTENSIONS) {
      const candidate = new URL(specifier + extension, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return next(specifier + extension, context);
      }
    }
    // An index file inside a directory, which is how src/theme is imported.
    for (const extension of EXTENSIONS) {
      const candidate = new URL(`${specifier}/index${extension}`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return next(`${specifier}/index${extension}`, context);
      }
    }
    throw error;
  }
}
