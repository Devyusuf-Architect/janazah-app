# Phase 2: the public community feed

The community surface is now the site root; the coordinator console moved to
`/console`. That is deliberate: the feed is the URL people paste into the
WhatsApp groups they already use, so it should be the bare domain, and it has
to render with no sign-in at all.

## Routes

| Path            | Page                                            |
| --------------- | ----------------------------------------------- |
| `/`             | Current and upcoming Janazahs                   |
| `/n/{noticeId}` | One notice, the shareable link                   |
| `/console`      | Coordinator and platform administrator console  |

Firebase Hosting rewrites in `firebase.json` map `/console` and below to
`console.html` and everything else to `index.html`.

## One console step is needed for reporting

**Build > Authentication > Sign-in method > Anonymous > Enable.**

Reading the feed and following a masjid need no account and no sign-in. Filing
a report does, because the security rules pin `reportedBy` to the
authenticated caller, and that is what makes rate limiting and abuse handling
possible later. An anonymous session gives a stable identifier and collects
nothing about the person.

If the provider is left disabled, everything else on the feed still works and
the report dialog says plainly that reporting is unavailable rather than
failing silently.

## Following is stored on the device, not in an account

`public/js/follows.js` keeps followed organization IDs in `localStorage`.
Nothing is written to Firestore, so the platform never learns which masajid a
person cares about, and there is no user record to protect. The cost is no
cross-device sync, which is the right trade for a first release and is stated
in the footer rather than left for someone to discover.

Private browsing and storage-blocking settings make `localStorage` throw. Every
read and write is guarded, and the follow manager says so instead of silently
losing the setting.

## Time zones

A notice stores an absolute instant plus its IANA zone. The feed groups
notices by calendar date **in the notice's own zone** and renders the time in
that zone, so a 7pm prayer in Toronto does not appear as a different day to
someone reading in Vancouver. "Today" is shown only when the notice's date
matches today in that same zone.

## What is deliberately not here

- **No location.** Nearby matching is Phase 3 and runs on the device against
  the public notice list. Nothing in Phase 2 reads or stores a position.
- **No notifications.** Phase 4, and still gated on the compute decision.
- **No account for community members.** Anonymous sessions exist only to make
  reporting attributable enough to rate limit.

## Known gaps worth deciding before launch

- **Duplicate notices.** Two coordinators posting the same funeral produce two
  cards. There is no grouping yet, and it will erode trust once volume picks
  up.
- **Feed volume.** The feed shows every published notice in the country. Until
  Phase 3 adds distance filtering there is no way for a reader in Halifax to
  hide notices from Vancouver.
- **Retention.** A notice leaves the feed six hours after the prayer
  (`APP.currentWindowHours`), but the document and the deceased's name remain.
  Purging still needs a decision and a scheduler.
