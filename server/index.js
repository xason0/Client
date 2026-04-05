import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readDb, writeDb, withDb, defaultBundles } from './store.js';
import {
  sanitizeBroadcastTitle,
  splitBroadcastCaption,
  normalizeBroadcastCaptionForStorage,
  extractPackedTitleFromCaption,
} from '../shared/broadcastSanitize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-dataplus-secret-change-me';
/** Legacy installs often set ADMIN_PIN=1234 in env; that overrides code defaults, so we migrate to the current PIN. */
const ADMIN_PIN_ENV = process.env.ADMIN_PIN != null ? String(process.env.ADMIN_PIN).trim() : '';
const ADMIN_PIN =
  !ADMIN_PIN_ENV || ADMIN_PIN_ENV === '1234' ? '0701' : ADMIN_PIN_ENV;
if (ADMIN_PIN_ENV === '1234') {
  console.warn(
    '[dataplus-api] ADMIN_PIN was 1234 in environment; using 0701. Set ADMIN_PIN=0701 in hosting env and remove 1234.'
  );
}
const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();
/** Keep in sync with `MIN_WALLET_TOPUP_GHS` in `src/App.jsx`. Override via WALLET_MIN_TOPUP_GHS. */
const MIN_WALLET_TOPUP_GHS = Math.max(0.01, Number(process.env.WALLET_MIN_TOPUP_GHS ?? 10));
const MIN_WALLET_TOPUP_PESEWAS = Math.round(MIN_WALLET_TOPUP_GHS * 100);

if (JWT_SECRET === 'dev-dataplus-secret-change-me' || !process.env.ADMIN_PIN) {
  console.warn('[dataplus-api] Using default JWT_SECRET or ADMIN_PIN — set env vars in production.');
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(
  express.json({
    limit: '2mb',
    verify: (req, res, buf) => {
      const base = (req.originalUrl || '').split('?')[0];
      if (base === '/api/paystack/webhook') {
        req.paystackRawBody = buf;
      }
    },
  })
);

function bearer(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7).trim();
}

