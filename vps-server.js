import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env');
  try {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const s = line.trim();
      if (!s || s.startsWith('#')) continue;
      const eq = s.indexOf('=');
      if (eq === -1) continue;
      const key = s.slice(0, eq).trim();
      let val = s.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch (_) {}
}
loadLocalEnv();

// Add phone column if missing (existing DBs)
try {
  db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
} catch (_) {}
// Add role column if missing (existing DBs)
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
} catch (_) {}
// Add network column to orders if missing
try {
  db.exec('ALTER TABLE orders ADD COLUMN network TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE transactions ADD COLUMN description TEXT');
} catch (_) {}
try {
  db.exec("ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'completed'");
} catch (_) {}
try {
  db.exec('ALTER TABLE support_threads ADD COLUMN user_typing_at TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE support_threads ADD COLUMN admin_typing_at TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE support_messages ADD COLUMN edited_at TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE support_messages ADD COLUMN reply_to_id TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE support_messages ADD COLUMN reply_preview TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE support_messages ADD COLUMN reply_role TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE support_threads ADD COLUMN auto_clear_at TEXT');
} catch (_) {}

try {
  db.exec(`CREATE TABLE IF NOT EXISTS afa_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    ghana_card_number TEXT NOT NULL,
    occupation TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    payment_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    applied_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
} catch (_) {}
// Default bundle definitions (admin can change via API)
const DEFAULT_BUNDLES = {
  mtn: [
    { size: '1 GB', price: 4.20 }, { size: '2 GB', price: 8.40 }, { size: '3 GB', price: 12.30 },
    { size: '4 GB', price: 16.20 }, { size: '5 GB', price: 20.50 }, { size: '6 GB', price: 25.00 },
    { size: '7 GB', price: 28.80 }, { size: '8 GB', price: 33.00 }, { size: '10 GB', price: 41.00 },
    { size: '15 GB', price: 61.00 }, { size: '20 GB', price: 80.00 }, { size: '25 GB', price: 98.00 },
    { size: '30 GB', price: 118.00 }, { size: '40 GB', price: 154.00 }, { size: '50 GB', price: 193.00 },
  ],
  telecel: [
    { size: '10 GB', price: 39.00 }, { size: '12 GB', price: 44.00 }, { size: '15 GB', price: 56.00 },
    { size: '20 GB', price: 75.00 }, { size: '25 GB', price: 94.00 }, { size: '30 GB', price: 110.00 },
    { size: '35 GB', price: 129.00 }, { size: '40 GB', price: 143.00 }, { size: '50 GB', price: 183.00 },
    { size: '100 GB', price: 350.00 },
  ],
  bigtime: [
    { size: '20 GB', price: 60.00 }, { size: '25 GB', price: 65.00 }, { size: '30 GB', price: 75.00 },
    { size: '40 GB', price: 85.00 }, { size: '50 GB', price: 95.00 }, { size: '60 GB', price: 135.00 },
    { size: '80 GB', price: 170.00 }, { size: '100 GB', price: 200.00 }, { size: '200 GB', price: 370.00 },
  ],
  ishare: [
    { size: '1 GB', price: 4.20 }, { size: '2 GB', price: 8.20 }, { size: '3 GB', price: 12.00 },
    { size: '4 GB', price: 16.00 }, { size: '5 GB', price: 19.00 }, { size: '6 GB', price: 23.00 },
    { size: '7 GB', price: 28.30 }, { size: '8 GB', price: 32.80 }, { size: '9 GB', price: 36.90 },
    { size: '10 GB', price: 39.00 }, { size: '15 GB', price: 55.00 },
  ],
};

function getBundlesFromDb() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'bundles'").get();
  if (!row?.value) return DEFAULT_BUNDLES;
  try {
    const parsed = JSON.parse(row.value);
    if (parsed && typeof parsed === 'object' && parsed.mtn && Array.isArray(parsed.mtn)) return parsed;
  } catch (_) {}
  return DEFAULT_BUNDLES;
}

// Ensure app_settings exists and has default logo + default bundles
try {
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')))`);
  const def = db.prepare("SELECT value FROM app_settings WHERE key = 'sidebar_logo_url'").get();
  if (!def) {
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('sidebar_logo_url', ?)").run('https://files.catbox.moe/l3islw.jpg');
  }
  const bundlesRow = db.prepare("SELECT value FROM app_settings WHERE key = 'bundles'").get();
  if (!bundlesRow) {
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('bundles', ?)").run(JSON.stringify(DEFAULT_BUNDLES));
  }
} catch (_) {}

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dataplus-jwt-secret-change-in-production';
const ADMIN_PIN_ENV = process.env.ADMIN_PIN != null ? String(process.env.ADMIN_PIN).trim() : '';
const ADMIN_PIN =
  !ADMIN_PIN_ENV || ADMIN_PIN_ENV === '1234' ? '0701' : ADMIN_PIN_ENV;
if (ADMIN_PIN_ENV === '1234') {
  console.warn(
    '[dataplus-api] ADMIN_PIN was 1234 in environment; using 0701. Set ADMIN_PIN=0701 in hosting env and remove 1234.'
  );
}
const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();
const MIN_WALLET_TOPUP_GHS = Math.max(0.01, Number(process.env.WALLET_MIN_TOPUP_GHS ?? 1));
const MIN_WALLET_TOPUP_PESEWAS = Math.round(MIN_WALLET_TOPUP_GHS * 100);
const AFA_REGISTRATION_FEE_GHS = Math.max(0.01, Number(process.env.AFA_REGISTRATION_FEE_GHS ?? 14));

function paystackConfigured() {
  return Boolean(PAYSTACK_SECRET_KEY);
}

/** Where the SPA lives after Paystack redirects (must not be the API host only). */
const DEFAULT_CLIENT_APP_ORIGIN = 'https://client.ultraxas.com';
function resolveClientAppOrigin() {
  const raw = (process.env.CLIENT_PUBLIC_URL || process.env.PAYSTACK_CALLBACK_URL || DEFAULT_CLIENT_APP_ORIGIN).trim();
  return raw.replace(/\/$/, '');
}

app.use(cors({ origin: true, credentials: true }));
// Allow larger payloads for admin settings (e.g. base64 logo images)
app.use(express.json({ limit: '10mb' }));

