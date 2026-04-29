import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DATA_DIR_URL = new URL("../../data/", import.meta.url);
const STORE_URL = new URL("../../data/activity.json", import.meta.url);
const MAX_ENTRIES = 120;

let writeQueue = Promise.resolve();

function getEmptyStore() {
  return {
    validations: [],
    webhooks: [],
  };
}

async function ensureStore() {
  await mkdir(DATA_DIR_URL, { recursive: true });

  try {
    await readFile(STORE_URL, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      await writeFile(STORE_URL, JSON.stringify(getEmptyStore(), null, 2));
      return;
    }

    throw error;
  }
}

async function readStore() {
  await ensureStore();

  try {
    const raw = await readFile(STORE_URL, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      validations: Array.isArray(parsed?.validations)
        ? parsed.validations
        : [],
      webhooks: Array.isArray(parsed?.webhooks)
        ? parsed.webhooks
        : [],
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return getEmptyStore();
    }

    throw error;
  }
}

async function writeStore(store) {
  await writeFile(STORE_URL, JSON.stringify(store, null, 2));
}

function queueMutation(mutator) {
  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    const nextStore = mutator(store);

    await writeStore(nextStore);

    return nextStore;
  });

  return writeQueue;
}

function trimEntries(entries) {
  return entries.slice(0, MAX_ENTRIES);
}

export async function recordValidationEvent({
  licenseKey,
  product,
  valid,
  status,
}) {
  return queueMutation((store) => {
    store.validations.unshift({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      keySuffix: typeof licenseKey === "string"
        ? licenseKey.slice(-8)
        : null,
      product,
      valid,
      status,
    });
    store.validations = trimEntries(store.validations);

    return store;
  });
}

export async function recordWebhookEvent({
  email,
  productName,
  eventType,
  source,
  transactionId,
  outcome,
  status,
}) {
  return queueMutation((store) => {
    store.webhooks.unshift({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      email,
      productName,
      eventType: eventType || null,
      source,
      transactionId,
      outcome,
      status,
    });
    store.webhooks = trimEntries(store.webhooks);

    return store;
  });
}

export async function getActivitySnapshot(limit = 8) {
  const store = await readStore();

  return {
    validations: store.validations.slice(0, limit),
    webhooks: store.webhooks.slice(0, limit),
  };
}
