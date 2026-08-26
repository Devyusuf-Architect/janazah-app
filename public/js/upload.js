// Optional supporting documents for organization verification.
//
// The only use of Cloud Storage in this application, and the reason it is
// loaded lazily: most registrations attach nothing, and a masjid office on a
// slow connection should not download a storage SDK to fill in a form they
// will never use it on.
//
// What this is not for: government identification. It is never asked for,
// never accepted as a requirement, and the form says so. What belongs here is
// a letter on the organization's own letterhead, or a photograph of one.
//
// Where it goes: organizations/{orgId}/verification/{file}. storage.rules
// allows the organization's owner to upload there and platform
// administrators to read. Nobody else can do either, there is no public URL,
// and nothing links to it from an organization's public page.

// firebase.js is imported inside storage() rather than at the top of this
// module. It touches `location` on load, and the pure helpers below (size and
// type limits, filename cleaning) are worth testing under Node without
// standing up a browser environment for them.

/** Ten megabytes: generous for a scanned letter, small enough to refuse a mistake. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_DOCUMENT_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp',
];

/**
 * Why a file cannot be uploaded, in words the person can act on, or null.
 *
 * Mirrors the limits in storage.rules. The rules are the enforcement; this
 * exists so somebody learns their file is too large before they have waited
 * for it to upload.
 */
export function documentProblem(file) {
  if (!file) return null;
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit `
         + 'is 10 MB. A scan at a lower resolution is usually enough to read.';
  }
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
    return 'Attach a PDF or a photograph (JPEG, PNG, HEIC or WebP).';
  }
  return null;
}

/** Keep the extension, drop everything else: a filename is user input. */
export function safeFileName(name) {
  const cleaned = String(name || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return cleaned.replace(/^[.-]+/, '') || 'document';
}

let storageModule = null;

async function storage() {
  if (!storageModule) {
    const [mod, { app, usingEmulator }] = await Promise.all([
      import('firebase/storage'), import('./firebase.js'),
    ]);
    const instance = mod.getStorage(app);
    if (usingEmulator) mod.connectStorageEmulator(instance, '127.0.0.1', 9199);
    storageModule = { mod, instance };
  }
  return storageModule;
}

/**
 * Upload one supporting document for an organization.
 *
 * Returns the storage path, not a download URL. The path is stored on the
 * private application document; an administrator resolves it to a URL when
 * they open it. Handing out a download URL would create a link that works for
 * anyone holding it, which is the opposite of what this data needs.
 *
 * @param {string} orgId
 * @param {File} file
 * @returns {Promise<{path: string, name: string}>}
 */
export async function uploadVerificationDocument(orgId, file) {
  const problem = documentProblem(file);
  if (problem) throw new Error(problem);

  const { mod, instance } = await storage();
  // The timestamp keeps a second upload from overwriting the first, which
  // storage.rules forbids anyway: a correction is a new file, so that the
  // version an administrator read cannot be swapped afterwards.
  const name = `${Date.now()}-${safeFileName(file.name)}`;
  const path = `organizations/${orgId}/verification/${name}`;
  await mod.uploadBytes(mod.ref(instance, path), file, { contentType: file.type });
  return { path, name: file.name };
}

/**
 * A short-lived URL an administrator can open. Administrators only: the read
 * is refused by storage.rules for anyone else, so this cannot be used to hand
 * a document to a coordinator or a visitor.
 */
export async function verificationDocumentUrl(path) {
  const { mod, instance } = await storage();
  return mod.getDownloadURL(mod.ref(instance, path));
}
