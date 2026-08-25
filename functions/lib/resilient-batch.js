// Running a batch of independent items where one failure must not take the
// rest down with it.
//
// This exists because enforceRetention originally processed each collection
// as one flat loop with no error isolation: a single malformed document threw
// an uncaught exception that aborted the entire daily run mid-batch, with
// nothing logged beyond a generic crash and no record of how much, if any,
// of the batch had actually completed. That is close to the worst shape a
// failure can take for something meant to run unattended once a day.
//
// No Firebase imports, same discipline as the rest of lib/: this only
// controls the loop, the caller does the actual work and any Firestore I/O.

/**
 * Run `worker` once per item. Every item is attempted regardless of whether
 * an earlier one failed. Returns the failures, each tagged with the item's
 * id, so the caller can log or count them; nothing here decides how a
 * failure is reported.
 *
 * @param {{id: string}[]} items
 * @param {(item) => Promise<void>} worker
 * @returns {Promise<{docId: string, message: string}[]>}
 */
export async function eachIndependently(items, worker) {
  const errors = [];
  for (const item of items) {
    try {
      await worker(item);
    } catch (err) {
      errors.push({ docId: item.id, message: String(err?.message || err).slice(0, 200) });
    }
  }
  return errors;
}
