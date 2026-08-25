// Push needs a service account to send and a service worker to receive, so the
// preview reports it as unconfigured. The interface then shows its honest
// fallback, which is exactly what a visitor sees before the project is set up.
export class PushError extends Error {}
export const isConfigured = () => false;
export const supported = async () => false;
export const permission = () => 'default';
export const isEnabled = () => false;
export const desiredTopics = () => [];
export const syncTopics = async () => ({ changed: 0 });
export const enable = async () => { throw new PushError('Not available in the preview.'); };
export const disable = async () => {};
export const iosNeedsInstall = () => false;
