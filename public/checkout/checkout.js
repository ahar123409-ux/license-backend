const params = new URLSearchParams(window.location.search);

const elements = {
  form: document.querySelector("#checkout-form"),
  launchButton: document.querySelector("#launch-button"),
  product: document.querySelector("#product"),
  plan: document.querySelector("#plan"),
  email: document.querySelector("#email"),
  statusPill: document.querySelector("#status-pill"),
  statusCopy: document.querySelector("#status-copy"),
  productNameValue: document.querySelector("#product-name-value"),
  transactionIdValue: document.querySelector("#transaction-id-value"),
  checkoutPageUrlValue: document.querySelector("#checkout-page-url-value"),
  checkoutUrlValue: document.querySelector("#checkout-url-value"),
  openInlineCheckout: document.querySelector("#open-inline-checkout"),
  openDirectLink: document.querySelector("#open-direct-link"),
};

const state = {
  clientToken: null,
  environment: "live",
  paddleReady: false,
  transactionId: null,
  checkoutUrl: null,
  checkoutPageUrl: null,
  productName: null,
};

function setStatus(tone, label, message) {
  elements.statusPill.className = `status-pill status-${tone}`;
  elements.statusPill.textContent = label;
  elements.statusCopy.textContent = message;
}

function setText(element, value) {
  element.textContent = value || "-";
}

function setDirectLink(url) {
  if (url) {
    elements.openDirectLink.href = url;
    elements.openDirectLink.classList.remove("disabled");
    elements.openDirectLink.setAttribute("aria-disabled", "false");
    return;
  }

  elements.openDirectLink.href = "#";
  elements.openDirectLink.classList.add("disabled");
  elements.openDirectLink.setAttribute("aria-disabled", "true");
}

function renderTransaction(payload = {}) {
  state.transactionId = payload.transactionId || state.transactionId;
  state.checkoutUrl = payload.checkoutUrl || state.checkoutUrl;
  state.checkoutPageUrl = payload.checkoutPageUrl || state.checkoutPageUrl;
  state.productName = payload.productName || state.productName;

  setText(elements.productNameValue, state.productName);
  setText(elements.transactionIdValue, state.transactionId);
  setText(elements.checkoutPageUrlValue, state.checkoutPageUrl);
  setText(elements.checkoutUrlValue, state.checkoutUrl);

  elements.openInlineCheckout.disabled = !state.transactionId || !state.paddleReady;
  setDirectLink(state.checkoutUrl);
}

function normalizePlan(plan) {
  return plan === "lifetime" ? "lifetime" : "yearly";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error || payload?.message || "Request failed.";
    throw new Error(message);
  }

  return payload;
}

async function loadCheckoutConfig() {
  const payload = await fetchJson("/checkout-config");
  state.clientToken = payload.clientToken || null;
  state.environment = payload.environment || "live";

  if (!window.Paddle) {
    setStatus(
      "error",
      "Script error",
      "Paddle.js did not load. Check your internet connection and reload the page.",
    );
    return;
  }

  if (!state.clientToken) {
    setStatus(
      "warning",
      "Token needed",
      "Add PADDLE_CLIENT_TOKEN to your environment if you want this page to open Paddle checkout directly.",
    );
    return;
  }

  if (state.environment === "sandbox") {
    window.Paddle.Environment.set("sandbox");
  }

  window.Paddle.Initialize({
    token: state.clientToken,
  });

  state.paddleReady = true;
  renderTransaction();
}

function openPaddleCheckout(transactionId) {
  if (!state.paddleReady || !transactionId) {
    return;
  }

  window.Paddle.Checkout.open({
    transactionId,
    settings: {
      displayMode: "overlay",
      theme: "light",
      variant: "one-page",
      allowLogout: false,
      locale: "en",
    },
  });
}

async function createCheckout({ autoOpen = true } = {}) {
  const product = elements.product.value.trim();
  const plan = normalizePlan(elements.plan.value);
  const email = elements.email.value.trim();

  if (!product) {
    setStatus("error", "Missing data", "Enter a product name first.");
    return;
  }

  elements.launchButton.disabled = true;
  setStatus("working", "Creating", "Creating a Paddle transaction...");

  try {
    const payload = await fetchJson("/create-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product,
        plan,
        email,
      }),
    });

    renderTransaction(payload);

    if (state.paddleReady && payload.transactionId && autoOpen) {
      setStatus("working", "Opening", "Opening Paddle checkout...");
      openPaddleCheckout(payload.transactionId);
      setStatus(
        "success",
        "Opened",
        "Checkout opened. Complete payment in the Paddle window.",
      );
      return;
    }

    const fallbackMessage = payload.requiresClientToken
      ? "Transaction created. Add PADDLE_CLIENT_TOKEN to open checkout directly on this page."
      : "Transaction created. Use one of the links below to continue.";

    setStatus("success", "Created", fallbackMessage);
  } catch (error) {
    setStatus("error", "Failed", error.message);
  } finally {
    elements.launchButton.disabled = false;
  }
}

function hydrateFromQuery() {
  const product = params.get("product");
  const plan = params.get("plan");
  const email = params.get("email");

  if (product) {
    elements.product.value = product;
  }

  if (plan) {
    elements.plan.value = normalizePlan(plan);
  }

  if (email) {
    elements.email.value = email;
  }
}

async function handleQueryDrivenLaunch() {
  const transactionId = params.get("_ptxn") || params.get("transactionId");
  const autoStart = params.get("autostart") === "1" || params.get("buy") === "1";

  if (transactionId) {
    renderTransaction({
      transactionId,
      checkoutPageUrl: window.location.href,
    });

    if (state.paddleReady) {
      setStatus("working", "Opening", "Opening Paddle checkout...");
      openPaddleCheckout(transactionId);
      setStatus(
        "success",
        "Opened",
        "Checkout opened for the existing transaction.",
      );
      return;
    }

    setStatus(
      "warning",
      "Token needed",
      "This transaction is ready, but you still need PADDLE_CLIENT_TOKEN to open Paddle checkout on this page.",
    );
    return;
  }

  if (autoStart) {
    await createCheckout({ autoOpen: true });
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createCheckout({ autoOpen: true });
});

elements.openInlineCheckout.addEventListener("click", () => {
  if (!state.transactionId) {
    return;
  }

  setStatus("working", "Opening", "Opening Paddle checkout...");
  openPaddleCheckout(state.transactionId);
  setStatus(
    "success",
    "Opened",
    "Checkout opened. Complete payment in the Paddle window.",
  );
});

async function boot() {
  hydrateFromQuery();
  await loadCheckoutConfig();
  await handleQueryDrivenLaunch();
}

boot().catch((error) => {
  setStatus("error", "Failed", error.message);
});
