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

async function refreshCartUI() {
  await partials.refresh("cart-count", "cart-hype");
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

const actionsConfigured = configureCartAction();

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

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.action.includes("/cart/add")) return;

  event.preventDefault();
  addToCart(form);
});
