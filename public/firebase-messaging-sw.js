/* Service worker for push delivery.
 *
 * Runs when the page is closed, so it is deliberately thin: it displays what
 * the backend sent and opens the notice when tapped. It holds no user data and
 * makes no decisions about who should see what. That decision was made when
 * the device chose which area topics to subscribe to.
 *
 * Loaded as a classic worker, so it uses the compat builds. The Firebase
 * config arrives as query parameters from the registering page rather than
 * being duplicated here, so there is one place the project is configured.
 */

importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;

firebase.initializeApp({
  apiKey: params.get('apiKey'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

const messaging = firebase.messaging();

/* Messages carrying a notification block are displayed by the browser itself.
 * This handles the data-only case so nothing arrives silently. */
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const data = payload.data || {};
  const title = data.title || 'Janazah notice';
  self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.noticeId ? `janazah-${data.noticeId}` : undefined,
    icon: '/icon-192.png',
    badge: '/badge.png',
    data: { link: data.link || '/' },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link
    || event.notification.data?.FCM_MSG?.data?.link
    || '/';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window', includeUncontrolled: true,
    });
    // Reuse an open tab where there is one, rather than piling up windows.
    for (const client of clientList) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(link);
        return;
      }
    }
    await self.clients.openWindow(link);
  })());
});
