// Helpa's service worker: shows the notifications Helpa's agents send (your part arrived, a reminder is due) and
// opens the right job when one is tapped.

self.addEventListener("push", (event) => {
  let message = { title: "Helpa", body: "", url: "/" };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    // a push with no readable payload still shows something
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: message.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
