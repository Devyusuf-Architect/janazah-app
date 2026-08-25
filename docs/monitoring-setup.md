# Error alerting, so a broken deploy is not discovered by a masjid

Every Cloud Function in this repository already logs at the right severity:
`logger.error` when something a masjid would notice has failed (a notice with
nobody to notify, a notification that reached nobody, a retention pass that
left errors behind), `logger.warn` for a partial failure worth knowing about
but not urgent, `logger.info` for the normal case. Nothing reads those logs
unless somebody is watching the console, which nobody is. This sets up a log
based alert so an error becomes an email instead.

No new dependency. Google Cloud Logging is already receiving every Functions
log line; this only asks it to notify on the ones that matter. That matches
the project's own rule against adding a runtime dependency beyond the
Firebase SDK (`docs/HANDOFF.md`, section 9) — a third-party error-tracking
service would need a browser or Functions SDK of its own.

Five minutes, once the project is deployed and has produced at least one log
line (deploy, then publish or correct a notice once, so there is something in
Logs Explorer to build the filter against).

---

## 1. Open Logs Explorer

**Google Cloud console → Logging → Logs Explorer**, with your Firebase
project selected (Firebase and Google Cloud consoles share the same project;
the fastest way in is `console.cloud.google.com/logs/query?project=YOUR-PROJECT-ID`).

## 2. Build the filter

Paste this into the query box:

```
resource.type="cloud_function"
severity>=ERROR
```

Run it. You should see nothing yet, or only the errors you have already
caused on purpose. That is expected: `logger.error` calls in this codebase
are reserved for things that need a human, not routine operation.

If you want warnings included too (partial notification failures, for
example), use `severity>=WARNING` instead. The tradeoff is more noise for
earlier warning; `severity>=ERROR` is the better default and can be loosened
later once you know the normal warning volume.

## 3. Create the alert from this query

**Logs Explorer → "Create alert"** (top of the query results pane).

- **Name**: `Janazah Functions errors` or similar.
- **Log filter**: carried over from step 2 automatically.
- **Notification frequency / time window**: leave the default (checks every
  few minutes); there is no reason to widen it for a low-volume app.

## 4. Add a notification channel

If no channel exists yet, the alert creation flow offers **"Manage
notification channels"** inline. Add an **email** channel with the address
that should hear about this — see `docs/deployment.md` step 11 for who that
likely is (the account that holds platform administrator access). Save,
select it as the channel for this alert, and save the alert.

## 5. Confirm it fires

Trigger a real error once, deliberately, and confirm the email arrives before
trusting this. The most realistic way: temporarily set `SITE_ORIGIN` in
`functions/.env` to something invalid and publish a notice, which causes the
notification-sending path to fail and log `logger.error('Notice notification
totally failed...')`. Undo the change afterward and redeploy functions.

Do not skip this step. An alert that has never been proven to fire is not
meaningfully different from no alert.

---

## What this catches, and what it does not

Catches:

- A notice published with nobody to notify (`Notice has no routable topics`).
- A notification send that failed for every topic, or partially failed.
- A retention pass that finished with errors on one or more documents
  (`functions/lib/resilient-batch.js` lets the run continue past a single bad
  document instead of aborting the whole batch, and the accumulated errors
  are logged at `ERROR` once the pass completes).

Does not catch:

- Anything that goes wrong entirely in the browser (a client-side exception
  that never reaches a Cloud Function). There is deliberately no client-side
  error capture, per the "Google Cloud alerting only" decision — see the note
  in `docs/HANDOFF.md` about not adding a third-party dependency for this.
  If that gap becomes a real problem, `window.onerror` reporting to a
  Function endpoint is the smallest addition that would close it, but it is
  not built.
- A masjid simply not publishing when they should have. That is a process
  problem, not a system failure, and no monitoring tool addresses it.
