/*
 * Cart interactions via Standard Actions + partial rendering.
 *
 * The theme configures Shopify.actions.updateCart so that ANY caller —
 * our own product forms, an app, or an agent — runs the same flow: the
 * default Storefront API mutation, then a refresh of the cart-count and
 * cart-hype partials. Standard events (shopify:cart:lines-update, etc.)
 * auto-emit when the configured action succeeds.
 *
 * Form submits are delegated at the document level so forms living
 * inside partial regions (replaced wholesale on refresh) stay wired.
 *
 * Temporary import path until SFR ships the partial runtime.
 */
import { partials } from "@shopify/partial-rendering";

const CART_REGIONS = ["cart-count", "cart-hype", "shipping-bar", "mini-cart"];

async function refreshCartUI() {
  const present = CART_REGIONS.filter((name) => {
    try {
      return Boolean(partials.get(name));
    } catch {
      return true;
    }
  });

  if (present.length) {
    const t0 = performance.now();
    await partials.refresh(...present);
    document.dispatchEvent(
      new CustomEvent("demo:refresh-timing", {
        detail: { ms: performance.now() - t0, regions: present.length },
      }),
    );
  }
  document.querySelector(".cart-hype")?.removeAttribute("hidden");
}

function configureCartAction() {
  if (!window.Shopify?.actions?.updateCart?.configure) return false;

  window.Shopify.actions.updateCart.configure({
    async handler(defaultHandler, payload) {
      const result = await defaultHandler();

      if (!result.userErrors?.length) {
        await refreshCartUI();
      }

      return result;
    },
  });

  return true;
}

/*
 * The actions runtime is injected by the storefront after page load, so
 * it may not exist when this module evaluates. Retry briefly until it
 * appears, then configure once.
 */
let actionsConfigured = configureCartAction();

if (!actionsConfigured) {
  let attempts = 0;
  const timer = setInterval(() => {
    actionsConfigured = configureCartAction();
    attempts += 1;
    if (actionsConfigured || attempts >= 40) clearInterval(timer);
  }, 250);
}

async function addToCart(form) {
  const button = form.querySelector('[type="submit"]');
  button?.setAttribute("aria-busy", "true");

  try {
    if (actionsConfigured) {
      const data = new FormData(form);
      const variantId = data.get("id");
      const quantity = Number(data.get("quantity")) || 1;

      const { userErrors } = await window.Shopify.actions.updateCart(
        {
          lines: [
            {
              merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
              quantity,
            },
          ],
        },
        { event: { context: "product" } },
      );

      if (userErrors?.length) {
        throw new Error(userErrors[0].message);
      }
    } else {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Add to cart failed: HTTP ${response.status}`);
      }

      await refreshCartUI();
    }
  } catch (error) {
    console.error(error);
    form.submit();
  } finally {
    button?.removeAttribute("aria-busy");
  }
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest?.("[data-remove-line]");
  if (!btn) return;

  btn.setAttribute("aria-busy", "true");
  const t0 = performance.now();
  try {
    const response = await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: btn.dataset.removeLine, quantity: 0 }),
    });
    if (!response.ok) throw new Error(`Remove line failed: HTTP ${response.status}`);
    const cartData = await response.json();
    await refreshCartUI();
    document.dispatchEvent(
      new CustomEvent("demo:cart-updated", {
        detail: {
          itemCount: cartData.item_count,
          totalCents: cartData.total_price,
          ms: performance.now() - t0,
        },
      }),
    );
  } catch (error) {
    console.error(error);
  } finally {
    btn.removeAttribute("aria-busy");
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.action.includes("/cart/add")) return;

  event.preventDefault();
  addToCart(form);
});