/** Safe publishable Paystack key for the SPA (no secret). */
app.get('/api/public/config', (req, res) => {
  const paystackPublicKey = (process.env.PAYSTACK_PUBLIC_KEY || process.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim();
  res.json({
    paystackPublicKey,
    paystackEnabled: paystackConfigured(),
  });
});

/** If Paystack callback URL pointed at the API host, users land here with ?reference= — send them to the SPA. */
app.get('/', (req, res) => {
  res.redirect(302, `${resolveClientAppOrigin()}${req.originalUrl}`);
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    let uid = payload.userId ?? payload.sub;
    if ((uid == null || uid === '') && payload.adminPin === true) {
      const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1").get();
      uid = adminUser?.id;
    }
    if (uid == null || uid === '') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.userId = uid;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function adminAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.adminPin === true) {
      req.adminAccess = true;
      return next();
    }
    const adminUid = payload.userId ?? payload.sub;
    if (adminUid != null && adminUid !== '') {
      const user = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUid);
      if (user && user.role === 'admin') {
        req.userId = adminUid;
        req.adminAccess = true;
        return next();
      }
    }
    return res.status(403).json({ error: 'Admin access required' });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---- Auth ----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const phoneRaw = typeof phone === 'string' ? phone.trim() : '';
    const phoneDigits = phoneRaw.replace(/\D/g, '');
    if (!phoneRaw || phoneDigits.length < 8) {
      return res.status(400).json({ error: 'Please enter a valid phone number (at least 8 digits).' });
    }
    const em = email.trim().toLowerCase();
    const banned = db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NOT NULL').get(em);
    if (banned) {
      return res.status(403).json({ error: 'This email was deleted or banned and cannot be used again.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(em);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    const phoneRows = db.prepare('SELECT phone FROM users WHERE phone IS NOT NULL AND trim(phone) != ?').all('');
    for (const row of phoneRows) {
      const d = String(row.phone || '').replace(/\D/g, '');
      if (d.length >= 8 && d === phoneDigits) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      "INSERT INTO users (email, password_hash, full_name, phone, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run(em, hash, (fullName || '').trim() || null, phoneRaw);
    const userId = result.lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance) VALUES (?, 0)').run(userId);
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    const user = db.prepare('SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?').get(userId);
    return res.json({ token, user: { ...user, role: user?.role || 'user' } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = db
    .prepare('SELECT id, email, full_name, phone, role, password_hash, created_at, deleted_at FROM users WHERE email = ?')
    .get(email.trim().toLowerCase());
  if (user && user.deleted_at) {
    return res.status(403).json({ error: 'Account deleted or banned. Contact support.' });
  }
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const role = user.role || 'user';
  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone ?? null,
      created_at: user.created_at || null,
      role,
    },
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const avatarRow = db.prepare('SELECT avatar FROM user_avatars WHERE user_id = ?').get(req.userId);
  return res.json({ ...user, profile_avatar: avatarRow?.avatar || null });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const { fullName, email, phone } = req.body || {};
  const userId = req.userId;
  const current = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  if (!current) return res.status(404).json({ error: 'User not found' });
  const newEmail = typeof email === 'string' ? email.trim().toLowerCase() : null;
  if (newEmail !== null) {
    const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(newEmail, userId);
    if (taken) return res.status(400).json({ error: 'Email already in use' });
  }
  const newName = typeof fullName === 'string' ? fullName.trim() || null : undefined;
  const newPhone = typeof phone === 'string' ? phone.trim() || null : undefined;
  if (newName !== undefined) {
    db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(newName, userId);
  }
  if (newEmail !== null) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, userId);
  }
  if (newPhone !== undefined) {
    db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(newPhone, userId);
  }
  const user = db.prepare('SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?').get(userId);
  const avatarRow = db.prepare('SELECT avatar FROM user_avatars WHERE user_id = ?').get(userId);
  return res.json({ ...user, profile_avatar: avatarRow?.avatar || null });
});

app.put('/api/profile/password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const currentOk = bcrypt.compareSync(currentPassword, user.password_hash);
  if (!currentOk) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const sameAsOld = bcrypt.compareSync(newPassword, user.password_hash);
  if (sameAsOld) {
    return res.status(400).json({ error: 'New password must be different from your current password' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.userId);
  return res.json({ ok: true });
});

app.put('/api/profile/avatar', authMiddleware, (req, res) => {
  const avatar = req.body?.avatar === null || req.body?.avatar === '' ? null : (typeof req.body?.avatar === 'string' ? req.body.avatar.trim() : null);
  if (avatar !== null && (!avatar || !avatar.startsWith('data:image/'))) {
    return res.status(400).json({ error: 'Valid image data required' });
  }
  db.prepare("INSERT INTO user_avatars (user_id, avatar, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET avatar = excluded.avatar, updated_at = datetime('now')").run(req.userId, avatar);
  return res.json({ profile_avatar: avatar });
});

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
    throw new Error(data.message || data.data?.message || data.error || 'Paystack initialize failed');
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
    throw new Error(data.message || data.data?.message || data.error || 'Verification failed');
  }
  return data.data;
}

function ghsFromPaystackAmount(amountPesewas) {
  const n = Number(amountPesewas);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n) / 100;
}

function applyWalletTopUpFromPaystack(userId, reference, amountGhs) {
  const dup = db.prepare("SELECT id FROM transactions WHERE user_id = ? AND reference = ? AND type = 'topup'").get(userId, reference);
  if (dup) {
    const w = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(userId);
    return { balance: w ? w.balance : 0, already: true };
  }
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance) VALUES (?, 0)').run(userId);
  db.prepare("UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE user_id = ?").run(amountGhs, userId);
  db.prepare(
    "INSERT INTO transactions (user_id, type, amount, reference, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(userId, 'topup', amountGhs, reference, 'Wallet top-up (Paystack)', 'completed');
  const w = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(userId);
  return { balance: w.balance, already: false };
}

// ---- Wallet ----
app.get('/api/wallet', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT balance, updated_at FROM wallets WHERE user_id = ?').get(req.userId);
  return res.json({ balance: row ? row.balance : 0, updated_at: row?.updated_at || null });
});

app.post('/api/wallet/topup', authMiddleware, (req, res) => {
  if (paystackConfigured()) {
    return res.status(400).json({ error: 'Use Paystack to top up your wallet' });
  }
  const amount = parseFloat(req.body?.amount);
  if (!Number.isFinite(amount) || amount < MIN_WALLET_TOPUP_GHS) {
    return res.status(400).json({ error: `Minimum top-up is GHS ${MIN_WALLET_TOPUP_GHS}` });
  }
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance) VALUES (?, 0)').run(req.userId);
  db.prepare("UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE user_id = ?").run(amount, req.userId);
  const ref = `TOPUP-${Date.now()}`;
  db.prepare(
    "INSERT INTO transactions (user_id, type, amount, reference, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(req.userId, 'topup', amount, ref, 'Wallet top-up', 'completed');
  const w = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(req.userId);
  return res.json({ balance: w.balance });
});

app.post('/api/wallet/paystack/initialize', authMiddleware, async (req, res) => {
  if (!paystackConfigured()) {
    return res.status(503).json({ error: 'Paystack is not configured on this server' });
  }
  const amount = parseFloat(req.body?.amount);
  if (!Number.isFinite(amount) || amount < MIN_WALLET_TOPUP_GHS) {
    return res.status(400).json({ error: `Minimum top-up is GHS ${MIN_WALLET_TOPUP_GHS}` });
  }
  const amountPesewas = Math.round(amount * 100);
  if (amountPesewas < MIN_WALLET_TOPUP_PESEWAS) {
    return res.status(400).json({ error: `Minimum top-up is GHS ${MIN_WALLET_TOPUP_GHS}` });
  }
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const email = (user.email || '').trim() || `user-${user.id}@wallet.local`;
  const reference = `WT-${String(user.id).slice(0, 8)}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  try {
    const data = await paystackInitializeTransaction({
      email,
      amountPesewas,
      reference,
      metadata: { user_id: String(user.id) },
      callbackUrl: resolveClientAppOrigin(),
    });
    return res.json({
      access_code: data.access_code,
      reference: data.reference,
      authorization_url: data.authorization_url,
    });
  } catch (e) {
    console.error('[paystack initialize]', e);
    return res.status(502).json({ error: e.message || 'Paystack error' });
  }
});

app.post('/api/wallet/paystack/verify', authMiddleware, async (req, res) => {
  if (!paystackConfigured()) {
    return res.status(503).json({ error: 'Paystack is not configured' });
  }
  const reference = String(req.body?.reference || '').trim();
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
    const creditResult = applyWalletTopUpFromPaystack(req.userId, reference, amountGhs);
    return res.json({ balance: creditResult.balance, reference });
  } catch (e) {
    console.error('[paystack verify]', e);
    return res.status(400).json({ error: e.message || 'Verification failed' });
  }
});

app.get('/api/wallet/transactions', authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, type, amount, reference, created_at,
        COALESCE(description, '') AS description,
        COALESCE(status, 'completed') AS status
       FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`
    )
    .all(req.userId);
  return res.json(rows);
});

