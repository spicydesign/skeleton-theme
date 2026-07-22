/*
 * Demo-stage visualization: listens for standard storefront events on
 * this same document and animates the code panels — flashing the lines
 * that just ran, lighting up the request pipeline, and logging events
 * to the ticker. Also drives the agent console (standard actions) and
 * the cart reset. Presentation-only; all commerce logic lives in
 * product-form.js and the Liquid partials.
 *
 * Temporary import path until SFR ships the partial runtime.
 */
import { partials } from "@shopify/partial-rendering";

const stage = document.querySelector(".demo-stage");

if (stage) {
  const ticker = stage.querySelector("[data-demo-ticker]");
  const payloadCount = stage.querySelector("[data-payload-count]");
  const payloadMs = stage.querySelector("[data-payload-ms]");
  const typed = stage.querySelector("[data-typed]");

  const showMs = (ms) => {
    if (payloadMs) payloadMs.textContent = `${Math.round(ms)}ms`;
  };

  let lastRefreshMs = null;
  document.addEventListener("demo:refresh-timing", (event) => {
    lastRefreshMs = event.detail?.ms ?? null;
    if (lastRefreshMs != null) showMs(lastRefreshMs);
    updateDelorean();
  });

  /* Parks the DeLorean at the shipping bar's fill edge. The car sits
     outside the partial region, so it persists across swaps and CSS
     transitions carry it (and fade it in) between server states. */
  function updateDelorean() {
    const fill = document.querySelector(".shipping-bar__fill");
    const car = document.querySelector(".shipping-bar__delorean");
    if (!fill || !car) return;
    const pct = parseFloat(fill.style.getPropertyValue("--fill")) || 0;
    const unlocked = pct >= 100;
    car.classList.toggle("shipping-bar__delorean--warp", unlocked);
    car.style.setProperty("--delorean-x", unlocked ? "220%" : `${pct}%`);
    car.classList.toggle("shipping-bar__delorean--visible", pct > 0);
  }

  updateDelorean();

  const flash = (ids, amber = false) => {
    for (const id of ids) {
      for (const el of stage.querySelectorAll(`[data-l="${id}"]`)) {
        el.classList.remove("flash", "flash-amber");
        void el.offsetWidth;
        el.classList.add(amber ? "flash-amber" : "flash");
      }
    }
  };

  const hotStep = (n, cls = "") => {
    const el = stage.querySelector(`.demo-step[data-s="${n}"]`);
    if (!el) return;
    el.classList.add("hot");
    if (cls) el.classList.add(cls);
    setTimeout(() => el.classList.remove("hot", "net", "evt"), 900);
  };

  const runPipeline = () => {
    const seq = [
      [1, "", 0],
      [2, "", 160],
      [3, "net", 340],
      [4, "net", 560],
      [5, "", 800],
      [6, "evt", 1000],
    ];
    for (const [n, cls, delay] of seq) setTimeout(() => hotStep(n, cls), delay);
  };

  const log = (badge, cls, text) => {
    const t = new Date().toTimeString().slice(0, 8);
    const row = document.createElement("div");
    row.className = "demo-tick";
    row.innerHTML = `<span class="demo-tick__t">${t}</span><span class="demo-tick__b demo-tick__b--${cls}">${badge}</span><span>${text}</span>`;
    ticker.prepend(row);
    while (ticker.children.length > 5) ticker.lastChild.remove();
  };

  document.addEventListener("shopify:cart:lines-update", (event) => {
    const t0 = performance.now();
    log("evt", "evt", `shopify:cart:lines-update · action=${event.action ?? "—"} · context=${event.context ?? "—"}`);
    flash(["action-call", "handler"], true);
    runPipeline();

    event.promise?.then((result) => {
      const totalMs = performance.now() - t0;
      const count = result?.cart?.totalQuantity;
      if (count == null) return;
      if (payloadCount) payloadCount.textContent = count;
      const tier = count >= 3 ? "tier3" : count === 2 ? "tier2" : "tier1";
      flash([
        "refresh", "refresh2", "partial-open", tier, "partial-close", "payload",
        "ship-open", "ship-calc", "ship-fill",
        "mini-open", "mini-loop", "mini-total",
      ]);
      const total = result?.cart?.cost?.totalAmount?.amount;
      const refreshNote = lastRefreshMs != null ? ` · partials ${Math.round(lastRefreshMs)}ms` : "";
      log("net", "net", `cart now ${count} item${count === 1 ? "" : "s"}${total ? ` · $${total}` : ""}${refreshNote} · total ${Math.round(totalMs)}ms`);
    });
  });

  document.addEventListener("shopify:cart:error", (event) => {
    log("err", "evt", `cart error: ${event.error ?? "unknown"}`);
  });

  const typeCode = (text, cps = 70) =>
    new Promise((resolve) => {
      typed.textContent = "";
      const start = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        typed.textContent = text;
        resolve();
      };
      const frame = (now) => {
        if (done) return;
        const chars = Math.min(text.length, Math.floor(((now - start) / 1000) * cps));
        typed.textContent = text.slice(0, chars);
        if (chars >= text.length) return finish();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      setTimeout(finish, (text.length / cps) * 1000 + 1200);
    });

  stage.querySelector("[data-run-agent]")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const gid = btn.dataset.variantGid;
    btn.setAttribute("aria-busy", "true");
    log("ok", "ok", "agent thinking…");
    await typeCode(`await Shopify.actions.updateCart({\n  lines: [{ merchandiseId: "${gid.slice(0, 34)}…", quantity: 1 }],\n});`);
    await new Promise((r) => setTimeout(r, 300));

    try {
      const { userErrors } = await window.Shopify.actions.updateCart({
        lines: [{ merchandiseId: gid, quantity: 1 }],
      });
      log("ok", "ok", userErrors?.length ? `agent blocked: ${userErrors[0].message}` : "agent action resolved");
    } catch (error) {
      log("err", "evt", `agent failed: ${error}`);
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-remove-line]")) return;
    log("net", "net", "removing line · POST /cart/change.js → partials refresh");
    flash(["mini-open", "mini-loop", "mini-total"]);
    hotStep(4, "net");
    setTimeout(() => hotStep(5), 240);
  });

  document.addEventListener("demo:cart-updated", (event) => {
    const { itemCount, totalCents, ms } = event.detail ?? {};
    if (itemCount == null) return;
    if (payloadCount) payloadCount.textContent = itemCount;
    flash(["payload"]);
    const refreshNote = lastRefreshMs != null ? ` · partials ${Math.round(lastRefreshMs)}ms` : "";
    log("net", "net", `cart now ${itemCount} item${itemCount === 1 ? "" : "s"} · $${(totalCents / 100).toFixed(2)}${refreshNote}${ms != null ? ` · total ${Math.round(ms)}ms` : ""}`);
  });

  document.addEventListener("click", async (event) => {
    const btn = event.target.closest?.("[data-refresh-spotlight]");
    if (!btn) return;
    btn.setAttribute("aria-busy", "true");
    flash(["spot-open", "spot-refresh"]);
    hotStep(4, "net");
    setTimeout(() => hotStep(5), 240);
    const t0 = performance.now();
    try {
      await partials.refresh("product-spotlight");
      log("net", "net", `product-spotlight re-rendered · new pick · ${Math.round(performance.now() - t0)}ms`);
    } finally {
      btn.removeAttribute("aria-busy");
    }
  });

  stage.querySelector("[data-reset-cart]")?.addEventListener("click", async () => {
    await fetch("/cart/clear.js", { method: "POST" });
    await partials.refresh("cart-count", "cart-hype", "shipping-bar", "mini-cart");
    updateDelorean();
    document.querySelector(".cart-hype")?.setAttribute("hidden", "");
    if (typed) typed.textContent = "";
    if (payloadCount) payloadCount.textContent = "n";
    log("ok", "ok", "cart reset — fresh take");
  });
}
