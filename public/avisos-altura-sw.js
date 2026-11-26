/* global self */
self.addEventListener("push", event => {
  let id = "";
  try { id = event.data?.json()?.tag ?? ""; } catch {}
  event.waitUntil(self.registration.showNotification("Lentia · Toma la altura", {
    body: "Hay un par vendido pendiente de medir. Abre Lentia para ver al paciente.",
    tag: `altura-${id}`,
    icon: "/logo.svg",
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const ventana = ventanas.find(cliente => new URL(cliente.url).origin === self.location.origin
      && !new URL(cliente.url).pathname.startsWith("/login"));
    if (ventana) {
      await ventana.focus();
      ventana.postMessage({ tipo: "LENTIA_AVISOS_ALTURA" });
      return;
    }
    await self.clients.openWindow("/?avisos=altura");
  })());
});