// ---- Admin (PIN or logged-in admin) ----
app.post('/api/admin/verify-pin', (req, res) => {
  const pin = String(req.body?.pin ?? '').trim();
  if (!pin) {
    return res.status(400).json({ error: 'PIN required' });
  }
  const expected = ADMIN_PIN;
  if (pin !== expected) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }
  const token = jwt.sign({ adminPin: true }, JWT_SECRET, { expiresIn: '8h' });
  return res.json({ token });
});

app.get('/api/admin/stats', adminAuthMiddleware, (req, res) => {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString().slice(0, 10);

  const userCount = db.prepare('SELECT COUNT(*) as n FROM users').get()?.n ?? 0;
  const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'admin'").get()?.n ?? 0;
  const orderCount = db.prepare('SELECT COUNT(*) as n FROM orders').get()?.n ?? 0;
  const processingOrders =
    db.prepare("SELECT COUNT(*) as n FROM orders WHERE LOWER(COALESCE(status,'')) NOT IN ('completed','failed')").get()?.n ?? 0;
  const completedOrders = db.prepare("SELECT COUNT(*) as n FROM orders WHERE LOWER(COALESCE(status,'')) = 'completed'").get()?.n ?? 0;
  const totalRevenue = db
    .prepare("SELECT COALESCE(SUM(bundle_price), 0) as total FROM orders WHERE LOWER(COALESCE(status,'')) = 'completed'")
    .get()?.total ?? 0;
  const totalTopUps = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'topup' AND amount > 0").get()?.total ?? 0;
  const totalWalletBalance = db.prepare('SELECT COALESCE(SUM(balance), 0) as total FROM wallets').get()?.total ?? 0;

  const dailyOrders = db.prepare("SELECT COUNT(*) as n FROM orders WHERE date(created_at) = date('now', 'localtime')").get()?.n ?? 0;
  const dailyCompleted =
    db
      .prepare(
        "SELECT COUNT(*) as n FROM orders WHERE LOWER(COALESCE(status,'')) = 'completed' AND date(created_at) = date('now', 'localtime')"
      )
      .get()?.n ?? 0;
  const dailyProcessing =
    db
      .prepare(
        "SELECT COUNT(*) as n FROM orders WHERE LOWER(COALESCE(status,'')) NOT IN ('completed','failed') AND date(created_at) = date('now', 'localtime')"
      )
      .get()?.n ?? 0;
  const dailyRevenue =
    db
      .prepare(
        "SELECT COALESCE(SUM(bundle_price),0) as t FROM orders WHERE LOWER(COALESCE(status,'')) = 'completed' AND date(created_at) = date('now', 'localtime')"
      )
      .get()?.t ?? 0;
  const dailyTransactionCount =
    db.prepare("SELECT COUNT(*) as n FROM transactions WHERE date(created_at) = date('now', 'localtime')").get()?.n ?? 0;
  const dailyTopUps =
    db
      .prepare(
        "SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type = 'topup' AND amount > 0 AND date(created_at) = date('now', 'localtime')"
      )
      .get()?.t ?? 0;
  const dailyPaymentsOut =
    db
      .prepare(
        "SELECT COALESCE(SUM(ABS(amount)),0) as t FROM transactions WHERE type = 'payment' AND amount < 0 AND date(created_at) = date('now', 'localtime')"
      )
      .get()?.t ?? 0;
  const dailyNetFlow = Number(dailyTopUps) - Number(dailyPaymentsOut);

  return res.json({
    userCount,
    adminCount,
    orderCount,
    processingOrders,
    completedOrders,
    totalRevenue: Number(totalRevenue),
    totalTopUps: Number(totalTopUps),
    dailyOrders,
    dailyCompleted,
    dailyProcessing,
    dailyRevenue: Number(dailyRevenue),
    dailyTransactionCount,
    dailyNetFlow,
    dailyTopUps: Number(dailyTopUps),
    totalWalletBalance: Number(totalWalletBalance),
  });
});

app.get('/api/admin/users', adminAuthMiddleware, (req, res) => {
  const rows = db.prepare('SELECT id, email, full_name, phone, role, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 500').all();
  return res.json(rows);
});

