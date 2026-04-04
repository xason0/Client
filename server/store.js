import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'database.json');

export function defaultBundles() {
  return {
    mtn: [
      { size: '1 GB', price: 4.2 }, { size: '2 GB', price: 8.4 }, { size: '3 GB', price: 12.3 },
      { size: '4 GB', price: 16.2 }, { size: '5 GB', price: 20.5 }, { size: '6 GB', price: 25.0 },
      { size: '7 GB', price: 28.8 }, { size: '8 GB', price: 33.0 }, { size: '10 GB', price: 41.0 },
      { size: '15 GB', price: 61.0 }, { size: '20 GB', price: 80.0 }, { size: '25 GB', price: 98.0 },
      { size: '30 GB', price: 118.0 }, { size: '40 GB', price: 154.0 }, { size: '50 GB', price: 193.0 },
    ],
    telecel: [
      { size: '10 GB', price: 39.0 }, { size: '12 GB', price: 44.0 }, { size: '15 GB', price: 56.0 },
      { size: '20 GB', price: 75.0 }, { size: '25 GB', price: 94.0 }, { size: '30 GB', price: 110.0 },
      { size: '35 GB', price: 129.0 }, { size: '40 GB', price: 143.0 }, { size: '50 GB', price: 183.0 },
      { size: '100 GB', price: 350.0 },
    ],
    bigtime: [
      { size: '20 GB', price: 60.0 }, { size: '25 GB', price: 65.0 }, { size: '30 GB', price: 75.0 },
      { size: '40 GB', price: 85.0 }, { size: '50 GB', price: 95.0 }, { size: '60 GB', price: 135.0 },
      { size: '80 GB', price: 170.0 }, { size: '100 GB', price: 200.0 }, { size: '200 GB', price: 370.0 },
    ],
    ishare: [
      { size: '1 GB', price: 4.2 }, { size: '2 GB', price: 8.2 }, { size: '3 GB', price: 12.0 },
      { size: '4 GB', price: 16.0 }, { size: '5 GB', price: 19.0 }, { size: '6 GB', price: 23.0 },
      { size: '7 GB', price: 28.3 }, { size: '8 GB', price: 32.8 }, { size: '9 GB', price: 36.9 },
      { size: '10 GB', price: 39.0 }, { size: '15 GB', price: 55.0 },
    ],
  };
}

function demoAgentApplications() {
  return [
    {
      id: '6b1d96ab-1000-4000-8000-100000000001',
      full_name: 'Compaz El Byers',
      phone: '0535782467',
      payment_amount: 40,
      status: 'pending',
      applied_at: '2026-03-16T12:00:00.000Z',
    },
    {
      id: '6b1d96ab-1000-4000-8000-100000000002',
      full_name: 'Compaz El Byers',
      phone: '0535782467',
      payment_amount: 40,
      status: 'pending',
      applied_at: '2026-03-16T10:30:00.000Z',
    },
    {
      id: '5e1d6ce6-2000-4000-8000-200000000001',
      full_name: 'Martha Serwaaa',
      phone: '0537942613',
      payment_amount: 40,
      status: 'pending',
      applied_at: '2026-03-12T15:00:00.000Z',
    },
    {
      id: '5e1d6ce6-2000-4000-8000-200000000002',
      full_name: 'Martha Serwaaa',
      phone: '0537942613',
      payment_amount: 40,
      status: 'pending',
      applied_at: '2026-03-12T09:00:00.000Z',
    },
  ];
}

function emptyDb() {
  return {
    users: [],
    walletTransactions: [],
    orders: [],
    bundles: defaultBundles(),
    settings: { sidebarLogoUrl: 'https://files.catbox.moe/l3islw.jpg' },
    counters: { order: 0 },
    agentApplications: demoAgentApplications(),
    /** Admin image+caption promos shown to users (see GET /api/broadcasts). */
    broadcasts: [],
    /** userId (string) -> { userId, userEmail, userName, messages[], unreadForAdmin, unreadForUser, needsHuman, updatedAt } */
    supportThreads: {},
  };
}

export function readDb() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    const db = emptyDb();
    fs.writeFileSync(DATA_PATH, JSON.stringify(db));
    return db;
  }
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  let dirty = false;
  if (!raw.bundles || !Array.isArray(raw.bundles.mtn)) {
    raw.bundles = defaultBundles();
    dirty = true;
  }
  if (!Array.isArray(raw.walletTransactions)) {
    raw.walletTransactions = [];
    dirty = true;
  }
  if (!Array.isArray(raw.orders)) {
    raw.orders = [];
    dirty = true;
  }
  if (!raw.settings) {
    raw.settings = { sidebarLogoUrl: 'https://files.catbox.moe/l3islw.jpg' };
    dirty = true;
  }
  if (!raw.counters) {
    raw.counters = { order: 0 };
    dirty = true;
  }
  if (!Array.isArray(raw.agentApplications)) {
    raw.agentApplications = [];
    dirty = true;
  }
  if (!Array.isArray(raw.broadcasts)) {
    raw.broadcasts = [];
    dirty = true;
  }
  if (!raw.supportThreads || typeof raw.supportThreads !== 'object' || Array.isArray(raw.supportThreads)) {
    raw.supportThreads = {};
    dirty = true;
  }
  if (dirty) writeDb(raw);
  return raw;
}

export function writeDb(db) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(db));
}

let chain = Promise.resolve();

/** Serialize mutations to avoid corrupting the JSON file under concurrent requests. */
export function withDb(mutator) {
  chain = chain.then(() => {
    const db = readDb();
    const out = mutator(db);
    writeDb(db);
    return out;
  });
  return chain;
}
