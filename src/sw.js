import { precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Dispocem", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Dispocem";
  const options = {
    body: data.body || "",
    icon: "/pwa-192.png",
    // Android status bar traku prikazuje samo alfa-kanal ove ikonice (bijeli
    // silhouette) - pwa-192.png je puna crveno-bijela ikona bez providnosti,
    // pa je Android tamo prikazivao prazan bijeli kvadrat. badge-icon.png je
    // providna verzija samo LC znaka, generisana iz logotipa.
    badge: "/badge-icon.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
