# Shared logic

Every file here is a re-export. The implementations live in `public/js/`,
where the web app uses them and where `tests/` in the repository root is the
authority on their behaviour.

Nothing in this directory may contain logic of its own. If a shared module
needs to change, it changes in `public/js/`, both clients get the change, and
the existing tests decide whether it was correct. A second copy here would
drift, and drift in `geo.js` in particular means this app's idea of what is
near you stops matching the backend's idea of which notification topic a
notice went to.

Metro reaches outside the project root because `metro.config.js` adds the
repository root to `watchFolders`.

`config.ts` is the one exception, and it is not a re-export: `public/js/config.js`
is browser-specific in one respect (it carries the web push VAPID key), so the
constants this app needs are restated there and checked against the web file
by `test/shared.test.ts`.
