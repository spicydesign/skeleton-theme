/*
 * Adds a product to the cart without a page reload, then refreshes the
 * cart-count partial so the header badge reflects the new quantity.
 * Temporary import path until SFR ships the partial runtime.
 */
import { partials } from "@shopify/partial-rendering";

const form = document.querySelector('form[action*="/cart/add"]');
const button = form?.querySelector('input[type="submit"]');

async function addToCart(event) {
  event.preventDefault();

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

form?.addEventListener("submit", addToCart);
