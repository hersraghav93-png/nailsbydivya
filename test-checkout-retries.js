"use strict";

// Run with node test-checkout-retries.js [Chrome/Chromium executable].
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");

async function browserChecks(mobile) {
  const $ = id => document.getElementById(id);
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = async fn => {
    const end = Date.now() + 5000;
    while (!await fn()) {
      if (Date.now() > end) throw new Error("Browser condition timed out: " + fn);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  };
  const state = async () => (await fetch("/state")).json();
  const mode = name => fetch("/fixture/" + name, { method: "POST" });
  const form = $("checkout-order-form");
  const fill = () => {
    for (const [key, value] of Object.entries({
      name: "Browser Fixture", phone: "9000000001", email: "browser@example.invalid",
      "addr-line1": "123 Fixture Road", "addr-city": "Delhi", "addr-state": "Delhi", "addr-pin": "110001",
    })) $("checkout-" + key).value = value;
  };
  const submit = () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  const receiptShown = () => $("checkout-confirmation-view").style.display === "flex";
  const pending = () => JSON.parse(sessionStorage.getItem("nbd_pending_checkout"));
  const retryable = () => $("checkout-error-feedback").style.display === "block" && !$("checkout-place-order-btn").disabled;
  const switchTo = name => {
    window.testBuyer = name;
    document.dispatchEvent(new CustomEvent("nails:auth-changed", { detail: { user: window.NailsAuth.getUser() } }));
  };

  check(location.hash === "#divv" && $("divv-widget-modal").getAttribute("aria-hidden") === "false", "The Divv deep link opens on page load");
  check($("divv-widget-body").textContent.includes("Help me choose a shape"), "The deep link renders the initialized Divv welcome screen");
  $("divv-close-btn").click();

  if (!sessionStorage.getItem("reload-test")) {
    check(mobile ? innerWidth < 768 : innerWidth >= 1024, "Checkout must run in the requested desktop or mobile layout");
    const { products } = await NailsApi.listProducts();
    check(products.length === 22, "Expected 22 fixture catalog products");
    const amount = element => Number(element?.textContent.replace(/[^0-9.]/g, ""));
    for (const product of products) {
      const card = document.querySelector('[data-product-sku="' + product.sku + '"]');
      const selector = product.isPromoApplied ? ".product-price-promo" : ".product-price-regular";
      await wait(() => amount(card.querySelector(selector)) === product.effectivePrice);
      openProductModalFromCard(card);
      await wait(() => amount($("product-modal-price").querySelector(selector)) === product.effectivePrice);
      if (product.isPromoApplied) {
        check(amount($("product-modal-price").querySelector("del")) === product.basePrice, "Show the original price for a promotion");
      }
      closeAllModals();
    }
    $("shop-divv-help").click();
    check($("divv-widget-modal").getAttribute("aria-hidden") === "false", "The shopping help button opens Divv");
    $("divv-close-btn").click();

    await openServiceModal("Safe Extension Removal", "Removal details");
    const serviceForm = $("service-booking-form");
    check(!$("service-quote-intro").hidden && serviceForm.style.display === "none", "Quote first without personal details");
    check($("service-price-value").textContent === "Custom Quote", "Show the quote-based price");
    check(new URL($("service-quote-whatsapp").href).hostname === "wa.me", "Offer the studio WhatsApp quote");
    serviceForm.dispatchEvent(new Event("submit", { cancelable: true }));
    $("service-quote-continue").click();
    check($("service-quote-intro").hidden && serviceForm.style.display === "flex", "Keep scheduling available after the quote step");
    closeAllModals();
    await openServiceModal("Nail Extensions", "Extension details");
    check($("service-quote-intro").hidden && serviceForm.style.display === "flex", "Regular booking opens directly");
    check($("service-price-value").textContent === "From ₹999", "Keep regular service starting price");
    closeAllModals();

    await NailsApi.getCart();
    await openCartDrawer();
    check(amount($("cart-total-val")) === 599, "Cart renders the server total");
    await mode("empty-cart");
    await openCartDrawer();
    check($("cart-empty-state")?.style.display === "flex", "Removing the last cart item restores the empty state");
    await mode("restore-cart");
    await openCheckoutModal();
    check(amount($("checkout-total-val")) === 599, "Checkout renders the server total");
    fill();
    const phone = $("checkout-phone");
    const setPhone = value => {
      phone.value = value;
      phone.dispatchEvent(new Event("input", { bubbles: true }));
    };
    for (const value of ["abc", "abc9000000001", "+1 9000000001", "90000--00001", "5000000001", "900000001"]) {
      setPhone(value);
      check(!phone.validity.valid && phone.getAttribute("aria-invalid") === "true", "Reject malformed phone input");
      check(!$("checkout-phone-error").hidden, "Show an inline error for the malformed phone");
      submit();
    }
    check((await state()).creates.length === 0 && !pending(), "Malformed phone must not create a checkout attempt");
    for (const value of ["9000000001", "90000 00001", "91-90000-00001", "0091 9000000001", "09000000001", "+91 90000-00001"]) {
      setPhone(value);
      check(phone.validity.valid && $("checkout-phone-error").hidden, "Accept valid Indian formats and clear the error");
    }
    await mode("lose");
    submit();
    submit();
    await wait(retryable);
    const first = await state();
    check(first.creates.length === 1 && first.orders === 1, "Double submit must send one creation");
    const old = pending();
    check(old.key === first.creates[0].key && old.cartId === first.creates[0].cart, "Persist the actual cart and key");
    check(!JSON.stringify(old).includes("Fixture") && !JSON.stringify(old).includes("example.invalid"), "No delivery or contact data in retry storage");
    const otherTab = window.open("/other-tab", "checkout-other-tab");
    await wait(async () => (await state()).items.guest === 1);
    otherTab?.close();
    submit();
    await wait(receiptShown);
    const after = await state();
    check(after.creates.length === 2 && after.creates[1].key === old.key && after.orders === 1, "Lost response must retry with original key");
    check(after.clears === 0 && after.items.guest === 1, "Preserve item added in a second tab");
    check(!pending() && $("checkout-confirmation-order-number").textContent === "TEST-1", "Display the original server receipt");

    await openCheckoutModal();
    fill();
    await mode("lose");
    submit();
    await wait(retryable);
    sessionStorage.setItem("reload-test", pending().key);
    location.reload();
    return;
  }

  await openCartDrawer();
  check($("cart-check-receipt").getClientRects().length > 0, "Retry must be reachable from an empty bag after reload");
  $("cart-check-receipt").click();
  await wait(receiptShown);
  let current = await state();
  check(current.lookups.at(-1).key === sessionStorage.getItem("reload-test") && current.orders === 2, "Reload must use a lookup without another purchase");
  check($("checkout-confirmation-order-number").textContent === "TEST-2", "Recovered receipt must be genuine");
  switchTo("a");
  await openCheckoutModal();
  fill();
  window.tokenBuyer = "b";
  const requestsBeforeMismatch = (await state()).creates.length;
  submit();
  await wait(retryable);
  check((await state()).creates.length === requestsBeforeMismatch, "A mismatched Firebase subject must stop the POST");
  window.tokenBuyer = null;
  await mode("hold");
  const oldSubmit = form.onsubmit;
  submit();
  await wait(async () => (await state()).holding);
  switchTo("b");
  check(!pending() && !$("checkout-name").value && $("checkout-modal").getAttribute("aria-hidden") === "true", "Clear former buyer's retry metadata, form and modal");
  await mode("release");
  await wait(() => !$("checkout-place-order-btn").disabled);
  await oldSubmit({ preventDefault() {} });
  current = await state();
  check(current.creates.at(-1).buyer === "a" && current.creates.every(r => r.buyer !== "b"), "Former checkout must never be submitted for the new account");
  check(!$("checkout-confirmation-order-number").textContent, "Late response must not display another buyer's receipt");
  await openCheckoutModal();
  fill();
  submit();
  await wait(receiptShown);
  current = await state();
  check(current.creates.at(-1).buyer === "b" && current.creates.at(-1).key !== current.creates.at(-2).key, "New buyer gets a fresh attempt");
  switchTo(null);
  check(!$("checkout-email").value && !pending(), "Logout clears previous buyer data");
  await wait(() => !$("checkout-confirmation-order-number").textContent);
  check(localStorage.getItem("nbd_cart_session") === "fixture-guest-session", "Account cart response must not replace guest capability");
  await fetch("/pass", { method: "POST" });
}

async function main(mobile) {
  const chrome = process.argv[2] || [
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/chromium", "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find(p => fs.existsSync(p));
  assert.ok(chrome, "Supply the path to an installed Chromium browser");
  const carts = Object.fromEntries(["guest", "a", "b"].map(b => [b, { id: randomUUID(), sessionToken: "fixture-" + b + "-session" }]));
  const items = { guest: 1, a: 1, b: 1 };
  const receipts = new Map(), creates = [], lookups = [];
  let clears = 0, mode, release;
  let pass, fail;
  const finished = new Promise((resolve, reject) => { pass = resolve; fail = reject; });
  const storefront = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const shopStart = storefront.indexOf('<section class="shop-section');
  const shop = storefront.slice(shopStart, storefront.indexOf("</section>", shopStart) + "</section>".length);
  const skus = [...shop.matchAll(/<article class="product-card"[^>]*data-product-sku="([^"]+)"/g)].map(match => match[1]);
  assert.equal(skus.length, 22);
  const products = skus.map((sku, index) => ({
    sku, basePrice: 800 + index, effectivePrice: index ? 599 : 800,
    isPromoApplied: Boolean(index), promoName: "Test offer", isAvailable: true,
  }));
  const dialogs = storefront.slice(storefront.indexOf('<div class="modal-overlay" id="product-modal"'), storefront.indexOf("</body>")).split("<script")[0];
  const divvStart = storefront.indexOf('<section class="studio-consult');
  const divvHelp = storefront.slice(divvStart, storefront.indexOf("</section>", divvStart) + "</section>".length);
  const markup = '<meta name="viewport" content="width=device-width, initial-scale=1">' + shop + divvHelp + dialogs;
  assert.ok(markup.includes('id="checkout-order-form"') && markup.includes('id="cart-drawer-overlay"'));
  const recent = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    recent.push(req.method + " " + url.pathname);
    if (recent.length > 12) recent.shift();
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    const js = content => { res.setHeader("Content-Type", "application/javascript"); res.end(content); };
    const token = req.headers.authorization?.slice(7);
    const buyer = token ? JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub : "guest";
    if (url.pathname === "/state") return json(200, { creates, lookups, items, clears, orders: receipts.size, holding: !!release });
    if (url.pathname === "/api/products") return json(200, { products });
    if (url.pathname === "/api/services") return json(200, { schedule: {
      timeZone: "Asia/Kolkata", today: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata" }).format(new Date()),
      openWeekdays: [2, 3, 4, 5, 6, 0], opensAt: "12:00", closesAt: "18:00", minNoticeDays: 2,
      earliestDate: "2026-12-01", latestDate: "2027-01-26",
      requestWindows: ["12:30 PM - 02:30 PM", "03:00 PM - 05:00 PM"],
    }, services: [
      { id: "gel_extensions", pricingDisplay: "From ₹999", addons: [] },
      { id: "extension_removal", pricingDisplay: "Custom Quote", addons: [] },
    ] });
    if (url.pathname === "/api/bookings") {
      fail(new Error("Quote-first checks must not submit an appointment"));
      return json(400, {});
    }
    if (url.pathname.startsWith("/fixture/")) {
      mode = url.pathname.slice(9);
      if (mode === "empty-cart") items.guest = 0;
      if (mode === "restore-cart") items.guest = 1;
      if (mode === "release" && release) { release(); release = null; }
      return json(200, {});
    }
    if (url.pathname === "/pass" || url.pathname === "/fail") {
      json(200, {});
      if (url.pathname === "/pass") pass();
      else fail(new Error(body + "\nLast requests: " + recent.join(", ") + "\nCreates: " + creates.length));
      return;
    }
    if (url.pathname === "/api/cart" && req.method === "DELETE") { clears++; items[buyer] = 0; return json(200, {}); }
    if (url.pathname === "/api/cart/items" || url.pathname === "/api/cart") {
      if (req.method === "POST") items[buyer]++;
      res.setHeader("X-Cart-Session", carts[buyer].sessionToken);
      const line = { productName: "Synthetic set", quantity: 1, shape: "Round", length: "Short", sizingPreset: "M", itemTotal: 599 };
      return json(200, { cart: carts[buyer], items: Array(items[buyer]).fill(line), totals: { totalAmount: items[buyer] * 599 } });
    }
    if (url.pathname === "/api/auth/me") return json(200, { user: buyer === "guest" ? null : { id: buyer } });
    if (url.pathname === "/api/customer/addresses") return json(200, { addresses: [] });
    if (url.pathname === "/api/orders") {
      const data = JSON.parse(body);
      const entry = { buyer, cart: data.cart_id, key: data.idempotency_key };
      (data.retry_only ? lookups : creates).push(entry);
      if (buyer === "guest" && req.headers["x-cart-session"] !== carts.guest.sessionToken) return json(403, {});
      if (data.cart_id !== carts[buyer].id) return json(404, {});
      const scope = JSON.stringify([buyer, entry.key]);
      const prior = receipts.get(scope);
      if (prior) return json(200, { order: prior, isDuplicate: true });
      if (data.retry_only) return json(404, { code: "CHECKOUT_ATTEMPT_NOT_FOUND" });
      if (!items[buyer]) return json(400, { code: "EMPTY_CART" });
      const order = { id: randomUUID(), orderNumber: "TEST-" + (receipts.size + 1), totalAmount: 599, orderStatus: "PENDING", paymentStatus: "PENDING", shippingAddress: data.shipping_address };
      receipts.set(scope, order);
      items[buyer] = 0;
      if (mode === "lose") {
        mode = null;
        res.writeHead(201, { "Content-Type": "application/json", "Content-Length": "2048" });
        res.write('{"order":');
        setTimeout(() => res.destroy(), 10);
        return;
      }
      if (mode === "hold") await new Promise(resolve => { release = resolve; });
      return json(201, { order });
    }
    if (url.pathname === "/script.js" || url.pathname === "/account-api.js") return js(fs.readFileSync(path.join(__dirname, url.pathname.slice(1))));
    if (url.pathname === "/fixture.js") return js(`
      window.NAILS_CONFIG = { apiUrl: location.origin };
      window.NailsAuth = {
        getUser: () => window.testBuyer ? { firebase_uid: testBuyer } : null,
        getToken: async () => {
          const sub = window.tokenBuyer || window.testBuyer;
          return sub ? "fixture." + btoa(JSON.stringify({ sub })) + ".fixture" : null;
        },
      };
      window.alert = message => { throw new Error(message); };
    `);
    if (url.pathname === "/checks.js") return js("addEventListener('load', () => (" + browserChecks.toString() + ")(" + mobile + ").catch(e => fetch('/fail', { method: 'POST', body: e.stack })))");
    if (url.pathname === "/add.js") return js("NailsApi.addToCart({sku:'fixture'});");
    if (url.pathname !== "/" && url.pathname !== "/other-tab") return json(404, {});
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const scripts = '<script src="/fixture.js"></script><script src="/account-api.js"></script>';
    res.end(url.pathname === "/other-tab" ? scripts + '<script src="/add.js"></script>' :
      markup + scripts + '<script src="/script.js"></script><script src="/checks.js"></script>');
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const tmp = fs.realpathSync(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(tmp, "nbd-checkout-browser-"));
  const child = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-component-update",
    mobile ? "--window-size=390,844" : "--window-size=1440,900",
    "--disable-sync", "--disable-popup-blocking", "--no-first-run", "--no-default-browser-check",
    "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", "--user-data-dir=" + profile,
    "http://127.0.0.1:" + server.address().port + "/#divv",
  ], { stdio: "ignore", windowsHide: true });
  child.once("error", fail);
  const stopped = once(child, "exit");
  const timeout = setTimeout(() => fail(new Error("Browser checkout test timed out. Last requests: " + recent.join(", "))), 30000);
  try {
    await finished;
    console.log("PASS Chrome " + (mobile ? "mobile" : "desktop") + ": 22 catalog prices, quote-first booking, guest phone validation, cart totals, double submit, lost response, second tab, reload, account switch and logout");
  } finally {
    clearTimeout(timeout);
    child.kill();
    await stopped;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(fs.realpathSync(profile)), tmp);
    assert.ok(path.basename(profile).startsWith("nbd-checkout-browser-"));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

main(false).then(() => main(true)).catch(err => { console.error(err); process.exitCode = 1; });
