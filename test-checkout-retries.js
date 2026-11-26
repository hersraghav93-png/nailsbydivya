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

async function browserChecks() {
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

  if (!sessionStorage.getItem("reload-test")) {
    await NailsApi.getCart();
    await openCheckoutModal();
    fill();
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

async function main() {
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
  const markup = storefront.slice(storefront.indexOf('<div class="cart-drawer-overlay"'), storefront.indexOf("</body>")).split("<script")[0];
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
    if (url.pathname.startsWith("/fixture/")) {
      mode = url.pathname.slice(9);
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
    if (url.pathname === "/checks.js") return js("addEventListener('load', () => (" + browserChecks.toString() + ")().catch(e => fetch('/fail', { method: 'POST', body: e.stack })))");
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
    "--disable-sync", "--disable-popup-blocking", "--no-first-run", "--no-default-browser-check",
    "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", "--user-data-dir=" + profile,
    "http://127.0.0.1:" + server.address().port,
  ], { stdio: "ignore", windowsHide: true });
  child.once("error", fail);
  const stopped = once(child, "exit");
  const timeout = setTimeout(() => fail(new Error("Browser checkout test timed out. Last requests: " + recent.join(", "))), 30000);
  try {
    await finished;
    console.log("PASS Chrome checkout: double submit, lost response, second tab, reload, account switch and logout");
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

main().catch(err => { console.error(err); process.exitCode = 1; });