app.patch('/api/admin/users/:userId/role', adminAuthMiddleware, (req, res) => {
  const role = String(req.body?.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const uid = parseInt(req.params.userId, 10);
  if (!Number.isFinite(uid)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const r = db.prepare('UPDATE users SET role = ? WHERE id = ? AND deleted_at IS NULL').run(role, uid);
  if (r.changes === 0) return res.status(404).json({ error: 'User not found' });
  return res.json({ ok: true });
});

app.delete('/api/admin/users/:userId', adminAuthMiddleware, (req, res) => {
  const uid = parseInt(req.params.userId, 10);
  if (!Number.isFinite(uid)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (Number(req.userId) === uid) {
    return res.status(400).json({ error: 'You cannot delete your own account from admin panel' });
  }
  const r = db.prepare("UPDATE users SET deleted_at = datetime('now'), deleted_by = ?, role = 'user', password_hash = ? WHERE id = ? AND deleted_at IS NULL")
    .run(String(req.userId || 'admin-pin'), bcrypt.hashSync(String(Date.now()) + '-' + uid, 10), uid);
  if (r.changes === 0) return res.status(404).json({ error: 'User not found' });
  return res.json({ ok: true });
});


app.get('/api/admin/wallets', adminAuthMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.full_name, u.created_at,
              COALESCE(w.balance, 0) AS balance,
              w.updated_at AS wallet_updated_at
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       ORDER BY datetime(COALESCE(w.updated_at, u.created_at)) DESC`
    )
    .all();
  return res.json(rows);
});

app.post('/api/admin/wallets/:userId/credit', adminAuthMiddleware, (req, res) => {
  const uid = parseInt(req.params.userId, 10);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'Invalid user id' });
  const amount = parseFloat(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount required' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance) VALUES (?, 0)').run(uid);
  db.prepare("UPDATE wallets SET balance = balance + ?, updated_at = datetime('now') WHERE user_id = ?").run(amount, uid);
  const ref = `ADMIN-CREDIT-${Date.now()}`;
  db.prepare(
    "INSERT INTO transactions (user_id, type, amount, reference, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(uid, 'topup', amount, ref, 'Admin credit', 'completed');
  const w = db.prepare('SELECT balance, updated_at FROM wallets WHERE user_id = ?').get(uid);
  return res.json({ balance: w.balance, updated_at: w.updated_at });
});

app.post('/api/admin/wallets/:userId/debit', adminAuthMiddleware, (req, res) => {
  const uid = parseInt(req.params.userId, 10);
  if (!Number.isFinite(uid)) return res.status(400).json({ error: 'Invalid user id' });
  const amount = parseFloat(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid positive amount required' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance) VALUES (?, 0)').run(uid);
  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(uid);
  const bal = wallet ? wallet.balance : 0;
  if (bal < amount) {
    return res.status(400).json({ error: 'Insufficient balance', balance: bal });
  }
  db.prepare("UPDATE wallets SET balance = balance - ?, updated_at = datetime('now') WHERE user_id = ?").run(amount, uid);
  const ref = `ADMIN-DEBIT-${Date.now()}`;
  db.prepare(
    "INSERT INTO transactions (user_id, type, amount, reference, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(uid, 'payment', -amount, ref, 'Admin debit', 'completed');
  const w = db.prepare('SELECT balance, updated_at FROM wallets WHERE user_id = ?').get(uid);
  return res.json({ balance: w.balance, updated_at: w.updated_at });
});

function networkLabel(net) {
  const n = (net || 'mtn').toString().toLowerCase();
  return { mtn: 'MTN', telecel: 'Telecel', bigtime: 'AT BigTime', ishare: 'AT iShare' }[n] || 'MTN';
}

app.get('/api/admin/orders', adminAuthMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.id, o.user_id, o.bundle_size, o.bundle_price, o.recipient_number, o.network, o.status, o.created_at,
              u.email AS user_email, u.full_name AS customer_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       ORDER BY datetime(o.created_at) DESC
       LIMIT 500`
    )
    .all();
  const list = rows.map((o) => {
    const net = networkLabel(o.network);
    const ordNum = `ORD-${String(o.id).padStart(6, '0')}`;
    return {
      id: o.id,
      order_number: ordNum,
      user_id: o.user_id,
      bundle_size: o.bundle_size,
      bundle_price: o.bundle_price,
      recipient_number: o.recipient_number,
      network: o.network,
      status: o.status,
      created_at: o.created_at,
      customer_name: o.customer_name || 'Unknown',
      full_name: o.customer_name,
      user_email: o.user_email || '',
      email: o.user_email,
      recipient: o.recipient_number,
      phone_number: o.recipient_number,
      amount: o.bundle_price,
      reference: `DP-${o.id}-${Date.parse(o.created_at) || 0}`,
      payment_reference: `DP-${o.id}`,
      package_title: `${net} ${o.bundle_size || ''}`.trim(),
      package_subtitle: `${o.bundle_size || ''} • ${net} Ghana`,
    };
  });
  return res.json(list);
});

function sendAdminTransactions(_req, res) {
  const rows = db
    .prepare(
      `SELECT t.id, t.user_id, t.type, t.amount, t.reference, t.created_at,
              COALESCE(t.description, '') AS description,
              COALESCE(t.status, 'completed') AS status,
              u.email AS user_email,
              u.full_name AS full_name
       FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY datetime(t.created_at) DESC
       LIMIT 2000`
    )
    .all();
  return res.json(rows);
}

app.get('/api/admin/transactions', adminAuthMiddleware, sendAdminTransactions);
app.get('/api/admin/wallet/transactions', adminAuthMiddleware, sendAdminTransactions);
app.get('/api/transactions', adminAuthMiddleware, sendAdminTransactions);

app.get('/api/settings', (req, res) => {
  const sidebarLogo = db.prepare("SELECT value FROM app_settings WHERE key = 'sidebar_logo_url'").get();
  return res.json({
    sidebarLogoUrl: sidebarLogo?.value || 'https://files.catbox.moe/l3islw.jpg',
  });
});

app.put('/api/admin/settings', adminAuthMiddleware, (req, res) => {
  const { sidebarLogoUrl } = req.body || {};
  if (typeof sidebarLogoUrl === 'string' && sidebarLogoUrl.trim()) {
    db.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('sidebar_logo_url', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    ).run(sidebarLogoUrl.trim());
  }
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'sidebar_logo_url'").get();
  return res.json({ sidebarLogoUrl: row?.value || 'https://files.catbox.moe/l3islw.jpg' });
});

// ---- Bundles (public) ----
app.get('/api/bundles', (req, res) => {
  return res.json(getBundlesFromDb());
});

app.put('/api/admin/bundles', adminAuthMiddleware, (req, res) => {
  const raw = req.body?.bundles;
  if (!raw || typeof raw !== 'object') {
    return res.status(400).json({ error: 'bundles object required' });
  }
  const networks = ['mtn', 'telecel', 'bigtime', 'ishare'];
  const bundles = {};
  for (const net of networks) {
    const arr = raw[net];
    if (!Array.isArray(arr)) {
      bundles[net] = DEFAULT_BUNDLES[net] || [];
      continue;
    }
    bundles[net] = arr
      .map((b) => {
        const size = typeof b.size === 'string' ? b.size.trim() : String(b.size || '').trim();
        const price = Number(b.price);
        if (!size || !Number.isFinite(price) || price < 0) return null;
        return { size, price };
      })
      .filter(Boolean);
  }
  db.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('bundles', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(JSON.stringify(bundles));
  return res.json({ bundles: getBundlesFromDb() });
});

// ---- Orders ----
app.get('/api/orders', authMiddleware, (req, res) => {
  const rows = db.prepare("SELECT id, bundle_size, bundle_price, recipient_number, network, status, COALESCE(created_at, datetime('now')) AS created_at FROM orders WHERE user_id = ? ORDER BY datetime(COALESCE(created_at, '1970-01-01 00:00:00')) DESC, id DESC").all(req.userId);
  return res.json(rows);
});

app.post('/api/orders', authMiddleware, (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items required' });
  }
  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(req.userId);
  const balance = wallet ? wallet.balance : 0;
  let total = 0;
  for (const it of items) {
    const p = parseFloat(it.bundle_price ?? it.price);
    if (Number.isFinite(p)) total += p;
  }
  if (balance < total) {
    return res.status(400).json({ error: 'Insufficient balance', balance, required: total });
  }
  const orderIds = [];
  for (const it of items) {
    const price = parseFloat(it.bundle_price ?? it.price) || 0;
    const network = typeof it.network === 'string' ? it.network.trim() || null : null;
    const result = db.prepare(
      "INSERT INTO orders (user_id, bundle_size, bundle_price, recipient_number, network, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
    ).run(req.userId, it.bundle_size ?? it.size ?? '', price, it.recipientNumber ?? it.recipient_number ?? null, network, 'processing');
    orderIds.push(result.lastInsertRowid);
  }
  db.prepare("UPDATE wallets SET balance = balance - ?, updated_at = datetime('now') WHERE user_id = ?").run(total, req.userId);
  const payRef = `CART-${Date.now()}`;
  db.prepare(
    "INSERT INTO transactions (user_id, type, amount, reference, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(req.userId, 'payment', -total, payRef, `Wallet checkout (${items.length} item(s))`, 'completed');
  return res.json({ orderIds, balance: balance - total });
});

app.get('/api/afa-applications', authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, user_id, full_name, phone, ghana_card_number, occupation, date_of_birth,
              payment_amount, status, applied_at, updated_at
       FROM afa_applications
       WHERE user_id = ?
       ORDER BY datetime(applied_at) DESC, id DESC
       LIMIT 200`
    )
    .all(req.userId);
  return res.json(rows);
});

app.post('/api/afa-applications', authMiddleware, (req, res) => {
  const fullName = String(req.body?.full_name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const ghanaCardNumber = String(req.body?.ghana_card_number || '').trim();
  const occupation = String(req.body?.occupation || '').trim();
  const dateOfBirth = String(req.body?.date_of_birth || '').trim();
  if (!fullName || !phone || !ghanaCardNumber || !occupation || !dateOfBirth) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const wallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(req.userId);
  const balance = wallet ? Number(wallet.balance || 0) : 0;
  if (balance < AFA_REGISTRATION_FEE_GHS) {
    return res.status(400).json({ error: 'Insufficient balance', balance, fee: AFA_REGISTRATION_FEE_GHS });
  }
  db.prepare("UPDATE wallets SET balance = balance - ?, updated_at = datetime('now') WHERE user_id = ?").run(AFA_REGISTRATION_FEE_GHS, req.userId);
  const result = db
    .prepare(
      `INSERT INTO afa_applications
        (user_id, full_name, phone, ghana_card_number, occupation, date_of_birth, payment_amount, status, applied_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`
    )
    .run(req.userId, fullName, phone, ghanaCardNumber, occupation, dateOfBirth, AFA_REGISTRATION_FEE_GHS);
  db.prepare(
    "INSERT INTO transactions (user_id, type, amount, reference, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(req.userId, 'payment', -AFA_REGISTRATION_FEE_GHS, `AFA-${Date.now()}`, `AFA registration fee (${fullName})`, 'completed');
  const created = db
    .prepare(
      `SELECT id, user_id, full_name, phone, ghana_card_number, occupation, date_of_birth,
              payment_amount, status, applied_at, updated_at
       FROM afa_applications WHERE id = ?`
    )
    .get(result.lastInsertRowid);
  const nextWallet = db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(req.userId);
  return res.json({ ok: true, application: created, balance: Number(nextWallet?.balance || 0) });
});

app.patch('/api/admin/orders/:orderId/status', adminAuthMiddleware, (req, res) => {
  const status = String(req.body?.status || '').trim().toLowerCase();
  const allowed = new Set(['processing', 'completed', 'failed']);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: 'Invalid status. Use processing, completed, or failed.' });
  }
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  const current = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
  if (!current) {
    return res.status(404).json({ error: 'Order not found' });
  }
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
  const updated = db.prepare('SELECT id, user_id, bundle_size, bundle_price, recipient_number, network, status, created_at FROM orders WHERE id = ?').get(orderId);
  return res.json(updated);
});

app.get('/api/admin/agent-applications', adminAuthMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.id, a.user_id, a.full_name, a.phone, a.ghana_card_number, a.occupation, a.date_of_birth,
              a.payment_amount, a.status, a.applied_at, a.updated_at, u.email AS user_email
       FROM afa_applications a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY datetime(a.applied_at) DESC, a.id DESC
       LIMIT 1000`
    )
    .all();
  return res.json(rows);
});

app.patch('/api/admin/agent-applications/:id', adminAuthMiddleware, (req, res) => {
  const status = String(req.body?.status || '').trim().toLowerCase();
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  const row = db.prepare('SELECT id FROM afa_applications WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Application not found' });
  db.prepare("UPDATE afa_applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  const updated = db
    .prepare(
      `SELECT a.id, a.user_id, a.full_name, a.phone, a.ghana_card_number, a.occupation, a.date_of_birth,
              a.payment_amount, a.status, a.applied_at, a.updated_at, u.email AS user_email
       FROM afa_applications a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.id = ?`
    )
    .get(id);
  return res.json(updated);
});

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

function getBroadcastsFromDb() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'broadcasts'").get();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBroadcastsToDb(list) {
  db.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('broadcasts', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run(JSON.stringify(list));
}

app.get('/api/broadcasts', (req, res) => {
  const list = getBroadcastsFromDb();
  const out = list
    .filter((b) => b && b.active !== false && String(b.image_url || '').trim())
    .map((b) => {
      const cta_url = sanitizeBroadcastCtaUrl(b.cta_url);
      const cta_label = sanitizeBroadcastCtaLabel(b.cta_label);
      const cta_open_new_tab = b.cta_open_new_tab !== false;
      return {
        id: b.id,
        caption: String(b.caption || '').trim(),
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
  return res.json(out);
});

app.get('/api/admin/broadcasts', adminAuthMiddleware, (req, res) => {
  const list = getBroadcastsFromDb();
  return res.json([...list].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)));
});

app.post('/api/admin/broadcasts', adminAuthMiddleware, (req, res) => {
  const caption = String(req.body?.caption ?? '').trim();
  const image_url = String(req.body?.image_url ?? '').trim();
  const active = req.body?.active !== false;
  const popup_delay_seconds = clampBroadcastInt(req.body?.popup_delay_seconds, 0, 600, 2);
  const auto_close_seconds = clampBroadcastInt(req.body?.auto_close_seconds, 0, 86400, 0);
  const reshow_after_hours = broadcastReshowHoursFromBody(req.body);
  const cta_url = sanitizeBroadcastCtaUrl(req.body?.cta_url);
  const cta_label = sanitizeBroadcastCtaLabel(req.body?.cta_label);
  const cta_open_new_tab = req.body?.cta_open_new_tab !== false;
  if (!image_url) {
    return res.status(400).json({ error: 'Image is required (upload a file or paste an image URL)' });
  }
  if (image_url.length > MAX_BROADCAST_IMAGE_LEN) {
    return res.status(413).json({ error: 'Image data too large; use a smaller file or host the image elsewhere' });
  }
  const list = getBroadcastsFromDb();
  const row = {
    id: randomUUID(),
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
  list.push(row);
  saveBroadcastsToDb(list);
  return res.status(201).json(row);
});

app.patch('/api/admin/broadcasts/:id', adminAuthMiddleware, (req, res) => {
  const list = getBroadcastsFromDb();
  const row = list.find((x) => String(x.id) === String(req.params.id));
  if (!row) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.body.caption != null) row.caption = String(req.body.caption).trim();
  if (req.body.image_url != null) {
    const u = String(req.body.image_url).trim();
    if (u.length > MAX_BROADCAST_IMAGE_LEN) {
      return res.status(413).json({ error: 'Image data too large' });
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
  saveBroadcastsToDb(list);
  return res.json(row);
});

app.delete('/api/admin/broadcasts/:id', adminAuthMiddleware, (req, res) => {
  const list = getBroadcastsFromDb();
  const i = list.findIndex((x) => String(x.id) === String(req.params.id));
  if (i === -1) {
    return res.status(404).json({ error: 'Not found' });
  }
  list.splice(i, 1);
  saveBroadcastsToDb(list);
  return res.json({ ok: true });
});

const SITE_CONTENT_TOKEN = process.env.SITE_CONTENT_TOKEN || '61bf847ee68b663a8782e7e38dd88ff4bb3071d844b7425c8dad6e179d6285c8';
const SITE_CONTENT_FILE = path.join(process.cwd(), 'data', 'site-content.json');

function siteContentAuth(req, res, next) {
  const token = req.headers['x-content-token'] || '';
  if (token !== SITE_CONTENT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/api/site-content', siteContentAuth, (req, res) => {
  try {
    if (!fs.existsSync(SITE_CONTENT_FILE)) {
      return res.json({});
    }
    const raw = fs.readFileSync(SITE_CONTENT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return res.json(parsed && typeof parsed === 'object' ? parsed : {});
  } catch {
    return res.json({});
  }
});

app.put('/api/site-content', siteContentAuth, (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    fs.mkdirSync(path.dirname(SITE_CONTENT_FILE), { recursive: true });
    fs.writeFileSync(SITE_CONTENT_FILE, JSON.stringify(payload, null, 2), 'utf8');
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'Failed to save' });
  }
});

// ---- Support chat (same contract as Client SPA; stored in SQLite) ----
const SUPPORT_TYPING_TTL_MS = 5000;
function supportTypingActiveAt(iso) {
  if (iso == null) return false;
  const s = String(iso).trim();
  if (!s) return false;
  const t = Date.parse(s);
  return Number.isFinite(t) && Date.now() - t < SUPPORT_TYPING_TTL_MS;
}

function supportRowToMessage(row) {
  const o = { id: row.id, role: row.role, body: row.body || '', createdAt: row.created_at };
  if (row.image) o.image = row.image;
  if (row.edited_at) o.editedAt = row.edited_at;
  const rid = row.reply_to_id != null ? String(row.reply_to_id).trim() : '';
  if (rid) {
    o.replyTo = rid;
    const rp = row.reply_preview != null ? String(row.reply_preview) : '';
    o.replyPreview = rp.trim() || '…';
    const rr = row.reply_role != null ? String(row.reply_role).trim() : '';
    if (rr) o.replyRole = rr;
  }
  return o;
}

/** Fill missing reply preview/role from the quoted message in the same thread (legacy rows / partial DB). */
function supportHydrateReplyMetaFromThread(msgs) {
  if (!Array.isArray(msgs) || msgs.length === 0) return msgs;
  const byId = new Map();
  for (const x of msgs) {
    if (x && x.id != null) byId.set(String(x.id), x);
  }
  return msgs.map((m) => {
    if (!m) return m;
    const rt = m.replyTo != null ? String(m.replyTo).trim() : '';
    if (!rt) return m;
    const prev = String(m.replyPreview ?? '').trim();
    const hasRole = String(m.replyRole ?? '').trim() !== '';
    if (prev && prev !== '…' && hasRole) return m;
    const target = byId.get(rt);
    if (!target) {
      return prev ? m : { ...m, replyPreview: '…' };
    }
    const bodyTrim = String(target.body || '').trim();
    const fromTarget =
      target.image && !bodyTrim ? '📷 Image' : bodyTrim.slice(0, 220) || '…';
    const replyPreview = !prev || prev === '…' ? fromTarget : prev;
    const replyRole = hasRole ? m.replyRole : target.role || 'user';
    return { ...m, replyTo: rt, replyPreview, replyRole };
  });
}

function supportLoadMessages(userId) {
  const rows = db
    .prepare(
      'SELECT id, role, body, image, created_at, edited_at, reply_to_id, reply_preview, reply_role FROM support_messages WHERE user_id = ? ORDER BY created_at ASC',
    )
    .all(userId);
  return supportHydrateReplyMetaFromThread(rows.map(supportRowToMessage));
}

function sanitizeSupportReplyRoleSql(r) {
  const fr = String(r ?? '').trim().toLowerCase();
  if (fr === 'user' || fr === 'admin' || fr === 'system') return fr;
  return 'user';
}

function supportResolveReplyInsertSql(msgs, replyToIdRaw, fallback = null) {
  const rid = String(replyToIdRaw ?? '').trim();
  if (!rid || !Array.isArray(msgs)) return { reply_to_id: null, reply_preview: null, reply_role: null };
  const rm = msgs.find((x) => x && String(x.id) === rid);
  if (!rm) {
    const fp = sanitizeSupportTextSql(fallback?.preview, 220);
    return {
      reply_to_id: rid,
      reply_preview: fp || '…',
      reply_role: sanitizeSupportReplyRoleSql(fallback?.role),
    };
  }
  const bodyTrim = String(rm.body || '').trim();
  const preview = rm.image && !bodyTrim ? '📷 Image' : bodyTrim.slice(0, 220);
  return {
    reply_to_id: rid,
    reply_preview: preview,
    reply_role: sanitizeSupportReplyRoleSql(rm.role),
  };
}

function supportGetThreadRow(userId) {
  return db.prepare('SELECT * FROM support_threads WHERE user_id = ?').get(userId);
}

function supportEnsureThread(userId) {
  const existing = supportGetThreadRow(userId);
  if (existing) return existing;
  db.prepare(
    `INSERT INTO support_threads (user_id, unread_for_admin, unread_for_user, needs_human, updated_at)
     VALUES (?, 0, 0, 0, datetime('now'))`
  ).run(userId);
  return supportGetThreadRow(userId);
}

function supportTouchThread(userId) {
  supportEnsureThread(userId);
  db.prepare('UPDATE support_threads SET updated_at = datetime(\'now\') WHERE user_id = ?').run(userId);
}

function supportParseAutoClearDeadline(iso) {
  if (iso == null) return null;
  const s = String(iso).trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** If auto_clear_at is in the past: delete all messages for user and reset thread counters / flags. */
function supportApplyAutoClearIfDue(userId) {
  const t = supportGetThreadRow(userId);
  if (!t) return false;
  const deadline = supportParseAutoClearDeadline(t.auto_clear_at);
  if (deadline == null || deadline > Date.now()) return false;
  db.prepare('DELETE FROM support_messages WHERE user_id = ?').run(userId);
  db.prepare(
    `UPDATE support_threads SET
       unread_for_admin = 0,
       unread_for_user = 0,
       needs_human = 0,
       user_typing_at = NULL,
       admin_typing_at = NULL,
       auto_clear_at = NULL,
       updated_at = datetime('now')
     WHERE user_id = ?`,
  ).run(userId);
  return true;
}

function supportSweepAllAutoClearDue() {
  const rows = db.prepare('SELECT user_id FROM support_threads WHERE auto_clear_at IS NOT NULL').all();
  for (const r of rows) {
    supportApplyAutoClearIfDue(r.user_id);
  }
}

const SUPPORT_AUTO_CLEAR_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const SUPPORT_AUTO_CLEAR_MIN_MS = 1000;

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

function userProfileAvatarForAdminSql(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return '';
  const row = db.prepare('SELECT avatar FROM user_avatars WHERE user_id = ?').get(id);
  const a = row?.avatar;
  if (a != null && typeof a === 'string' && a.trim()) return a.trim();
  return '';
}


function sanitizeSupportTextSql(s, max = 4000) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

const SUPPORT_IMAGE_MAX_BYTES = 900 * 1024;

function sanitizeSupportImageDataUrlSql(s) {
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

const SUPPORT_WAIT_ACK = `Thanks for your message — please hold on for a moment.

We're sorry for any wait. A team member will be with you shortly.`;

const SUPPORT_HUMAN_ACK =
  'Thanks — our team has been notified. Someone professional will get back to you here as soon as they can.';

function supportMessageIsWaitAckSql(m) {
  return (
    m &&
    m.role === 'system' &&
    typeof m.body === 'string' &&
    m.body.startsWith('Thanks for your message — please hold on for a moment.')
  );
}

function supportMessagesForAdminApiSql(msgs) {
  if (!Array.isArray(msgs)) return [];
  return msgs.filter((m) => !supportMessageIsWaitAckSql(m));
}

function supportLastMessageForInboxSql(msgs) {
  if (!Array.isArray(msgs) || !msgs.length) return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (!supportMessageIsWaitAckSql(msgs[i])) return msgs[i];
  }
  return null;
}

app.use((req, res, next) => {
  try {
    const p = (req.originalUrl || req.url || '').split('?')[0];
    if (p.startsWith('/api/support') || p.startsWith('/api/admin/support')) {
      supportSweepAllAutoClearDue();
    }
  } catch (e) {
    console.error(e);
  }
  next();
});

app.get('/api/support/status', authMiddleware, (req, res) => {
  try {
    const userId = req.userId;
    const u = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    supportEnsureThread(userId);
    const t = supportGetThreadRow(userId);
    const msgs = supportLoadMessages(userId);
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    const lastSnippet =
      last && last.image ? '📷 Image' : last && last.body ? String(last.body).slice(0, 120) : '';
    return res.json({
      unreadUser: t.unread_for_user || 0,
      needsHuman: !!t.needs_human,
      lastSnippet,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/support/thread', authMiddleware, (req, res) => {
  try {
    const userId = req.userId;
    const u = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    supportEnsureThread(userId);
    db.prepare('UPDATE support_threads SET unread_for_user = 0 WHERE user_id = ?').run(userId);
    const msgs = supportLoadMessages(userId);
    const t = supportGetThreadRow(userId);
    return res.json({
      messages: msgs,
      needsHuman: !!t.needs_human,
      userId: String(userId),
      adminTyping: supportTypingActiveAt(t.admin_typing_at),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/support/read', authMiddleware, (req, res) => {
  try {
    const userId = req.userId;
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    supportEnsureThread(userId);
    db.prepare('UPDATE support_threads SET unread_for_user = 0 WHERE user_id = ?').run(userId);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/support/typing', authMiddleware, (req, res) => {
  try {
    const typing = req.body?.typing === true;
    const userId = req.userId;
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!u) return res.status(404).json({ error: 'User not found' });
    supportEnsureThread(userId);
    const iso = typing ? new Date().toISOString() : null;
    db.prepare('UPDATE support_threads SET user_typing_at = ? WHERE user_id = ?').run(iso, userId);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/support/typing', adminAuthMiddleware, (req, res) => {
  try {
    const uid = parseInt(String(req.body?.userId ?? '').trim(), 10);
    const typing = req.body?.typing === true;
    if (!Number.isFinite(uid)) return res.status(400).json({ error: 'userId required' });
    supportEnsureThread(uid);
    const iso = typing ? new Date().toISOString() : null;
    db.prepare('UPDATE support_threads SET admin_typing_at = ? WHERE user_id = ?').run(iso, uid);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/support/messages', authMiddleware, (req, res) => {
  try {
    const requestHuman = req.body?.requestHuman === true;
    const image = sanitizeSupportImageDataUrlSql(req.body?.image);
    let body = sanitizeSupportTextSql(req.body?.text, 4000);
    if (requestHuman && !body && !image) body = 'I need help from a human.';
    if (!body && !image) return res.status(400).json({ error: 'Message or image required' });

    const userId = req.userId;
    const u = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    supportEnsureThread(userId);

    const insert = db.prepare(
      `INSERT INTO support_messages (id, user_id, role, body, image, created_at, reply_to_id, reply_preview, reply_role)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)`
    );

    const curBefore = supportLoadMessages(userId);
    const hasAdminInThread = curBefore.some((m) => m && m.role === 'admin');
    const alreadyHasWaitAck = curBefore.some(supportMessageIsWaitAckSql);
    const rMeta = supportResolveReplyInsertSql(curBefore, req.body?.replyToMessageId, {
      preview: req.body?.replyToPreview,
      role: req.body?.replyToRole,
    });
    const mid = randomUUID();
    insert.run(mid, userId, 'user', body, image || null, rMeta.reply_to_id, rMeta.reply_preview, rMeta.reply_role);

    db.prepare(
      'UPDATE support_threads SET unread_for_admin = unread_for_admin + 1, updated_at = datetime(\'now\') WHERE user_id = ?'
    ).run(userId);
    db.prepare('UPDATE support_threads SET user_typing_at = NULL WHERE user_id = ?').run(userId);

    if (requestHuman) {
      db.prepare('UPDATE support_threads SET needs_human = 1 WHERE user_id = ?').run(userId);
      insert.run(randomUUID(), userId, 'system', SUPPORT_HUMAN_ACK, null, null, null, null);
    } else if (!hasAdminInThread && !alreadyHasWaitAck) {
      insert.run(randomUUID(), userId, 'system', SUPPORT_WAIT_ACK, null, null, null, null);
    }

    const t = supportGetThreadRow(userId);
    const outMsgs = supportLoadMessages(userId);
    return res.json({
      messages: outMsgs,
      needsHuman: !!t.needs_human,
      userId: String(userId),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/support/inbox', adminAuthMiddleware, (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT t.user_id, t.unread_for_admin, t.unread_for_user, t.needs_human, t.updated_at,
                u.email AS user_email, u.full_name AS user_name
         FROM support_threads t
         JOIN users u ON u.id = t.user_id
         ORDER BY t.updated_at DESC`
      )
      .all();

    const list = [];
    for (const row of rows) {
      const msgs = supportLoadMessages(row.user_id);
      if (msgs.length === 0) continue;
      const last = supportLastMessageForInboxSql(msgs);
      list.push({
        userId: String(row.user_id),
        userEmail: row.user_email || '',
        userName: row.user_name || '',
        profileAvatar: userProfileAvatarForAdminSql(row.user_id),
        updatedAt: row.updated_at || '',
        unreadForAdmin: row.unread_for_admin || 0,
        unreadForUser: row.unread_for_user || 0,
        needsHuman: !!row.needs_human,
        lastSnippet: last?.image ? '📷 Image' : last?.body ? String(last.body).slice(0, 160) : '',
        lastRole: last?.role || '',
        messageCount: msgs.length,
      });
    }
    list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return res.json(list);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/support/thread/:userId', adminAuthMiddleware, (req, res) => {
  try {
    const uid = parseInt(String(req.params.userId || '').trim(), 10);
    if (!Number.isFinite(uid)) return res.status(400).json({ error: 'userId required' });
    const u = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(uid);
    supportEnsureThread(uid);
    db.prepare('UPDATE support_threads SET unread_for_admin = 0 WHERE user_id = ?').run(uid);
    const t = supportGetThreadRow(uid);
    const msgs = supportLoadMessages(uid);
    const ac = t.auto_clear_at && String(t.auto_clear_at).trim() ? String(t.auto_clear_at) : null;
    return res.json({
      messages: supportMessagesForAdminApiSql(msgs),
      userId: String(uid),
      userEmail: u?.email || '',
      userName: u?.full_name || '',
      profileAvatar: userProfileAvatarForAdminSql(uid),
      needsHuman: !!t.needs_human,
      userTyping: supportTypingActiveAt(t.user_typing_at),
      autoClearAt: ac,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/support/thread/:userId/auto-clear', adminAuthMiddleware, (req, res) => {
  try {
    const uid = parseInt(String(req.params.userId || '').trim(), 10);
    if (!Number.isFinite(uid)) return res.status(400).json({ error: 'userId required' });
    const resolved = supportResolveAutoClearDelayMs(req.body);
    if (!resolved.ok) return res.status(400).json({ error: resolved.error });
    const u = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(uid);
    if (!u) return res.status(404).json({ error: 'User not found' });
    supportEnsureThread(uid);
    supportApplyAutoClearIfDue(uid);
    if (resolved.cancel) {
      db.prepare('UPDATE support_threads SET auto_clear_at = NULL, updated_at = datetime(\'now\') WHERE user_id = ?').run(
        uid,
      );
    } else {
      const iso = new Date(Date.now() + resolved.ms).toISOString();
      db.prepare(
        'UPDATE support_threads SET auto_clear_at = ?, updated_at = datetime(\'now\') WHERE user_id = ?',
      ).run(iso, uid);
    }
    db.prepare('UPDATE support_threads SET unread_for_admin = 0 WHERE user_id = ?').run(uid);
    const t = supportGetThreadRow(uid);
    const msgs = supportLoadMessages(uid);
    const ac = t.auto_clear_at && String(t.auto_clear_at).trim() ? String(t.auto_clear_at) : null;
    return res.json({
      messages: supportMessagesForAdminApiSql(msgs),
      userId: String(uid),
      userEmail: u.email || '',
      userName: u.full_name || '',
      profileAvatar: userProfileAvatarForAdminSql(uid),
      needsHuman: !!t.needs_human,
      userTyping: supportTypingActiveAt(t.user_typing_at),
      autoClearAt: ac,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/support/reply', adminAuthMiddleware, (req, res) => {
  try {
    const uid = parseInt(String(req.body?.userId ?? '').trim(), 10);
    const image = sanitizeSupportImageDataUrlSql(req.body?.image);
    let body = sanitizeSupportTextSql(req.body?.text, 4000);
    if (!Number.isFinite(uid)) return res.status(400).json({ error: 'userId required' });
    if (!body && !image) return res.status(400).json({ error: 'Message or image required' });

    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
    if (!u) return res.status(404).json({ error: 'User not found' });

    supportEnsureThread(uid);
    const curMsgs = supportLoadMessages(uid);
    const rMeta = supportResolveReplyInsertSql(curMsgs, req.body?.replyToMessageId, {
      preview: req.body?.replyToPreview,
      role: req.body?.replyToRole,
    });
    db.prepare(
      `INSERT INTO support_messages (id, user_id, role, body, image, created_at, reply_to_id, reply_preview, reply_role)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)`
    ).run(randomUUID(), uid, 'admin', body || '', image || null, rMeta.reply_to_id, rMeta.reply_preview, rMeta.reply_role);

    db.prepare(
      'UPDATE support_threads SET unread_for_user = unread_for_user + 1, updated_at = datetime(\'now\') WHERE user_id = ?'
    ).run(uid);
    db.prepare('UPDATE support_threads SET admin_typing_at = NULL WHERE user_id = ?').run(uid);

    const msgs = supportLoadMessages(uid);
    return res.json({
      messages: supportMessagesForAdminApiSql(msgs),
      userId: String(uid),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/support/messages', authMiddleware, (req, res) => {
  const messageId = String(req.body?.messageId ?? '').trim();
  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  const removeImage = req.body?.removeImage === true;
  const image = sanitizeSupportImageDataUrlSql(req.body?.image);
  const hasTextKey = typeof req.body?.text === 'string';
  const newBody = hasTextKey ? sanitizeSupportTextSql(req.body.text, 4000) : null;
  try {
    const userId = req.userId;
    const row = db
      .prepare(
        'SELECT id, role, body, image FROM support_messages WHERE id = ? AND user_id = ?',
      )
      .get(messageId, userId);
    if (!row) return res.status(404).json({ error: 'Message not found' });
    if (row.role !== 'user') return res.status(403).json({ error: 'You can only edit your own messages' });

    let nextBody = row.body || '';
    if (hasTextKey) nextBody = newBody;
    let nextImage = row.image;
    if (removeImage) nextImage = null;
    else if (image) nextImage = image;

    const bodyOk = String(nextBody ?? '').trim().length > 0;
    const hasImg = !!nextImage;
    if (!bodyOk && !hasImg) {
      return res.status(400).json({ error: 'Message must have text or an image' });
    }

    const editedIso = new Date().toISOString();
    db.prepare(
      'UPDATE support_messages SET body = ?, image = ?, edited_at = ? WHERE id = ? AND user_id = ?',
    ).run(nextBody, nextImage, editedIso, messageId, userId);
    db.prepare('UPDATE support_threads SET updated_at = datetime(\'now\') WHERE user_id = ?').run(userId);

    const t = supportGetThreadRow(userId);
    const outMsgs = supportLoadMessages(userId);
    return res.json({
      messages: outMsgs,
      needsHuman: !!t.needs_human,
      userId: String(userId),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/support/messages', authMiddleware, (req, res) => {
  const messageId = String(req.body?.messageId ?? '').trim();
  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  try {
    const userId = req.userId;
    const row = db
      .prepare('SELECT id, role FROM support_messages WHERE id = ? AND user_id = ?')
      .get(messageId, userId);
    if (!row) return res.status(404).json({ error: 'Message not found' });
    if (row.role !== 'user') return res.status(403).json({ error: 'You can only delete your own messages' });

    db.prepare('DELETE FROM support_messages WHERE id = ? AND user_id = ?').run(messageId, userId);
    db.prepare('UPDATE support_threads SET updated_at = datetime(\'now\') WHERE user_id = ?').run(userId);

    const t = supportGetThreadRow(userId);
    const outMsgs = supportLoadMessages(userId);
    return res.json({
      messages: outMsgs,
      needsHuman: !!t.needs_human,
      userId: String(userId),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/admin/support/messages', adminAuthMiddleware, (req, res) => {
  const uid = parseInt(String(req.body?.userId ?? '').trim(), 10);
  const messageId = String(req.body?.messageId ?? '').trim();
  if (!Number.isFinite(uid) || !messageId) {
    return res.status(400).json({ error: 'userId and messageId required' });
  }
  const removeImage = req.body?.removeImage === true;
  const image = sanitizeSupportImageDataUrlSql(req.body?.image);
  const hasTextKey = typeof req.body?.text === 'string';
  const newBody = hasTextKey ? sanitizeSupportTextSql(req.body.text, 4000) : null;
  try {
    const row = db
      .prepare(
        'SELECT id, role, body, image FROM support_messages WHERE id = ? AND user_id = ?',
      )
      .get(messageId, uid);
    if (!row) return res.status(404).json({ error: 'Message not found' });
    if (row.role !== 'admin') return res.status(403).json({ error: 'You can only edit your own admin messages' });

    let nextBody = row.body || '';
    if (hasTextKey) nextBody = newBody;
    let nextImage = row.image;
    if (removeImage) nextImage = null;
    else if (image) nextImage = image;

    const bodyOk = String(nextBody ?? '').trim().length > 0;
    const hasImg = !!nextImage;
    if (!bodyOk && !hasImg) {
      return res.status(400).json({ error: 'Message must have text or an image' });
    }

    const editedIso = new Date().toISOString();
    db.prepare(
      'UPDATE support_messages SET body = ?, image = ?, edited_at = ? WHERE id = ? AND user_id = ?',
    ).run(nextBody, nextImage, editedIso, messageId, uid);
    db.prepare('UPDATE support_threads SET updated_at = datetime(\'now\') WHERE user_id = ?').run(uid);

    const msgs = supportLoadMessages(uid);
    return res.json({
      messages: supportMessagesForAdminApiSql(msgs),
      userId: String(uid),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/support/messages', adminAuthMiddleware, (req, res) => {
  const uid = parseInt(String(req.body?.userId ?? '').trim(), 10);
  const messageId = String(req.body?.messageId ?? '').trim();
  if (!Number.isFinite(uid) || !messageId) {
    return res.status(400).json({ error: 'userId and messageId required' });
  }
  try {
    const row = db
      .prepare('SELECT id, role FROM support_messages WHERE id = ? AND user_id = ?')
      .get(messageId, uid);
    if (!row) return res.status(404).json({ error: 'Message not found' });
    if (row.role !== 'admin') return res.status(403).json({ error: 'You can only delete your own admin messages' });

    db.prepare('DELETE FROM support_messages WHERE id = ? AND user_id = ?').run(messageId, uid);
    db.prepare('UPDATE support_threads SET updated_at = datetime(\'now\') WHERE user_id = ?').run(uid);

    const msgs = supportLoadMessages(uid);
    return res.json({
      messages: supportMessagesForAdminApiSql(msgs),
      userId: String(uid),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

setInterval(() => {
  try {
    supportSweepAllAutoClearDue();
  } catch (e) {
    console.error(e);
  }
}, 60_000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DataPlus API http://0.0.0.0:${PORT}`);
});
