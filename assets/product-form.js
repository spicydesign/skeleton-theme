/*
 * Adds products to the cart without a page reload, then refreshes the
 * cart-count and cart-hype partials so the header badge and the
 * encouragement message reflect the new cart state.
 *
 * Uses submit delegation so it also catches forms that live inside
 * partial regions (like the cart-hype suggestion card), which are
 * replaced wholesale on every refresh.
 *
 * Temporary import path until SFR ships the partial runtime.
 */
import { partials } from "@shopify/partial-rendering";

async function addToCart(form) {
  const button = form.querySelector('[type="submit"]');
  button?.setAttribute("aria-busy", "true");

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Add to cart failed: HTTP ${response.status}`);
    }

    await partials.refresh("cart-count", "cart-hype");
    document.querySelector(".cart-hype")?.removeAttribute("hidden");
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
