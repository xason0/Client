import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { readDb, writeDb, withDb, defaultBundles } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env.local') });
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '.env') });

const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-dataplus-secret-change-me';
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();
/** Keep in sync with `MIN_WALLET_TOPUP_GHS` in `src/App.jsx`. Override via WALLET_MIN_TOPUP_GHS. */
const MIN_WALLET_TOPUP_GHS = Math.max(0.01, Number(process.env.WALLET_MIN_TOPUP_GHS ?? 1));
const MIN_WALLET_TOPUP_PESEWAS = Math.round(MIN_WALLET_TOPUP_GHS * 100);

if (JWT_SECRET === 'dev-dataplus-secret-change-me' || ADMIN_PIN === '1234') {
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

const DEFAULT_CLIENT_APP_ORIGIN = (process.env.NODE_ENV === 'production' ? 'https://client.ultraxas.com' : 'http://localhost:5173');
function resolveClientAppOrigin() {
  const raw = (process.env.CLIENT_PUBLIC_URL || process.env.PAYSTACK_CALLBACK_URL || DEFAULT_CLIENT_APP_ORIGIN).trim();
  return raw.replace(/\/$/, '');
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
  res.redirect(302, `${resolveClientAppOrigin()}${req.originalUrl}`);
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
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
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
      callbackUrl: resolveClientAppOrigin(),
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
  const list = db.users.map((u) => ({
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
    if (!u) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    u.role = role;
    res.json({ ok: true });
  }).catch(() => res.status(500).json({ error: 'Server error' }));
});

function formatAgentApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    full_name: row.full_name || row.name || '',
    phone: row.phone || '',
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

app.listen(PORT, () => {
  console.log(`[dataplus-api] http://localhost:${PORT}`);
});
