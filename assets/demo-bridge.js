/*
 * Demo bridge (demo-store only): when the storefront runs inside the
 * split-screen demo stage iframe, forward standard storefront events to
 * the stage so it can animate the matching code, and execute standard
 * actions the stage requests (the "agent" act).
 */
const STAGE_ORIGINS = ["http://127.0.0.1:4321", "http://localhost:4321"];

if (window.parent !== window) {
  const post = (data) => {
    for (const origin of STAGE_ORIGINS) {
      try {
        window.parent.postMessage(data, origin);
      } catch {
        /* stage not on this origin */
      }
    }
  };

  const EVENT_TYPES = [
    "shopify:page:view",
    "shopify:product:view",
    "shopify:product:select",
    "shopify:cart:view",
    "shopify:cart:lines-update",
    "shopify:cart:note-update",
    "shopify:cart:discount-update",
    "shopify:cart:error",
    "shopify:collection:view",
    "shopify:collection:update",
    "shopify:search:update",
  ];

  for (const type of EVENT_TYPES) {
    document.addEventListener(type, (event) => {
      post({
        kind: "event",
        type,
        phase: "dispatched",
        action: event.action ?? null,
        context: event.context ?? null,
      });

      event.promise?.then((result) => {
        post({
          kind: "event",
          type,
          phase: "resolved",
          itemCount: result?.cart?.totalQuantity ?? null,
          cartTotal: result?.cart?.cost?.totalAmount?.amount ?? null,
        });
      });
    });
  }

  window.addEventListener("message", async (message) => {
    if (!STAGE_ORIGINS.includes(message.origin)) return;

    const { kind, payload } = message.data ?? {};

    if (kind === "demo:clearCart") {
      await fetch("/cart/clear.js", { method: "POST" });
      window.location.reload();
      return;
    }

    if (kind !== "agent:updateCart") return;

    try {
      const lines = (payload?.lines ?? []).map((line) => {
        if (line.merchandiseId) return line;
        const id = document.querySelector('form[action*="/cart/add"] [name="id"]')?.value;
        return { ...line, merchandiseId: `gid://shopify/ProductVariant/${id}` };
      });

      const result = await window.Shopify.actions.updateCart({ ...payload, lines });
      post({
        kind: "agent:result",
        ok: !result.userErrors?.length,
        itemCount: result?.cart?.totalQuantity ?? null,
      });
    } catch (error) {
      post({ kind: "agent:result", ok: false, error: String(error) });
    }
  });

  post({ kind: "bridge:ready" });
}