function requireAuth(req, res, next) {
  const tok = bearer(req);
  if (!tok) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const p = jwt.verify(tok, JWT_SECRET);
    if (p.a === 1) return res.status(403).json({ error: 'Use user session for this action' });
    const uid = p.sub ?? p.userId;
    if (uid == null || uid === '') return res.status(401).json({ error: 'Unauthorized' });
    req.userId = uid;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function isAdminTokenPayload(p) {
  return p && p.a === 1;
}

function requireAdmin(req, res, next) {
  const tok = bearer(req);
  if (!tok) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const p = jwt.verify(tok, JWT_SECRET);
    if (isAdminTokenPayload(p)) {
      req.adminPin = true;
      return next();
    }
    const adminUid = p.sub ?? p.userId;
    if (adminUid != null && adminUid !== '') {
      const db = readDb();
      const u = db.users.find((x) => x.id === adminUid);
      if (u && u.role === 'admin') {
        req.userId = u.id;
        req.adminUser = u;
        return next();
      }
    }
  } catch {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return res.status(403).json({ error: 'Admin access required' });
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

function paystackConfigured() {
  return Boolean(PAYSTACK_SECRET_KEY);
}

const DEFAULT_CLIENT_APP_ORIGIN = (process.env.NODE_ENV === 'production' ? 'https://www.dataplusghs.com' : 'http://localhost:5173');
function resolveClientAppOrigin(req) {
  const configured = (process.env.CLIENT_PUBLIC_URL || process.env.PAYSTACK_CALLBACK_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');

  if (req && process.env.NODE_ENV === 'production') {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim() || 'https';
    if (host) return `${proto}://${host}`.replace(/\/$/, '');
  }

  return DEFAULT_CLIENT_APP_ORIGIN.replace(/\/$/, '');
}

async function fetchPaystack(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Paystack API timed out — check outbound HTTPS from this server');
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

async function paystackInitializeTransaction({ email, amountPesewas, reference, metadata, callbackUrl }) {
  const res = await fetchPaystack('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: amountPesewas,
      reference,
      currency: 'GHS',
      metadata,
      callback_url: callbackUrl || undefined,
      channels: ['card', 'mobile_money', 'bank_transfer', 'ussd'],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.status) {
    throw new Error(data.message || data.error || 'Paystack initialize failed');
  }
  return data.data;
}

async function paystackVerifyTransaction(reference) {
  const enc = encodeURIComponent(reference);
  const res = await fetchPaystack(`https://api.paystack.co/transaction/verify/${enc}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.status) {
    throw new Error(data.message || data.error || 'Verification failed');
  }
  return data.data;
}

function ghsFromPaystackAmount(amountPesewas) {
  const n = Number(amountPesewas);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n) / 100;
}

function applyWalletTopUpFromPaystack(db, reference, userId, amountGhs) {
  const txs = db.walletTransactions || [];
  const exists = txs.some(
    (t) => t.reference === reference && String(t.user_id) === String(userId) && t.type === 'topup'
  );
  if (exists) {
    const u = db.users.find((x) => x.id === userId);
    return u ? { balance: u.balance ?? 0, already: true } : null;
  }
  const u = db.users.find((x) => x.id === userId);
  if (!u) return null;
  u.balance = (u.balance ?? 0) + amountGhs;
  u.wallet_updated_at = new Date().toISOString();
  if (!Array.isArray(db.walletTransactions)) db.walletTransactions = [];
  db.walletTransactions.push({
    id: randomUUID(),
    user_id: u.id,
    user_email: u.email,
    full_name: u.full_name,
    type: 'topup',
    amount: amountGhs,
    reference,
    description: 'Wallet top-up (Paystack)',
    status: 'completed',
    created_at: new Date().toISOString(),
  });
  return { balance: u.balance, already: false };
}

function enrichOrder(db, o) {
  const u = db.users.find((x) => x.id === o.user_id);
  const net = (o.network || 'mtn').toString().toLowerCase();
  const bundle = (o.bundle_size || '').toString();
  const amt = o.amount ?? o.bundle_price ?? 0;
  return {
    ...o,
    customer_name: u?.full_name || 'Unknown',
    user_email: u?.email || '',
    user_full_name: u?.full_name,
    full_name: u?.full_name,
    email: u?.email,
    bundle_size: bundle,
    amount: typeof amt === 'number' ? amt : parseFloat(amt) || 0,
    network: net,
    reference: o.reference || o.payment_reference,
    payment_reference: o.reference,
    created_at: o.created_at,
    status: o.status || 'completed',
  };
}

function computeStats(db) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const orders = db.orders || [];
  const txs = db.walletTransactions || [];
  const users = db.users || [];

  const dayOrders = orders.filter((o) => {
    const t = o.created_at ? Date.parse(o.created_at) : 0;
    return t >= startToday;
  });

  const orderAmount = (o) => {
    const v = o.amount ?? o.bundle_price;
    return typeof v === 'number' ? v : parseFloat(v) || 0;
  };

  const dailyRevenue = dayOrders.filter((o) => o.status === 'completed').reduce((s, o) => s + orderAmount(o), 0);
  const totalRevenue = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + orderAmount(o), 0);

  const dailyTopUps = txs
    .filter((t) => t.type === 'topup' && t.amount > 0 && Date.parse(t.created_at) >= startToday)
    .reduce((s, t) => s + t.amount, 0);
  const totalTopUps = txs.filter((t) => t.type === 'topup' && t.amount > 0).reduce((s, t) => s + t.amount, 0);

  const dailyPaymentsOut = txs
    .filter((t) => t.type === 'payment' && t.amount < 0 && Date.parse(t.created_at) >= startToday)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const dailyNetFlow = dailyTopUps - dailyPaymentsOut;
  const totalWalletBalance = users.reduce((s, u) => s + (Number(u.balance) || 0), 0);

  return {
    userCount: users.length,
    adminCount: users.filter((u) => u.role === 'admin').length,
    orderCount: orders.length,
    completedOrders: orders.filter((o) => o.status === 'completed').length,
    processingOrders: orders.filter((o) => o.status !== 'completed' && o.status !== 'failed').length,
    totalRevenue,
    totalTopUps,
    dailyOrders: dayOrders.length,
    dailyCompleted: dayOrders.filter((o) => o.status === 'completed').length,
    dailyProcessing: dayOrders.filter((o) => o.status !== 'completed' && o.status !== 'failed').length,
    dailyRevenue,
    dailyTransactionCount: txs.filter((t) => Date.parse(t.created_at) >= startToday).length,
    dailyNetFlow,
    dailyTopUps,
    totalWalletBalance,
  };
}

function txForClient(t) {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    reference: t.reference || '',
    created_at: t.created_at,
    status: t.status || 'completed',
    description: t.description || '',
    narration: t.description || '',
  };
}

function txForAdmin(t) {
  return {
    id: t.id,
    user_id: t.user_id,
    user_email: t.user_email || '',
    full_name: t.full_name || '',
    type: t.type,
    amount: t.amount,
    reference: t.reference || '',
    description: t.description || '',
    narration: t.description || '',
    created_at: t.created_at,
    status: t.status || 'completed',
    description: t.description || '',
    narration: t.description || '',
  };
}

// ——— Public client config (Paystack publishable key; safe to expose) ———
app.get('/api/public/config', (req, res) => {
  const paystackPublicKey = (process.env.PAYSTACK_PUBLIC_KEY || process.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim();
  res.json({
    paystackPublicKey,
    paystackEnabled: paystackConfigured(),
  });
});

app.get('/', (req, res) => {
  res.redirect(302, `${resolveClientAppOrigin(req)}${req.originalUrl}`);
});

// ——— Auth ———
function normalizePhoneDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

app.post('/api/auth/register', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  const fullName = (req.body.fullName || '').trim();
  const phoneRaw = (req.body.phone || '').trim();
  const phoneDigits = normalizePhoneDigits(phoneRaw);
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (!phoneRaw || phoneDigits.length < 8) {
    return res.status(400).json({ error: 'Valid phone number required (at least 8 digits)' });
  }
  withDb((db) => {
    if (db.users.some((u) => u.email === email && u.deleted_at)) {
      res.status(403).json({ error: 'This email was deleted or banned and cannot be used again.' });
      return;
    }
    if (db.users.some((u) => u.email === email)) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }
    if (db.users.some((u) => {
      const d = normalizePhoneDigits(u.phone);
      return d.length >= 8 && d === phoneDigits;
    })) {
      res.status(400).json({ error: 'Phone number already registered' });
      return;
    }
    const id = randomUUID();
    const user = {
      id,
      email,
      full_name: fullName || email.split('@')[0],
      phone: phoneRaw,
      role: 'user',
      profile_avatar: null,
      password_hash: bcrypt.hashSync(password, 10),
      balance: 0,
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/auth/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  try {
    const db = readDb();
    const user = db.users.find((u) => u.email === email);
    if (user && user.deleted_at) {
      return res.status(403).json({ error: 'Account deleted or banned. Contact support.' });
    }
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: publicUser(user) });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const db = readDb();
  const u = db.users.find((x) => x.id === req.userId);
  if (!u || u.deleted_at) return res.status(401).json({ error: 'Unauthorized' });
  res.json(publicUser(u));
});

// ——— Profile ———
app.put('/api/profile', requireAuth, (req, res) => {
  withDb((db) => {
    const u = db.users.find((x) => x.id === req.userId);
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (req.body.fullName != null) u.full_name = String(req.body.fullName).trim();
    if (req.body.email != null) {
      const ne = String(req.body.email).trim().toLowerCase();
      if (ne && !db.users.some((x) => x.email === ne && x.id !== u.id)) u.email = ne;
    }
    if (req.body.phone != null) u.phone = String(req.body.phone).trim();
    res.json(publicUser(u));
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.put('/api/profile/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  withDb((db) => {
    const u = db.users.find((x) => x.id === req.userId);
    if (!u || !bcrypt.compareSync(currentPassword || '', u.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
    if (!newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }
    u.password_hash = bcrypt.hashSync(newPassword, 10);
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.put('/api/profile/avatar', requireAuth, (req, res) => {
  const avatar = req.body.avatar;
  if (avatar != null && typeof avatar === 'string' && avatar.length > 1_500_000) {
    return res.status(413).json({ error: 'Image too large' });
  }
  withDb((db) => {
    const u = db.users.find((x) => x.id === req.userId);
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    u.profile_avatar = avatar || null;
    res.json(publicUser(u));
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

// ——— Wallet ———
app.get('/api/wallet', requireAuth, (req, res) => {
  const db = readDb();
  const u = db.users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ balance: u.balance ?? 0 });
});

app.post('/api/wallet/topup', requireAuth, (req, res) => {
  if (paystackConfigured()) {
    return res.status(400).json({ error: 'Use Paystack to top up your wallet' });
  }
  const amount = parseFloat(req.body.amount);
  if (!Number.isFinite(amount) || amount < MIN_WALLET_TOPUP_GHS) {
    return res.status(400).json({ error: `Minimum top-up is GHS ${MIN_WALLET_TOPUP_GHS}` });
  }
  withDb((db) => {
    const u = db.users.find((x) => x.id === req.userId);
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    u.balance = (u.balance ?? 0) + amount;
    const ref = `TOPUP-${Date.now()}`;
    db.walletTransactions.push({
      id: randomUUID(),
      user_id: u.id,
      user_email: u.email,
      full_name: u.full_name,
      type: 'topup',
      amount,
      reference: ref,
      description: 'Wallet top-up',
      status: 'completed',
      created_at: new Date().toISOString(),
    });
    res.json({ balance: u.balance });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/wallet/paystack/initialize', requireAuth, async (req, res) => {
  if (!paystackConfigured()) {
    return res.status(503).json({ error: 'Paystack is not configured on this server' });
  }
  const amount = parseFloat(req.body.amount);
  if (!Number.isFinite(amount) || amount < MIN_WALLET_TOPUP_GHS) {
    return res.status(400).json({ error: `Minimum top-up is GHS ${MIN_WALLET_TOPUP_GHS}` });
  }
  const amountPesewas = Math.round(amount * 100);
  if (amountPesewas < MIN_WALLET_TOPUP_PESEWAS) {
    return res.status(400).json({ error: `Minimum top-up is GHS ${MIN_WALLET_TOPUP_GHS}` });
  }
  const db = readDb();
  const u = db.users.find((x) => x.id === req.userId);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const email = (u.email || '').trim() || `user-${u.id}@wallet.local`;
  const reference = `WT-${String(u.id).slice(0, 8)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  try {
    const data = await paystackInitializeTransaction({
      email,
      amountPesewas,
      reference,
      metadata: { user_id: String(u.id) },
      /** Must match your app URL so Paystack redirects back with ?reference= for wallet verify */
      callbackUrl: resolveClientAppOrigin(req),
    });
    res.json({
      access_code: data.access_code,
      reference: data.reference,
      authorization_url: data.authorization_url,
    });
  } catch (e) {
    res.status(502).json({ error: e.message || 'Paystack error' });
  }
});

app.post('/api/wallet/paystack/verify', requireAuth, async (req, res) => {
  if (!paystackConfigured()) {
    return res.status(503).json({ error: 'Paystack is not configured' });
  }
  const reference = (req.body.reference || '').trim();
  if (!reference) return res.status(400).json({ error: 'reference required' });
  try {
    const verified = await paystackVerifyTransaction(reference);
    if (verified.status !== 'success') {
      return res.status(400).json({ error: 'Payment was not successful' });
    }
    let meta = verified.metadata;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    if (!meta || typeof meta !== 'object') meta = {};
    const metaUid = meta.user_id ?? meta.userId ?? meta.custom_fields?.user_id;
    if (String(metaUid) !== String(req.userId)) {
      return res.status(403).json({ error: 'This payment does not belong to your account' });
    }
    const amountGhs = ghsFromPaystackAmount(verified.amount);
    if (amountGhs <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    let creditResult;
    await withDb((db) => {
      creditResult = applyWalletTopUpFromPaystack(db, reference, req.userId, amountGhs);
    });
    if (creditResult == null) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ balance: creditResult.balance, reference });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Verification failed' });
  }
});

app.post('/api/paystack/webhook', (req, res) => {
  if (!paystackConfigured()) return res.status(503).json({ received: false });
  const sig = req.headers['x-paystack-signature'];
  const raw = req.paystackRawBody;
  if (!sig || !raw) return res.status(400).json({ error: 'Invalid webhook' });
  const hash = createHmac('sha512', PAYSTACK_SECRET_KEY).update(raw).digest('hex');
  let expected;
  let received;
  try {
    expected = Buffer.from(hash, 'hex');
    received = Buffer.from(String(sig).trim(), 'hex');
  } catch {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (event.event === 'charge.success' && event.data) {
    const reference = event.data.reference;
    const metaUid = event.data.metadata?.user_id ?? event.data.metadata?.userId;
    const amountGhs = ghsFromPaystackAmount(event.data.amount);
    if (reference && metaUid && amountGhs > 0) {
      withDb((db) => {
        applyWalletTopUpFromPaystack(db, reference, metaUid, amountGhs);
      }).catch(() => {});
    }
  }
  res.json({ received: true });
});

app.get('/api/wallet/transactions', requireAuth, (req, res) => {
  const db = readDb();
  const list = db.walletTransactions
    .filter((t) => t.user_id === req.userId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map(txForClient);
  res.json(list);
});

// ——— Orders ———
app.get('/api/orders', (req, res) => {
  const tok = bearer(req);
  if (!tok) return res.status(401).json([]);
  let payload;
  try {
    payload = jwt.verify(tok, JWT_SECRET);
  } catch {
    return res.status(401).json([]);
  }
  const db = readDb();
  if (isAdminTokenPayload(payload)) {
    const all = db.orders.map((o) => enrichOrder(db, o)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return res.json(all);
  }
  if (!payload.sub) return res.status(401).json([]);
  const u = db.users.find((x) => x.id === payload.sub);
  if (u && u.role === 'admin') {
    const all = db.orders.map((o) => enrichOrder(db, o)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return res.json(all);
  }
  const mine = db.orders
    .filter((o) => o.user_id === payload.sub)
    .map((o) => enrichOrder(db, o))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  res.json(mine);
});

app.post('/api/orders', requireAuth, (req, res) => {
  const items = req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items' });
  }
  withDb((db) => {
    const u = db.users.find((x) => x.id === req.userId);
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    let total = 0;
    for (const it of items) {
      const price = parseFloat(it.bundle_price);
      if (!Number.isFinite(price) || price < 0) {
        res.status(400).json({ error: 'Invalid item price' });
        return;
      }
      total += price;
    }
    if ((u.balance ?? 0) < total) {
      res.status(400).json({ error: 'Insufficient balance' });
      return;
    }
    u.balance = (u.balance ?? 0) - total;
    const batchRef = `PAY-${Date.now()}`;
    items.forEach((it, i) => {
      db.counters.order += 1;
      const orderNum = `ORD-${String(db.counters.order).padStart(6, '0')}`;
      const price = parseFloat(it.bundle_price);
      const network = (it.network || 'mtn').toString().toLowerCase();
      const recipient = (it.recipient_number || '').toString();
      const bundleSize = (it.bundle_size || '').toString();
      db.orders.push({
        id: randomUUID(),
        user_id: u.id,
        order_number: orderNum,
        created_at: new Date().toISOString(),
        status: 'processing',
        bundle_size: bundleSize,
        bundle_price: price,
        recipient_number: recipient,
        network,
        amount: price,
        reference: `${batchRef}-${i}`,
      });
      db.walletTransactions.push({
        id: randomUUID(),
        user_id: u.id,
        user_email: u.email,
        full_name: u.full_name,
        type: 'payment',
        amount: -price,
        reference: orderNum,
        description: `Bundle ${bundleSize} (${network}) → ${recipient}`,
        status: 'completed',
        created_at: new Date().toISOString(),
      });
    });
    res.json({ balance: u.balance, ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

const AFA_REGISTRATION_FEE = Math.max(0.01, Number(process.env.AFA_REGISTRATION_FEE_GHS ?? 14));

app.get('/api/afa-applications', requireAuth, (req, res) => {
  const db = readDb();
  const list = Array.isArray(db.agentApplications) ? db.agentApplications : [];
  const rows = list
    .filter((x) => String(x.user_id) === String(req.userId))
    .sort((a, b) => Date.parse(b.applied_at || b.created_at || 0) - Date.parse(a.applied_at || a.created_at || 0))
    .map(formatAgentApplication);
  res.json(rows);
});

app.post('/api/afa-applications', requireAuth, (req, res) => {
  const fullName = String(req.body?.full_name || req.body?.name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const ghanaCardNumber = String(req.body?.ghana_card_number || '').trim();
  const occupation = String(req.body?.occupation || '').trim();
  const dateOfBirth = String(req.body?.date_of_birth || '').trim();
  if (!fullName || !phone || !ghanaCardNumber || !occupation || !dateOfBirth) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  withDb((db) => {
    if (!Array.isArray(db.agentApplications)) db.agentApplications = [];
    if (!Array.isArray(db.walletTransactions)) db.walletTransactions = [];
    const user = db.users.find((x) => String(x.id) === String(req.userId));
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const bal = Number(user.balance ?? 0);
    if (bal < AFA_REGISTRATION_FEE) {
      res.status(400).json({ error: 'Insufficient balance', balance: bal, fee: AFA_REGISTRATION_FEE });
      return;
    }
    user.balance = bal - AFA_REGISTRATION_FEE;
    user.wallet_updated_at = new Date().toISOString();
    const row = {
      id: randomUUID(),
      user_id: user.id,
      full_name: fullName,
      phone,
      ghana_card_number: ghanaCardNumber,
      occupation,
      date_of_birth: dateOfBirth,
      payment_amount: AFA_REGISTRATION_FEE,
      status: 'pending',
      applied_at: new Date().toISOString(),
      updated_at: null,
    };
    db.agentApplications.push(row);
    db.walletTransactions.push({
      id: randomUUID(),
      user_id: user.id,
      user_email: user.email,
      full_name: user.full_name,
      type: 'payment',
      amount: -AFA_REGISTRATION_FEE,
      reference: `AFA-${Date.now()}`,
      description: `AFA registration fee (${fullName})`,
      status: 'completed',
      created_at: new Date().toISOString(),
    });
    res.json({ ok: true, application: formatAgentApplication(row), balance: user.balance });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

// ——— Bundles (public) ———
app.get('/api/bundles', (req, res) => {
  const db = readDb();
  res.json(db.bundles && db.bundles.mtn ? db.bundles : defaultBundles());
});

// ——— Settings ———
app.get('/api/settings', (req, res) => {
  const db = readDb();
  res.json(db.settings || {});
});

// ——— Admin ———
app.post('/api/admin/verify-pin', (req, res) => {
  const pin = String(req.body.pin ?? '').trim();
  if (pin !== ADMIN_PIN) return res.status(401).json({ error: 'Invalid PIN' });
  const token = jwt.sign({ a: 1 }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

app.put('/api/admin/bundles', requireAdmin, (req, res) => {
  const bundles = req.body.bundles;
  if (!bundles || typeof bundles !== 'object') return res.status(400).json({ error: 'Invalid bundles' });
  withDb((db) => {
    db.bundles = bundles;
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json(computeStats(readDb()));
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const db = readDb();
  const list = db.users.filter((u) => !u.deleted_at).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone: u.phone || '',
    role: u.role || 'user',
    created_at: u.created_at,
  }));
  res.json(list);
});

app.patch('/api/admin/users/:userId/role', requireAdmin, (req, res) => {
  const role = (req.body.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'user') return res.status(400).json({ error: 'Invalid role' });
  withDb((db) => {
    const u = db.users.find((x) => String(x.id) === String(req.params.userId));
    if (!u || u.deleted_at) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    u.role = role;
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.delete('/api/admin/users/:userId', requireAdmin, (req, res) => {
  withDb((db) => {
    const targetId = String(req.params.userId);
    const actorId = req.userId == null ? null : String(req.userId);
    const u = db.users.find((x) => String(x.id) === targetId);
    if (!u || u.deleted_at) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (actorId && targetId === actorId) {
      res.status(400).json({ error: 'You cannot delete your own account from admin panel' });
      return;
    }
    u.deleted_at = new Date().toISOString();
    u.deleted_by = actorId || 'admin-pin';
    u.role = 'user';
    u.password_hash = bcrypt.hashSync(randomUUID(), 10);
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

function formatAgentApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name || row.name || '',
    phone: row.phone || '',
    ghana_card_number: row.ghana_card_number || '',
    occupation: row.occupation || '',
    date_of_birth: row.date_of_birth || '',
    payment_amount: row.payment_amount ?? row.amount ?? 0,
    status: (row.status || 'pending').toLowerCase(),
    applied_at: row.applied_at || row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

app.get('/api/admin/agent-applications', requireAdmin, (req, res) => {
  const db = readDb();
  const list = Array.isArray(db.agentApplications) ? db.agentApplications : [];
  const sorted = [...list].sort(
    (a, b) =>
      Date.parse(b.applied_at || b.created_at || 0) - Date.parse(a.applied_at || a.created_at || 0)
  );
  res.json(sorted.map(formatAgentApplication));
});

app.patch('/api/admin/agent-applications/:id', requireAdmin, (req, res) => {
  const status = (req.body?.status || '').toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  withDb((db) => {
    if (!Array.isArray(db.agentApplications)) db.agentApplications = [];
    const row = db.agentApplications.find((x) => String(x.id) === String(req.params.id));
    if (!row) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    row.status = status;
    row.updated_at = new Date().toISOString();
    res.json(formatAgentApplication(row));
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.get('/api/admin/wallets', requireAdmin, (req, res) => {
  const db = readDb();
  const list = db.users.map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    created_at: u.created_at,
    balance: u.balance ?? 0,
    wallet_updated_at: u.wallet_updated_at || u.created_at || null,
  }));
  list.sort((a, b) => String(b.wallet_updated_at || '').localeCompare(String(a.wallet_updated_at || '')));
  res.json(list);
});

app.post('/api/admin/wallets/:userId/credit', requireAdmin, (req, res) => {
  const uid = req.params.userId;
  const amount = parseFloat(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount required' });
  }
  withDb((db) => {
    const u = db.users.find((x) => String(x.id) === String(uid));
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    u.balance = (u.balance ?? 0) + amount;
    u.wallet_updated_at = new Date().toISOString();
    const ref = `ADMIN-CREDIT-${Date.now()}`;
    db.walletTransactions.push({
      id: randomUUID(),
      user_id: u.id,
      user_email: u.email,
      full_name: u.full_name,
      type: 'topup',
      amount,
      reference: ref,
      description: 'Admin credit',
      status: 'completed',
      created_at: u.wallet_updated_at,
    });
    res.json({ balance: u.balance, updated_at: u.wallet_updated_at });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/admin/wallets/:userId/debit', requireAdmin, (req, res) => {
  const uid = req.params.userId;
  const amount = parseFloat(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount required' });
  }
  withDb((db) => {
    const u = db.users.find((x) => String(x.id) === String(uid));
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const bal = u.balance ?? 0;
    if (bal < amount) {
      res.status(400).json({ error: 'Insufficient balance', balance: bal });
      return;
    }
    u.balance = bal - amount;
    u.wallet_updated_at = new Date().toISOString();
    const ref = `ADMIN-DEBIT-${Date.now()}`;
    db.walletTransactions.push({
      id: randomUUID(),
      user_id: u.id,
      user_email: u.email,
      full_name: u.full_name,
      type: 'payment',
      amount: -amount,
      reference: ref,
      description: 'Admin debit',
      status: 'completed',
      created_at: u.wallet_updated_at,
    });
    res.json({ balance: u.balance, updated_at: u.wallet_updated_at });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const db = readDb();
  const list = db.orders.map((o) => enrichOrder(db, o)).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  res.json(list);
});

app.patch('/api/admin/orders/:orderId/status', requireAdmin, (req, res) => {
  const status = String(req.body?.status || '').trim().toLowerCase();
  const allowed = new Set(['processing', 'completed', 'failed']);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: 'Invalid status. Use processing, completed, or failed.' });
  }
  withDb((db) => {
    const row = db.orders.find((o) => String(o.id) === String(req.params.orderId));
    if (!row) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    row.status = status;
    row.updated_at = new Date().toISOString();
    res.json(enrichOrder(db, row));
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

function sendAllWalletTransactions(req, res) {
  const db = readDb();
  const list = [...db.walletTransactions].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  res.json(list.map(txForAdmin));
}

app.get('/api/admin/transactions', requireAdmin, sendAllWalletTransactions);
app.get('/api/admin/wallet/transactions', requireAdmin, sendAllWalletTransactions);

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const url = req.body.sidebarLogoUrl;
  if (url != null && typeof url !== 'string') return res.status(400).json({ error: 'Invalid URL' });
  withDb((db) => {
    if (!db.settings) db.settings = {};
    if (url != null) db.settings.sidebarLogoUrl = url;
    res.json(db.settings);
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.get('/api/transactions', requireAdmin, sendAllWalletTransactions);

const MAX_BROADCAST_IMAGE_LEN = 1_500_000;

function clampBroadcastInt(value, min, max, fallback) {
  const x = Number(value);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, Math.round(x)));
}

/** Max ≈ legacy 365 days, expressed in hours. */
const MAX_BROADCAST_RESHOW_HOURS = 8760;

function broadcastReshowHoursFromRow(b) {
  if (!b || typeof b !== 'object') return 0;
  if (b.reshow_after_hours != null) {
    return clampBroadcastInt(b.reshow_after_hours, 0, MAX_BROADCAST_RESHOW_HOURS, 0);
  }
  if (b.reshow_after_days != null) {
    return clampBroadcastInt(Number(b.reshow_after_days) * 24, 0, MAX_BROADCAST_RESHOW_HOURS, 0);
  }
  return 0;
}

function broadcastReshowHoursFromBody(body) {
  if (body?.reshow_after_hours != null) {
    return clampBroadcastInt(body.reshow_after_hours, 0, MAX_BROADCAST_RESHOW_HOURS, 0);
  }
  if (body?.reshow_after_days != null) {
    return clampBroadcastInt(Number(body.reshow_after_days) * 24, 0, MAX_BROADCAST_RESHOW_HOURS, 0);
  }
  return 0;
}

function stripBroadcastLegacyReshowDays(row) {
  if (row && typeof row === 'object' && 'reshow_after_days' in row) delete row.reshow_after_days;
}

function sanitizeBroadcastCtaUrl(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    s = `https://${s.replace(/^\/+/, '')}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href.length > 2048 ? u.href.slice(0, 2048) : u.href;
  } catch {
    return '';
  }
}

function sanitizeBroadcastCtaLabel(raw) {
  return String(raw ?? '').trim().slice(0, 80);
}

app.get('/api/broadcasts', (req, res) => {
  const db = readDb();
  const list = Array.isArray(db.broadcasts) ? db.broadcasts : [];
  const out = list
    .filter((b) => b && b.active !== false && String(b.image_url || '').trim())
    .map((b) => {
      const cta_url = sanitizeBroadcastCtaUrl(b.cta_url);
      const cta_label = sanitizeBroadcastCtaLabel(b.cta_label);
      const cta_open_new_tab = b.cta_open_new_tab !== false;
      const { title: outTitle, captionHtml } = splitBroadcastCaption(b.caption, b.title);
      return {
        id: b.id,
        title: outTitle,
        caption: captionHtml,
        image_url: String(b.image_url).trim(),
        created_at: b.created_at || null,
        popup_delay_seconds: clampBroadcastInt(b.popup_delay_seconds, 0, 600, 2),
        auto_close_seconds: clampBroadcastInt(b.auto_close_seconds, 0, 86400, 0),
        reshow_after_hours: broadcastReshowHoursFromRow(b),
        ...(cta_url
          ? { cta_url, cta_label: cta_label || 'Learn more', cta_open_new_tab }
          : {}),
      };
    })
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  res.json(out);
});

app.get('/api/admin/broadcasts', requireAdmin, (req, res) => {
  const db = readDb();
  const list = Array.isArray(db.broadcasts) ? db.broadcasts : [];
  res.json([...list].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)));
});

app.post('/api/admin/broadcasts', requireAdmin, (req, res) => {
  const caption = normalizeBroadcastCaptionForStorage(req.body?.caption ?? '');
  const titleFromBody = sanitizeBroadcastTitle(req.body?.title);
  const titlePacked = extractPackedTitleFromCaption(caption);
  const title = titleFromBody || titlePacked;
  const image_url = String(req.body?.image_url ?? '').trim();
  const active = req.body?.active !== false;
  const popup_delay_seconds = clampBroadcastInt(req.body?.popup_delay_seconds, 0, 600, 2);
  const auto_close_seconds = clampBroadcastInt(req.body?.auto_close_seconds, 0, 86400, 0);
  const reshow_after_hours = broadcastReshowHoursFromBody(req.body);
  const cta_url = sanitizeBroadcastCtaUrl(req.body?.cta_url);
  const cta_label = sanitizeBroadcastCtaLabel(req.body?.cta_label);
  const cta_open_new_tab = req.body?.cta_open_new_tab !== false;
  if (!image_url) return res.status(400).json({ error: 'Image is required (upload a file or paste an image URL)' });
  if (image_url.length > MAX_BROADCAST_IMAGE_LEN) {
    return res.status(413).json({ error: 'Image data too large; use a smaller file or host the image elsewhere' });
  }
  withDb((db) => {
    if (!Array.isArray(db.broadcasts)) db.broadcasts = [];
    const row = {
      id: randomUUID(),
      title,
      caption,
      image_url,
      active: !!active,
      popup_delay_seconds,
      auto_close_seconds,
      reshow_after_hours,
      cta_url,
      cta_label,
      cta_open_new_tab,
      created_at: new Date().toISOString(),
    };
    db.broadcasts.push(row);
    res.status(201).json(row);
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.patch('/api/admin/broadcasts/:id', requireAdmin, (req, res) => {
  withDb((db) => {
    if (!Array.isArray(db.broadcasts)) db.broadcasts = [];
    const row = db.broadcasts.find((x) => String(x.id) === String(req.params.id));
    if (!row) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (req.body.caption != null) {
      row.caption = normalizeBroadcastCaptionForStorage(req.body.caption);
    }
    if (req.body.title !== undefined) {
      row.title = sanitizeBroadcastTitle(req.body.title);
    } else if (req.body.caption != null) {
      const packedT = extractPackedTitleFromCaption(row.caption);
      if (packedT) row.title = packedT;
    }
    if (req.body.image_url != null) {
      const u = String(req.body.image_url).trim();
      if (u.length > MAX_BROADCAST_IMAGE_LEN) {
        res.status(413).json({ error: 'Image data too large' });
        return;
      }
      row.image_url = u;
    }
    if (req.body.active != null) row.active = !!req.body.active;
    if (req.body.popup_delay_seconds != null) {
      row.popup_delay_seconds = clampBroadcastInt(req.body.popup_delay_seconds, 0, 600, row.popup_delay_seconds ?? 2);
    }
    if (req.body.auto_close_seconds != null) {
      row.auto_close_seconds = clampBroadcastInt(req.body.auto_close_seconds, 0, 86400, row.auto_close_seconds ?? 0);
    }
    if (req.body.reshow_after_hours != null || req.body.reshow_after_days != null) {
      row.reshow_after_hours = broadcastReshowHoursFromBody(req.body);
      stripBroadcastLegacyReshowDays(row);
    }
    if (req.body.cta_url !== undefined) {
      row.cta_url = sanitizeBroadcastCtaUrl(req.body.cta_url);
    }
    if (req.body.cta_label !== undefined) {
      row.cta_label = sanitizeBroadcastCtaLabel(req.body.cta_label);
    }
    if (req.body.cta_open_new_tab !== undefined) {
      row.cta_open_new_tab = req.body.cta_open_new_tab !== false;
    }
    row.updated_at = new Date().toISOString();
    res.json(row);
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.delete('/api/admin/broadcasts/:id', requireAdmin, (req, res) => {
  withDb((db) => {
    if (!Array.isArray(db.broadcasts)) db.broadcasts = [];
    const i = db.broadcasts.findIndex((x) => String(x.id) === String(req.params.id));
    if (i === -1) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    db.broadcasts.splice(i, 1);
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

// —— Support / live chat (logged-in users; admin inbox) ——
function ensureSupportThreads(db) {
  if (!db.supportThreads || typeof db.supportThreads !== 'object' || Array.isArray(db.supportThreads)) {
    db.supportThreads = {};
  }
}

function userProfileAvatarForAdmin(db, userId) {
  const u = db.users.find((x) => String(x.id) === String(userId));
  const a = u?.profile_avatar;
  if (a != null && typeof a === 'string' && a.trim()) return a.trim();
  return '';
}

const SUPPORT_TYPING_TTL_MS = 5000;
function supportTypingActive(iso) {
  if (iso == null || typeof iso !== 'string') return false;
  const s = iso.trim();
  if (!s) return false;
  const ms = Date.parse(s);
  return Number.isFinite(ms) && Date.now() - ms < SUPPORT_TYPING_TTL_MS;
}

/** When autoClearAt is in the past: wipe messages and reset thread to a fresh state. */
function supportApplyAutoClearJson(t) {
  if (!t) return;
  const raw = t.autoClearAt;
  if (raw == null || (typeof raw === 'string' && !raw.trim())) return;
  const ms = Date.parse(String(raw));
  if (!Number.isFinite(ms) || ms > Date.now()) return;
  t.messages = [];
  t.unreadForAdmin = 0;
  t.unreadForUser = 0;
  t.needsHuman = false;
  t.userTypingAt = '';
  t.adminTypingAt = '';
  t.autoClearAt = '';
  t.updatedAt = new Date().toISOString();
}

function supportSweepSupportThreadsJson(db) {
  ensureSupportThreads(db);
  for (const key of Object.keys(db.supportThreads)) {
    supportApplyAutoClearJson(db.supportThreads[key]);
  }
}

const SUPPORT_AUTO_CLEAR_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const SUPPORT_AUTO_CLEAR_MIN_MS = 1000;

/** cancel | { ms } | { error } */
function supportResolveAutoClearDelayMs(body) {
  if (!body || body.cancel === true) return { ok: true, cancel: true };
  const ds = Number(body.durationSeconds);
  if (body.durationSeconds !== undefined && body.durationSeconds !== null && body.durationSeconds !== '') {
    if (!Number.isFinite(ds)) return { ok: false, error: 'durationSeconds must be a valid number' };
    const ms = Math.round(ds * 1000);
    if (ms < SUPPORT_AUTO_CLEAR_MIN_MS || ms > SUPPORT_AUTO_CLEAR_MAX_MS) {
      return { ok: false, error: 'duration must be between 1 second and 7 days' };
    }
    return { ok: true, ms };
  }
  const hasMin = body.minutes !== undefined && body.minutes !== null && body.minutes !== '';
  const hasSec = body.seconds !== undefined && body.seconds !== null && body.seconds !== '';
  if (hasMin || hasSec) {
    const mRaw = hasMin ? Number(body.minutes) : 0;
    const sRaw = hasSec ? Number(body.seconds) : 0;
    if (!Number.isFinite(mRaw) || !Number.isFinite(sRaw)) {
      return { ok: false, error: 'minutes and seconds must be valid numbers' };
    }
    const mi = Math.max(0, Math.floor(mRaw));
    const si = Math.max(0, Math.min(59, Math.floor(sRaw)));
    const totalSec = mi * 60 + si;
    const ms = totalSec * 1000;
    if (totalSec < 1 || ms > SUPPORT_AUTO_CLEAR_MAX_MS) {
      return { ok: false, error: 'total must be 1 second to 7 days (seconds 0–59 per minute)' };
    }
    return { ok: true, ms };
  }
  const legMin = Number(body.minutes);
  if (Number.isFinite(legMin) && legMin >= 1 && legMin <= 10080) {
    return { ok: true, ms: legMin * 60 * 1000 };
  }
  return {
    ok: false,
    error:
      'Use cancel: true, durationSeconds (1–604800), minutes+seconds (seconds 0–59), or minutes alone (1–10080)',
  };
}

function getSupportThread(db, userId, userRow = null) {
  ensureSupportThreads(db);
  const key = String(userId);
  if (!db.supportThreads[key]) {
    db.supportThreads[key] = {
      userId: key,
      userEmail: userRow?.email ? String(userRow.email) : '',
      userName: userRow?.full_name ? String(userRow.full_name) : '',
      updatedAt: new Date().toISOString(),
      unreadForAdmin: 0,
      unreadForUser: 0,
      needsHuman: false,
      messages: [],
      userTypingAt: '',
      adminTypingAt: '',
      autoClearAt: '',
    };
  }
  const t = db.supportThreads[key];
  if (t.userTypingAt == null) t.userTypingAt = '';
  if (t.adminTypingAt == null) t.adminTypingAt = '';
  if (t.autoClearAt == null) t.autoClearAt = '';
  if (userRow) {
    if (userRow.email) t.userEmail = String(userRow.email);
    if (userRow.full_name) t.userName = String(userRow.full_name);
  }
  supportApplyAutoClearJson(t);
  return t;
}

function sanitizeSupportText(s, max = 4000) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

const SUPPORT_IMAGE_MAX_BYTES = 900 * 1024;

/** Accept data URLs only; cap size for JSON store (same ballpark as broadcast images). */
function sanitizeSupportImageDataUrl(s) {
  const raw = String(s ?? '').trim();
  if (!raw) return '';
  const m = raw.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([\s\S]+)$/i);
  if (!m) return '';
  const mime = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  const b64 = m[2].replace(/\s/g, '');
  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.length > SUPPORT_IMAGE_MAX_BYTES) return '';
  } catch {
    return '';
  }
  return `data:image/${mime};base64,${b64}`;
}

function supportMessageIndex(msgs, messageId) {
  const id = String(messageId || '').trim();
  if (!id) return -1;
  if (!Array.isArray(msgs)) return -1;
  return msgs.findIndex((x) => x && String(x.id) === id);
}

/** After user sends a normal message (text and/or image): ask them to wait for a human. */
const SUPPORT_WAIT_ACK = `Thanks for your message — please hold on for a moment.

We're sorry for any wait. A team member will be with you shortly.`;

/** After user taps “Request a human”. */
const SUPPORT_HUMAN_ACK =
  'Thanks — our team has been notified. Someone professional will get back to you here as soon as they can.';

function isSupportWaitAckMessage(m) {
  return !!(m && m.role === 'system' && typeof m.body === 'string' && m.body === SUPPORT_WAIT_ACK);
}

/** Admin UI should not show the auto “please hold” system line (customers still see it). */
function supportMessagesForAdminResponse(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => !isSupportWaitAckMessage(m));
}

function supportLastMessageForAdminInbox(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!isSupportWaitAckMessage(messages[i])) return messages[i];
  }
  return null;
}

function sanitizeSupportReplyRole(r) {
  const fr = String(r ?? '').trim().toLowerCase();
  if (fr === 'user' || fr === 'admin' || fr === 'system') return fr;
  return 'user';
}

function attachSupportReplyMeta(msg, threadMessages, replyToIdRaw, fallback = null) {
  const rid = String(replyToIdRaw ?? '').trim();
  if (!rid || !msg || !Array.isArray(threadMessages)) return;
  const i = supportMessageIndex(threadMessages, rid);
  if (i === -1) {
    const fp = sanitizeSupportText(fallback?.preview, 220);
    msg.replyTo = rid;
    msg.replyPreview = fp || '…';
    msg.replyRole = sanitizeSupportReplyRole(fallback?.role);
    return;
  }
  const rm = threadMessages[i];
  const bodyTrim = String(rm.body || '').trim();
  msg.replyTo = rid;
  msg.replyPreview = rm.image && !bodyTrim ? '📷 Image' : bodyTrim.slice(0, 220);
  msg.replyRole = rm.role;
}

/** Backfill reply preview/role from the quoted message so GET thread survives reload with full quote strips. */
function hydrateSupportReplyMetaInMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const byId = new Map();
  for (const x of messages) {
    if (x && x.id != null) byId.set(String(x.id), x);
  }
  return messages.map((m) => {
    if (!m) return m;
    const rt = m.replyTo ?? m.reply_to ?? m.reply_to_id;
    if (rt == null || String(rt).trim() === '') return m;
    const rid = String(rt).trim();
    const prev = String(m.replyPreview ?? m.reply_preview ?? '').trim();
    const hasRole = String(m.replyRole ?? m.reply_role ?? '').trim() !== '';
    if (prev && prev !== '…' && hasRole) {
      return {
        ...m,
        replyTo: rid,
        replyPreview: prev,
        replyRole: String(m.replyRole ?? m.reply_role).trim(),
      };
    }
    const target = byId.get(rid);
    if (!target) {
      return {
        ...m,
        replyTo: rid,
        replyPreview: prev || '…',
        replyRole: hasRole ? String(m.replyRole ?? m.reply_role).trim() : 'user',
      };
    }
    const bodyTrim = String(target.body || '').trim();
    const fromTarget =
      target.image && !bodyTrim ? '📷 Image' : bodyTrim.slice(0, 220) || '…';
    const replyPreview = !prev || prev === '…' ? fromTarget : prev;
    const replyRole = hasRole ? (m.replyRole ?? m.reply_role) : target.role || 'user';
    return { ...m, replyTo: rid, replyPreview, replyRole };
  });
}

app.get('/api/support/status', requireAuth, (req, res) => {
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => x.id === req.userId);
    const t = getSupportThread(db, req.userId, u);
    const last = t.messages?.length ? t.messages[t.messages.length - 1] : null;
    const lastSnippet =
      last && last.image
        ? '📷 Image'
        : last && last.body
          ? String(last.body).slice(0, 120)
          : '';
    res.json({
      unreadUser: t.unreadForUser || 0,
      needsHuman: !!t.needsHuman,
      lastSnippet,
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.get('/api/support/thread', requireAuth, (req, res) => {
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => x.id === req.userId);
    const t = getSupportThread(db, req.userId, u);
    t.unreadForUser = 0;
    const raw = Array.isArray(t.messages) ? t.messages : [];
    res.json({
      messages: hydrateSupportReplyMetaInMessages(raw),
      needsHuman: !!t.needsHuman,
      userId: String(req.userId),
      adminTyping: supportTypingActive(t.adminTypingAt),
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/support/typing', requireAuth, (req, res) => {
  const typing = req.body?.typing === true;
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => x.id === req.userId);
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const t = getSupportThread(db, req.userId, u);
    t.userTypingAt = typing ? new Date().toISOString() : '';
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/support/read', requireAuth, (req, res) => {
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => x.id === req.userId);
    const t = getSupportThread(db, req.userId, u);
    t.unreadForUser = 0;
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/support/messages', requireAuth, (req, res) => {
  const requestHuman = req.body?.requestHuman === true;
  const image = sanitizeSupportImageDataUrl(req.body?.image);
  let body = sanitizeSupportText(req.body?.text, 4000);
  if (requestHuman && !body && !image) body = 'I need help from a human.';
  if (!body && !image) return res.status(400).json({ error: 'Message or image required' });
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => x.id === req.userId);
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const t = getSupportThread(db, req.userId, u);
    if (!Array.isArray(t.messages)) t.messages = [];
    const priorMessages = t.messages;
    const hasAdminInThread = priorMessages.some((m) => m && m.role === 'admin');
    const alreadyHasWaitAck = priorMessages.some(isSupportWaitAckMessage);
    const msg = {
      id: randomUUID(),
      role: 'user',
      body,
      createdAt: new Date().toISOString(),
    };
    if (image) msg.image = image;
    attachSupportReplyMeta(msg, priorMessages, req.body?.replyToMessageId, {
      preview: req.body?.replyToPreview,
      role: req.body?.replyToRole,
    });
    t.messages.push(msg);
    t.userTypingAt = '';
    t.unreadForAdmin = (t.unreadForAdmin || 0) + 1;
    t.updatedAt = new Date().toISOString();
    if (requestHuman) {
      t.needsHuman = true;
      t.messages.push({
        id: randomUUID(),
        role: 'system',
        body: SUPPORT_HUMAN_ACK,
        createdAt: new Date().toISOString(),
      });
    } else if (!hasAdminInThread && !alreadyHasWaitAck) {
      t.messages.push({
        id: randomUUID(),
        role: 'system',
        body: SUPPORT_WAIT_ACK,
        createdAt: new Date().toISOString(),
      });
    }
    res.json({
      messages: t.messages,
      needsHuman: !!t.needsHuman,
      userId: String(req.userId),
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.get('/api/admin/support/inbox', requireAdmin, (req, res) => {
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    ensureSupportThreads(db);
    const list = Object.values(db.supportThreads)
      .map((t) => {
        const msgs = Array.isArray(t.messages) ? t.messages : [];
        const last = supportLastMessageForAdminInbox(msgs);
        return {
          userId: t.userId,
          userEmail: t.userEmail || '',
          userName: t.userName || '',
          profileAvatar: userProfileAvatarForAdmin(db, t.userId),
          updatedAt: t.updatedAt || '',
          unreadForAdmin: t.unreadForAdmin || 0,
          unreadForUser: t.unreadForUser || 0,
          needsHuman: !!t.needsHuman,
          lastSnippet: last?.image ? '📷 Image' : last?.body ? String(last.body).slice(0, 160) : '',
          lastRole: last?.role || '',
          messageCount: msgs.length,
        };
      })
      .filter((x) => x.messageCount > 0)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json(list);
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.get('/api/admin/support/thread/:userId', requireAdmin, (req, res) => {
  const uid = String(req.params.userId || '').trim();
  if (!uid) return res.status(400).json({ error: 'userId required' });
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => String(x.id) === uid);
    const t = getSupportThread(db, uid, u || null);
    t.unreadForAdmin = 0;
    const ac = t.autoClearAt && String(t.autoClearAt).trim() ? String(t.autoClearAt) : null;
    const rawThread = Array.isArray(t.messages) ? t.messages : [];
    res.json({
      messages: supportMessagesForAdminResponse(hydrateSupportReplyMetaInMessages(rawThread)),
      userId: t.userId,
      userEmail: t.userEmail || '',
      userName: t.userName || '',
      profileAvatar: userProfileAvatarForAdmin(db, uid),
      needsHuman: !!t.needsHuman,
      userTyping: supportTypingActive(t.userTypingAt),
      autoClearAt: ac,
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/admin/support/thread/:userId/auto-clear', requireAdmin, (req, res) => {
  const uid = String(req.params.userId || '').trim();
  if (!uid) return res.status(400).json({ error: 'userId required' });
  const resolved = supportResolveAutoClearDelayMs(req.body);
  if (!resolved.ok) return res.status(400).json({ error: resolved.error });
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => String(x.id) === uid);
    const t = getSupportThread(db, uid, u || null);
    if (resolved.cancel) {
      t.autoClearAt = '';
    } else {
      t.autoClearAt = new Date(Date.now() + resolved.ms).toISOString();
    }
    t.updatedAt = new Date().toISOString();
    const ac = t.autoClearAt && String(t.autoClearAt).trim() ? String(t.autoClearAt) : null;
    const rawClear = Array.isArray(t.messages) ? t.messages : [];
    res.json({
      messages: supportMessagesForAdminResponse(hydrateSupportReplyMetaInMessages(rawClear)),
      userId: t.userId,
      userEmail: t.userEmail || '',
      userName: t.userName || '',
      profileAvatar: userProfileAvatarForAdmin(db, uid),
      needsHuman: !!t.needsHuman,
      userTyping: supportTypingActive(t.userTypingAt),
      autoClearAt: ac,
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/admin/support/typing', requireAdmin, (req, res) => {
  const uid = String(req.body?.userId ?? '').trim();
  const typing = req.body?.typing === true;
  if (!uid) return res.status(400).json({ error: 'userId required' });
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => String(x.id) === uid);
    const t = getSupportThread(db, uid, u || null);
    t.adminTypingAt = typing ? new Date().toISOString() : '';
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.post('/api/admin/support/reply', requireAdmin, (req, res) => {
  const uid = String(req.body?.userId ?? '').trim();
  const image = sanitizeSupportImageDataUrl(req.body?.image);
  let body = sanitizeSupportText(req.body?.text, 4000);
  if (!uid) return res.status(400).json({ error: 'userId required' });
  if (!body && !image) return res.status(400).json({ error: 'Message or image required' });
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => String(x.id) === uid);
    const t = getSupportThread(db, uid, u || null);
    if (!Array.isArray(t.messages)) t.messages = [];
    const msg = {
      id: randomUUID(),
      role: 'admin',
      body: body || '',
      createdAt: new Date().toISOString(),
    };
    if (image) msg.image = image;
    attachSupportReplyMeta(msg, t.messages, req.body?.replyToMessageId, {
      preview: req.body?.replyToPreview,
      role: req.body?.replyToRole,
    });
    t.messages.push(msg);
    t.adminTypingAt = '';
    t.unreadForUser = (t.unreadForUser || 0) + 1;
    t.updatedAt = new Date().toISOString();
    res.json({
      messages: supportMessagesForAdminResponse(t.messages),
      userId: t.userId,
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.patch('/api/support/messages', requireAuth, (req, res) => {
  const messageId = String(req.body?.messageId ?? '').trim();
  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  const removeImage = req.body?.removeImage === true;
  const image = sanitizeSupportImageDataUrl(req.body?.image);
  const hasTextKey = typeof req.body?.text === 'string';
  const newBody = hasTextKey ? sanitizeSupportText(req.body.text, 4000) : null;
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => x.id === req.userId);
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const t = getSupportThread(db, req.userId, u);
    if (!Array.isArray(t.messages)) t.messages = [];
    const i = supportMessageIndex(t.messages, messageId);
    if (i === -1) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    const msg = t.messages[i];
    if (msg.role !== 'user') {
      res.status(403).json({ error: 'You can only edit your own messages' });
      return;
    }
    if (hasTextKey) msg.body = newBody;
    if (removeImage) delete msg.image;
    else if (image) msg.image = image;
    const bodyOk = String(msg.body ?? '').trim().length > 0;
    const hasImg = !!msg.image;
    if (!bodyOk && !hasImg) {
      res.status(400).json({ error: 'Message must have text or an image' });
      return;
    }
    msg.editedAt = new Date().toISOString();
    t.updatedAt = msg.editedAt;
    res.json({
      messages: t.messages,
      needsHuman: !!t.needsHuman,
      userId: String(req.userId),
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.delete('/api/support/messages', requireAuth, (req, res) => {
  const messageId = String(req.body?.messageId ?? '').trim();
  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => x.id === req.userId);
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const t = getSupportThread(db, req.userId, u);
    if (!Array.isArray(t.messages)) t.messages = [];
    const i = supportMessageIndex(t.messages, messageId);
    if (i === -1) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    const msg = t.messages[i];
    if (msg.role !== 'user') {
      res.status(403).json({ error: 'You can only delete your own messages' });
      return;
    }
    t.messages.splice(i, 1);
    t.updatedAt = new Date().toISOString();
    res.json({
      messages: t.messages,
      needsHuman: !!t.needsHuman,
      userId: String(req.userId),
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.patch('/api/admin/support/messages', requireAdmin, (req, res) => {
  const uid = String(req.body?.userId ?? '').trim();
  const messageId = String(req.body?.messageId ?? '').trim();
  if (!uid || !messageId) return res.status(400).json({ error: 'userId and messageId required' });
  const removeImage = req.body?.removeImage === true;
  const image = sanitizeSupportImageDataUrl(req.body?.image);
  const hasTextKey = typeof req.body?.text === 'string';
  const newBody = hasTextKey ? sanitizeSupportText(req.body.text, 4000) : null;
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => String(x.id) === uid);
    const t = getSupportThread(db, uid, u || null);
    if (!Array.isArray(t.messages)) t.messages = [];
    const i = supportMessageIndex(t.messages, messageId);
    if (i === -1) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    const msg = t.messages[i];
    if (msg.role !== 'admin') {
      res.status(403).json({ error: 'You can only edit your own admin messages' });
      return;
    }
    if (hasTextKey) msg.body = newBody;
    if (removeImage) delete msg.image;
    else if (image) msg.image = image;
    const bodyOk = String(msg.body ?? '').trim().length > 0;
    const hasImg = !!msg.image;
    if (!bodyOk && !hasImg) {
      res.status(400).json({ error: 'Message must have text or an image' });
      return;
    }
    msg.editedAt = new Date().toISOString();
    t.updatedAt = msg.editedAt;
    res.json({
      messages: supportMessagesForAdminResponse(t.messages),
      userId: t.userId,
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

app.delete('/api/admin/support/messages', requireAdmin, (req, res) => {
  const uid = String(req.body?.userId ?? '').trim();
  const messageId = String(req.body?.messageId ?? '').trim();
  if (!uid || !messageId) return res.status(400).json({ error: 'userId and messageId required' });
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
    const u = db.users.find((x) => String(x.id) === uid);
    const t = getSupportThread(db, uid, u || null);
    if (!Array.isArray(t.messages)) t.messages = [];
    const i = supportMessageIndex(t.messages, messageId);
    if (i === -1) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    const msg = t.messages[i];
    if (msg.role !== 'admin') {
      res.status(403).json({ error: 'You can only delete your own admin messages' });
      return;
    }
    t.messages.splice(i, 1);
    t.updatedAt = new Date().toISOString();
    res.json({
      messages: supportMessagesForAdminResponse(t.messages),
      userId: t.userId,
    });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

setInterval(() => {
  withDb((db) => {
    supportSweepSupportThreadsJson(db);
  }).catch(() => {});
}, 60_000);

app.listen(PORT, () => {
  console.log(`[dataplus-api] http://localhost:${PORT}`);
});
