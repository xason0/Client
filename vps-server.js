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

// Store vendor attribution (filled when a public /store purchase is recorded)
try {
  db.exec('ALTER TABLE orders ADD COLUMN store_owner_id INTEGER');
} catch (_) {}
try {
  db.exec('ALTER TABLE orders ADD COLUMN store_base_ghs REAL');
} catch (_) {}
try {
  db.exec('ALTER TABLE orders ADD COLUMN store_profit_ghs REAL');
} catch (_) {}
try {
  db.exec('ALTER TABLE orders ADD COLUMN paystack_reference TEXT');
} catch (_) {}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_paystack_ref ON orders(paystack_reference)');
} catch (_) {}

try {
  db.exec(`CREATE TABLE IF NOT EXISTS store_withdrawal_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    amount_ghs REAL NOT NULL,
    fee_ghs REAL NOT NULL,
    net_after_fee_ghs REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
} catch (_) {}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_store_wd_req_user ON store_withdrawal_requests(user_id)');
} catch (_) {}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_store_wd_req_created ON store_withdrawal_requests(created_at)');
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
try {
  db.exec('ALTER TABLE afa_applications ADD COLUMN is_public_checkout INTEGER NOT NULL DEFAULT 0');
} catch (_) {}
try {
  db.exec('ALTER TABLE afa_applications ADD COLUMN public_store_slug TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE afa_applications ADD COLUMN paystack_reference TEXT');
} catch (_) {}
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_afa_applications_paystack_ref ON afa_applications(paystack_reference) WHERE paystack_reference IS NOT NULL');
} catch (_) {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS afa_public_paystack_pending (
    reference TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
} catch (_) {}

// Per-user public storefront: slug, pricing overrides, AFA, etc. (syncs with client Store Dashboard)
try {
  db.exec(`CREATE TABLE IF NOT EXISTS user_stores (
    user_id INTEGER NOT NULL PRIMARY KEY,
    path_slug TEXT NOT NULL UNIQUE,
    data_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
} catch (_) {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS user_stores_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    path_slug TEXT NOT NULL UNIQUE,
    data_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now')),
    moderation_status TEXT NOT NULL DEFAULT 'approved',
    moderation_note TEXT,
    reviewed_at TEXT,
    reviewed_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
} catch (_) {}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_stores_v2_user_id ON user_stores_v2(user_id)');
} catch (_) {}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_stores_v2_path_slug ON user_stores_v2(path_slug)');
} catch (_) {}
try {
  db.exec(`INSERT INTO user_stores_v2 (user_id, path_slug, data_json, updated_at, moderation_status, moderation_note, reviewed_at, reviewed_by)
    SELECT us.user_id, us.path_slug, us.data_json, us.updated_at,
           COALESCE(us.moderation_status, 'approved'),
           COALESCE(us.moderation_note, ''),
           us.reviewed_at, us.reviewed_by
    FROM user_stores us
    LEFT JOIN user_stores_v2 v2 ON v2.path_slug = us.path_slug
    WHERE v2.id IS NULL`);
} catch (_) {}
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_stores_path_slug ON user_stores(path_slug)');
} catch (_) {}
try {
  db.exec("ALTER TABLE user_stores ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'approved'");
} catch (_) {}
try {
  db.exec('ALTER TABLE user_stores ADD COLUMN moderation_note TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE user_stores ADD COLUMN reviewed_at TEXT');
} catch (_) {}
try {
  db.exec('ALTER TABLE user_stores ADD COLUMN reviewed_by TEXT');
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

function hasAdminAccessFromAuthHeader(req) {
  try {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return false;
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.adminPin === true) return true;
    const adminUid = payload.userId ?? payload.sub;
    if (adminUid == null || adminUid === '') return false;
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(adminUid);
    return !!(user && user.role === 'admin');
  } catch {
    return false;
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

/**
 * Paystack `metadata` may be a string, an object, or (rarely) empty. Dashboard "custom fields"
 * come back as `custom_fields: [{ variable_name, value }]`; merge so `kind` / `amount_ghs` resolve.
 */
function normalizePaystackMetadata(raw) {
  if (raw == null || raw === '') return {};
  let m = raw;
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      return {};
    }
  }
  if (!m || typeof m !== 'object') return {};
  const out = { ...m };
  if (Array.isArray(out.custom_fields)) {
    for (const f of out.custom_fields) {
      if (f == null || typeof f !== 'object' || f.variable_name == null || f.variable_name === '') continue;
      const k = String(f.variable_name);
      if (out[k] == null || out[k] === '') {
        out[k] = f.value;
      }
    }
  }
  return out;
}

/**
 * For one numeric API field, build possible GHS subunit (pesewa) interpretations.
 * GHS: Paystack `amount` / `requested_amount` are usually in pesewas, but `amount` is sometimes
 * a major GHS value when under 100. `requested_amount` often matches the initialized subtotal.
 * @param {number} raw
 * @param {Set<number>} into
 */
function addGhsPesewaInterpretationsForRaw(raw, into) {
  if (!Number.isFinite(raw) || raw <= 0) return;
  if (raw >= 100) {
    into.add(Math.round(raw));
    return;
  }
  into.add(Math.round(raw));
  into.add(Math.round(raw * 100));
}

/**
 * @param {import('bun'|'node').any} verified - Paystack transaction verify `data` object
 * @returns {number[]} distinct possible pesewa values
 */
function listPaystackGhsPesewaCandidates(verified) {
  if (!verified || typeof verified !== 'object') return [];
  const s = new Set();
  for (const key of ['amount', 'requested_amount']) {
    addGhsPesewaInterpretationsForRaw(Number(verified[key]), s);
  }
  return Array.from(s);
}

function getMetaAmountGhsFromPaystack(/** @type {any} */ meta) {
  if (!meta || typeof meta !== 'object') return null;
  const a =
    meta.amount_ghs ??
    meta.amountGhs ??
    meta['amount-ghs'] ??
    (meta.custom_fields && typeof meta.custom_fields === 'object' ? meta.custom_fields.amount_ghs : null);
  const p = Number.parseFloat(String(a != null && a !== '' ? a : ''));
  return Number.isFinite(p) && p >= 0.01 ? p : null;
}

/**
 * Match Paystack's ambiguous / split fields against store + init. Prefer init when store moved.
 * Allows a modest overpay (e.g. MoMo / channel line items) above quoted price.
 */
function pickPaystackPaidPesewasForGhs(verified, { storePesewas, initPesewas = null } = {}) {
  const cands = listPaystackGhsPesewaCandidates(verified);
  if (!cands.length) return null;
  const TOL = 5;
  const MAX_CUST_FEE = 5000; // 50.00 GHS in pesewas; keeps accidental huge mismatches rejected
  const tryOne = (target) => {
    for (const p of cands) {
      if (Number.isFinite(target) && Math.abs(p - target) <= TOL) return p;
    }
    return null;
  };
  if (initPesewas != null && Number.isFinite(initPesewas)) {
    const m = tryOne(initPesewas);
    if (m != null) return m;
  }
  if (Number.isFinite(storePesewas)) {
    const m = tryOne(storePesewas);
    if (m != null) return m;
    for (const c of cands) {
      if (c < storePesewas - 1) continue;
      if (c > storePesewas + MAX_CUST_FEE) continue;
      if (initPesewas != null && Number.isFinite(initPesewas)) {
        if (c < initPesewas - 1 || c > initPesewas + MAX_CUST_FEE) continue;
      }
      return c;
    }
  }
  return null;
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

/** Same per-order profit as store earnings (`/api/store/earnings`). */
function orderProfitExpression(alias = 'o') {
  return `COALESCE(${alias}.store_profit_ghs, CASE
    WHEN ${alias}.store_base_ghs IS NOT NULL AND ${alias}.bundle_price IS NOT NULL
    THEN ${alias}.bundle_price - ${alias}.store_base_ghs
    ELSE 0
  END)`;
}

/**
 * Public checkout orders start as `processing`; they must count toward revenue/profit immediately.
 * Only `failed` / `cancelled` (and `refunded` if used) are excluded.
 */
function storeOrderCountsTowardEarnings(alias = 'o') {
  return `LOWER(COALESCE(${alias}.status,'')) NOT IN ('failed','cancelled','refunded')`;
}

/** Orders still in the fulfillment queue (not yet marked completed by ops). */
function storeOrderIsProcessing(alias = 'o') {
  return `LOWER(COALESCE(${alias}.status,'')) = 'processing'`;
}

function listAdminStores() {
  const profitX = orderProfitExpression('o');
  const rows = db
    .prepare(
      `SELECT
          us.id AS store_id,
          us.user_id,
          us.path_slug,
          us.data_json,
          us.updated_at,
          us.moderation_status,
          us.moderation_note,
          us.reviewed_at,
          us.reviewed_by,
          u.email AS user_email,
          COALESCE(u.full_name, '') AS user_full_name,
          COALESCE(u.phone, '') AS user_phone,
          COUNT(o.id) AS total_orders,
          COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.status,'')) = 'completed' THEN 1 ELSE 0 END), 0) AS completed_orders,
          COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.status,'')) NOT IN ('failed','cancelled','refunded') THEN COALESCE(o.bundle_price, 0) ELSE 0 END), 0) AS completed_revenue_ghs,
          COALESCE(SUM(CASE WHEN LOWER(COALESCE(o.status,'')) NOT IN ('failed','cancelled','refunded') THEN ${profitX} ELSE 0 END), 0) AS completed_profit_ghs,
          MAX(o.created_at) AS last_order_at
       FROM user_stores_v2 us
       JOIN users u ON u.id = us.user_id
       LEFT JOIN orders o ON o.store_owner_id = us.user_id
       WHERE u.deleted_at IS NULL
       GROUP BY us.id, us.user_id, us.path_slug, us.data_json, us.updated_at, us.moderation_status, us.moderation_note, us.reviewed_at, us.reviewed_by, u.email, u.full_name, u.phone
       ORDER BY datetime(COALESCE(us.updated_at, u.created_at)) DESC
       LIMIT 500`
    )
    .all();
  return rows.map((row) => {
    let d = {};
    try {
      d = JSON.parse(row.data_json || '{}');
    } catch (_) {
      d = {};
    }
    if (!d || typeof d !== 'object') d = {};
    const display = d.display && typeof d.display === 'object' ? d.display : {};
    const service = d.service && typeof d.service === 'object' ? d.service : {};
    const withdrawalStatus = normalizeStoreWithdrawalStatus(service.withdrawalStatus);
    const storeName = String(display.storeName || d.ownerName || row.user_full_name || row.user_email || 'Store').trim() || 'Store';
    const ownerName = String(d.ownerName || row.user_full_name || '').trim();
    return {
      store_id: Number(row.store_id),
      user_id: row.user_id,
      user_email: row.user_email,
      user_full_name: row.user_full_name,
      user_phone: row.user_phone,
      path_slug: row.path_slug,
      store_name: storeName,
      owner_name: ownerName,
      availability: d.availability !== false,
      moderation_status: normalizeStoreModerationStatus(row.moderation_status),
      moderation_note: row.moderation_note ? String(row.moderation_note) : '',
      reviewed_at: row.reviewed_at || null,
      reviewed_by: row.reviewed_by || null,
      theme: String(display.theme || '').trim() || 'default',
      accent_color: String(display.accentColor || '').trim() || '#7c3aed',
      logo_present: !!(display.logoDataUrl && String(display.logoDataUrl).trim()),
      logo_data_url: display.logoDataUrl && String(display.logoDataUrl).trim() ? String(display.logoDataUrl) : null,
      afa_enabled: service.afaEnabled !== false,
      vouchers_enabled: !!service.vouchersEnabled,
      withdrawal_status: withdrawalStatus,
      updated_at: row.updated_at || null,
      last_order_at: row.last_order_at || null,
      total_orders: Number(row.total_orders || 0),
      completed_orders: Number(row.completed_orders || 0),
      completed_revenue_ghs: Number(row.completed_revenue_ghs || 0),
      completed_profit_ghs: Number(row.completed_profit_ghs || 0),
    };
  });
}

app.get('/api/admin/stores', adminAuthMiddleware, (req, res) => {
  try {
    return res.json({ stores: listAdminStores() });
  } catch (e) {
    console.error('[admin/stores] list', e);
    return res.status(500).json({ error: 'Failed to load stores' });
  }
});

app.patch('/api/admin/stores/:storeId', adminAuthMiddleware, (req, res) => {
  const storeId = parseInt(String(req.params.storeId || ''), 10);
  if (!Number.isFinite(storeId)) {
    return res.status(400).json({ error: 'Invalid store id' });
  }
  const row = db.prepare('SELECT id, user_id, data_json, moderation_status FROM user_stores_v2 WHERE id = ?').get(storeId);
  if (!row) {
    return res.status(404).json({ error: 'Store not found' });
  }
  let d = {};
  try {
    d = JSON.parse(row.data_json || '{}');
  } catch (_) {
    d = {};
  }
  if (!d || typeof d !== 'object') d = {};
  const hasAvailability = Object.prototype.hasOwnProperty.call(req.body || {}, 'availability');
  const hasOwnerName = typeof req.body?.ownerName === 'string';
  const hasModerationStatus = typeof req.body?.moderationStatus === 'string';
  const hasModerationNote = typeof req.body?.moderationNote === 'string';
  const hasWithdrawalStatus = typeof req.body?.withdrawalStatus === 'string';
  if (!hasAvailability && !hasOwnerName && !hasModerationStatus && !hasModerationNote && !hasWithdrawalStatus) {
    return res.status(400).json({ error: 'No valid store fields to update' });
  }
  if (hasAvailability) {
    d.availability = req.body.availability !== false && req.body.availability !== 0 && req.body.availability !== '0';
  }
  if (hasOwnerName) {
    const ownerName = String(req.body.ownerName || '').trim();
    d.ownerName = ownerName.slice(0, 200);
  }
  if (hasWithdrawalStatus) {
    const nextWithdrawalStatus = normalizeStoreWithdrawalStatus(req.body.withdrawalStatus);
    const prevService = d.service && typeof d.service === 'object' ? d.service : {};
    d.service = { ...prevService, withdrawalStatus: nextWithdrawalStatus };
  }
  let moderationStatus = normalizeStoreModerationStatus(row.moderation_status);
  let moderationNote = null;
  if (hasModerationStatus) {
    moderationStatus = normalizeStoreModerationStatus(req.body.moderationStatus);
    moderationNote = hasModerationNote ? String(req.body.moderationNote || '').trim().slice(0, 500) : '';
  } else if (hasModerationNote) {
    moderationNote = String(req.body.moderationNote || '').trim().slice(0, 500);
  }
  d.updatedAt = Date.now();
  const reviewActor =
    req.userId != null && req.userId !== ''
      ? `user:${String(req.userId)}`
      : req.adminAccess
        ? 'admin-pin'
        : 'admin';
  if (hasModerationStatus || hasModerationNote) {
    db.prepare(
      "UPDATE user_stores_v2 SET data_json = ?, updated_at = datetime('now'), moderation_status = ?, moderation_note = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?"
    ).run(JSON.stringify(d), moderationStatus, moderationNote, reviewActor, storeId);
  } else {
    db.prepare("UPDATE user_stores_v2 SET data_json = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(d), storeId);
  }
  try {
    const updated = listAdminStores().find((x) => Number(x.store_id) === Number(storeId));
    return res.json({ ok: true, store: updated || null });
  } catch {
    return res.json({ ok: true });
  }
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

function sanitizePathSlugServer(raw) {
  if (raw == null) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function bundleKeyPublic(net, size) {
  return `${net}|${size}`;
}
function normalizeStoreModerationStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'pending' || s === 'declined' || s === 'approved') return s;
  return 'approved';
}
function normalizeStoreWithdrawalStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'paused' || s === 'disabled' || s === 'off' || s === 'closed') return 'paused';
  return 'enabled';
}
function normalizeWithdrawalRequestStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'failed' || s === 'rejected' || s === 'declined' || s === 'cancelled' || s === 'canceled') return 'failed';
  if (s === 'processing') return 'processing';
  if (s === 'completed' || s === 'paid' || s === 'done' || s === 'approved') return 'completed';
  return 'pending';
}
function isStorePubliclyVisible({ moderationStatus, data }) {
  return normalizeStoreModerationStatus(moderationStatus) === 'approved' && data && data.availability !== false;
}
function isBundleActiveInStorePublic(activeMap, k) {
  if (!activeMap || typeof activeMap !== 'object') return true;
  const v = activeMap[k];
  if (v === false) return false;
  if (v === 0 || v === '0') return false;
  if (v === 'false' || v === 'FALSE') return false;
  return true;
}
/** Same rules as the `/store` SPA (`displayPriceGhs` in `PublicStorefront.jsx`). */
function resolveStoreBundlePriceGhsFromData(data, network, bundleSize) {
  if (!data || data.availability === false) return null;
  const bundles = data.bundles || {};
  const list = Array.isArray(bundles[network]) ? bundles[network] : [];
  const b = list.find((x) => String(x.size) === String(bundleSize));
  if (!b) return null;
  const customP = data.customBundlePrices && typeof data.customBundlePrices === 'object' ? data.customBundlePrices : {};
  const customA = data.customBundleActive && typeof data.customBundleActive === 'object' ? data.customBundleActive : {};
  const k = bundleKeyPublic(network, bundleSize);
  if (!isBundleActiveInStorePublic(customA, k)) return null;
  const c = customP[k] != null && String(customP[k]).trim() !== '' ? Number.parseFloat(String(customP[k]), 10) : NaN;
  const p = Number.isFinite(c) && c >= 0 ? c : Number(b.price);
  if (!Number.isFinite(p) || p < 0) return null;
  return p;
}
function defaultBundleBaseGhs(network, bundleSize) {
  const bmap = getBundlesFromDb();
  const list = bmap && Array.isArray(bmap[network]) ? bmap[network] : [];
  const b = list.find((x) => String(x.size) === String(bundleSize));
  if (!b || !Number.isFinite(Number(b.price))) return null;
  return Number(b.price);
}

// ---- Public vendor store (read-only; no auth) ----
app.get('/api/public/store/:slug', (req, res) => {
  const slug = sanitizePathSlugServer(req.params.slug);
  if (!slug) {
    return res.status(404).json({ error: 'Not found' });
  }
  const row = db
    .prepare("SELECT data_json, updated_at, moderation_status FROM user_stores_v2 WHERE path_slug = ?")
    .get(slug);
  if (!row?.data_json) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const data = JSON.parse(row.data_json);
    if (!data || typeof data !== 'object') {
      return res.status(500).json({ error: 'Invalid store data' });
    }
    const isAdminPreview = hasAdminAccessFromAuthHeader(req);
    if (!isAdminPreview && !isStorePubliclyVisible({ moderationStatus: row.moderation_status, data })) {
      return res.status(404).json({ error: 'Store not available' });
    }
    const at = data.updatedAt != null && Number.isFinite(Number(data.updatedAt)) ? Number(data.updatedAt) : 0;
    return res.json({
      ...data,
      slug: data.slug || slug,
      v: data.v != null ? data.v : 1,
      ownerName: data.ownerName,
      display: data.display,
      service: data.service,
      availability: data.availability !== false,
      customBundlePrices: data.customBundlePrices || {},
      customBundleActive: data.customBundleActive || {},
      bundles: data.bundles || { mtn: [], telecel: [], bigtime: [], ishare: [] },
      updatedAt: at || (row.updated_at ? Date.parse(String(row.updated_at)) : 0) || 0,
      adminPreview: isAdminPreview,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Invalid store data' });
  }
});

/**
 * Public “track your order” — same orders the admin panel lists (by store + recipient phone).
 * Only includes purchases tied to this storefront (`store_owner_id`).
 */
app.post('/api/public/orders/track', (req, res) => {
  const storeSlug = sanitizePathSlugServer(req.body?.storeSlug);
  const phoneRaw = String(req.body?.phone || req.body?.recipientPhone || '').replace(/\D/g, '');
  if (!storeSlug) {
    return res.status(400).json({ error: 'Store is required' });
  }
  if (phoneRaw.length < 8 || phoneRaw.length > 15) {
    return res.status(400).json({ error: 'Please enter a valid phone number' });
  }
  const store = db.prepare('SELECT user_id FROM user_stores_v2 WHERE path_slug = ?').get(storeSlug);
  if (!store?.user_id) {
    return res.status(404).json({ error: 'Store not found' });
  }
  const ownerId = store.user_id;
  const rows = db
    .prepare(
      `SELECT id, bundle_size, bundle_price, network, status, created_at, recipient_number
       FROM orders
       WHERE store_owner_id = ?
         AND datetime(created_at) > datetime('now', '-120 days')
       ORDER BY datetime(created_at) DESC
       LIMIT 300`
    )
    .all(ownerId);
  const norm = (s) => String(s || '').replace(/\D/g, '');
  const want = phoneRaw;
  const matchPhone = (recipient) => {
    const r = norm(recipient);
    if (!r || !want) return false;
    if (r === want) return true;
    if (want.length >= 9 && r.length >= 9) {
      if (r.slice(-10) === want.slice(-10)) return true;
      if (r.slice(-9) === want.slice(-9) && want.length === 9) return true;
    }
    if (r.length > want.length && r.endsWith(want)) return true;
    if (want.length > r.length && want.endsWith(r)) return true;
    return false;
  };
  const filtered = rows.filter((o) => matchPhone(o.recipient_number)).slice(0, 30);
  const list = filtered.map((o) => {
    const net = networkLabel(o.network);
    const st = String(o.status || 'processing').toLowerCase();
    return {
      id: o.id,
      orderRef: `ORD-${String(o.id).padStart(6, '0')}`,
      bundleLabel: `${net} ${o.bundle_size || ''}`.trim(),
      bundle_size: o.bundle_size,
      network: o.network,
      status: st,
      priceGhs: o.bundle_price,
      created_at: o.created_at,
    };
  });
  return res.json({ ok: true, orders: list });
});

const PUBLIC_BUNDLE_NETS = new Set(['mtn', 'telecel', 'bigtime', 'ishare']);

function afaIsEnabledInStoreData(data) {
  const s = data?.service;
  if (!s) return false;
  const e = s.afaEnabled;
  if (e === true || e === 1) return true;
  if (e === false || e === 0) return false;
  return e != null && String(e).toLowerCase() === 'true';
}

function resolvePublicAfaFeeGhsFromStoreData(data) {
  if (!data || typeof data !== 'object' || !afaIsEnabledInStoreData(data)) return null;
  const p = parseFloat(String(data.service.afaPrice != null ? data.service.afaPrice : ''), 10);
  if (Number.isFinite(p) && p >= 0.01) return p;
  return AFA_REGISTRATION_FEE_GHS;
}

/**
 * Paystack return for /store (bundles or public AFA). Idempotent; throws on failure.
 */
async function fulfillPublicPaystackReference(reference) {
  const ref = String(reference || '').trim();
  if (!ref) throw new Error('reference required');

  const existingOrder = db.prepare('SELECT id FROM orders WHERE paystack_reference = ?').get(ref);
  if (existingOrder?.id) {
    return { kind: 'bundle', orderId: existingOrder.id, already: true, reference: ref };
  }
  const existingAfa = db.prepare('SELECT id FROM afa_applications WHERE paystack_reference = ?').get(ref);
  if (existingAfa?.id) {
    return { kind: 'afa', applicationId: existingAfa.id, already: true, reference: ref };
  }
  if (!paystackConfigured()) {
    throw new Error('Paystack is not configured');
  }
  const verified = await paystackVerifyTransaction(ref);
  if (verified.status !== 'success') {
    throw new Error('Payment was not successful');
  }
  const meta = normalizePaystackMetadata(verified.metadata);
  const kind = String(meta.kind || '');

  if (kind === 'public_store_afa') {
    const storeOwnerId = parseInt(String(meta.store_owner_id || ''), 10);
    if (!Number.isFinite(storeOwnerId) || storeOwnerId < 1) {
      throw new Error('Invalid payment metadata');
    }
    const storeSlug = sanitizePathSlugServer(meta.store_slug);
    if (!storeSlug) throw new Error('Invalid payment metadata');
    const pending = db.prepare('SELECT data_json FROM afa_public_paystack_pending WHERE reference = ?').get(ref);
    if (!pending?.data_json) {
      throw new Error('This payment session has expired. Start again from the store page.');
    }
    let pData;
    try {
      pData = JSON.parse(pending.data_json);
    } catch {
      throw new Error('Invalid pending data');
    }
    const row = db.prepare('SELECT data_json, moderation_status FROM user_stores_v2 WHERE user_id = ? AND path_slug = ?').get(storeOwnerId, storeSlug);
    if (!row?.data_json) {
      throw new Error('Store no longer available');
    }
    let data;
    try {
      data = JSON.parse(row.data_json);
    } catch {
      throw new Error('Invalid store data');
    }
    if (!isStorePubliclyVisible({ moderationStatus: row.moderation_status, data })) {
      throw new Error('Store no longer available');
    }
    const fee = resolvePublicAfaFeeGhsFromStoreData(data);
    if (fee == null || !Number.isFinite(fee)) {
      throw new Error('AFA is not available for this store');
    }
    const initAfaGhs = getMetaAmountGhsFromPaystack(meta);
    const initAfaPes = initAfaGhs != null ? Math.round(initAfaGhs * 100) : null;
    const feePes = Math.round(fee * 100);
    const paidPes = pickPaystackPaidPesewasForGhs(verified, { storePesewas: feePes, initPesewas: initAfaPes });
    if (paidPes == null) {
      throw new Error('Amount does not match the current fee');
    }
    const amountGhs = paidPes / 100;
    if (String(pData.storeSlug || '') !== storeSlug || Number(pData.storeOwnerId) !== storeOwnerId) {
      throw new Error('Store mismatch');
    }
    const fullName = String(pData.full_name || '').trim();
    const phone = String(pData.phone || '').trim();
    const ghanaCard = String(pData.ghana_card_number || '').trim();
    const occupation = String(pData.occupation || '').trim();
    const dob = String(pData.date_of_birth || '').trim();
    if (!fullName || !phone || !ghanaCard || !occupation || !dob) {
      throw new Error('Application data is incomplete');
    }
    const result = db
      .prepare(
        `INSERT INTO afa_applications
         (user_id, full_name, phone, ghana_card_number, occupation, date_of_birth, payment_amount, status, applied_at,
          is_public_checkout, public_store_slug, paystack_reference)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), 1, ?, ?)`
      )
      .run(storeOwnerId, fullName, phone, ghanaCard, occupation, dob, amountGhs, storeSlug, ref);
    db.prepare('DELETE FROM afa_public_paystack_pending WHERE reference = ?').run(ref);
    return { kind: 'afa', applicationId: result.lastInsertRowid, already: false, reference: ref };
  }

  if (kind === 'public_store_bundle') {
    const storeOwnerId = parseInt(String(meta.store_owner_id || ''), 10);
    if (!Number.isFinite(storeOwnerId) || storeOwnerId < 1) {
      throw new Error('Invalid payment metadata');
    }
    const storeSlug = sanitizePathSlugServer(meta.store_slug);
    const network = String(meta.network || '')
      .toLowerCase()
      .trim();
    const bundleSize = String(meta.bundle_size || '').trim();
    const phoneDigits = String(meta.recipient_phone || '').replace(/\D/g, '');
    if (!storeSlug || !PUBLIC_BUNDLE_NETS.has(network) || !bundleSize || phoneDigits.length !== 10) {
      throw new Error('Invalid payment metadata');
    }
    const srow = db.prepare('SELECT data_json, moderation_status FROM user_stores_v2 WHERE user_id = ? AND path_slug = ?').get(storeOwnerId, storeSlug);
    if (!srow?.data_json) {
      throw new Error('Store no longer available');
    }
    let sdata;
    try {
      sdata = JSON.parse(srow.data_json);
    } catch {
      throw new Error('Invalid store data');
    }
    if (!isStorePubliclyVisible({ moderationStatus: srow.moderation_status, data: sdata })) {
      throw new Error('Store no longer available');
    }
    const currentStoreGhs = resolveStoreBundlePriceGhsFromData(sdata, network, bundleSize);
    if (currentStoreGhs == null || !Number.isFinite(currentStoreGhs)) {
      throw new Error('Package is no longer available');
    }
    const storePesewas = Math.round(Number(currentStoreGhs) * 100);
    const initMetaGhs = getMetaAmountGhsFromPaystack(meta);
    const initPesewas = initMetaGhs != null ? Math.round(initMetaGhs * 100) : null;
    /** `data.amount` is usually pesewas, but is sometimes the GHS value (e.g. 5.9 vs 590) — see pickPaystackPaidPesewasForGhs. */
    const paidPesewas = pickPaystackPaidPesewasForGhs(verified, { storePesewas, initPesewas });
    if (paidPesewas == null) {
      throw new Error('Amount does not match current price');
    }
    const paidGhs = paidPesewas / 100;
    if (!Number.isFinite(paidGhs) || paidGhs < 0.01) {
      throw new Error('Invalid amount paid');
    }
    /** Bill at what the customer was actually charged (init quote if store price changed after checkout). */
    const price = Math.round(paidGhs * 100) / 100;
    const baseGhs = defaultBundleBaseGhs(network, bundleSize);
    const storeProfitGhs = baseGhs != null && Number.isFinite(baseGhs) && Number.isFinite(price) ? price - baseGhs : null;
    const result = db
      .prepare(
        `INSERT INTO orders (user_id, bundle_size, bundle_price, recipient_number, network, status, created_at,
         store_owner_id, store_base_ghs, store_profit_ghs, paystack_reference)
         VALUES (?, ?, ?, ?, ?, 'processing', datetime('now'),
         ?, ?, ?, ?)`
      )
      .run(
        storeOwnerId,
        bundleSize,
        price,
        phoneDigits,
        network,
        storeOwnerId,
        baseGhs,
        storeProfitGhs,
        ref
      );
    return { kind: 'bundle', orderId: result.lastInsertRowid, already: false, reference: ref };
  }

  throw new Error('This payment is not a public store checkout');
}

/** Guest checkout: same Paystack secret as wallet; amount is derived server-side from store data. */
app.post('/api/public/paystack/bundle/initialize', async (req, res) => {
  if (!paystackConfigured()) {
    return res.status(503).json({ error: 'Paystack is not configured on this server' });
  }
  const storeSlug = sanitizePathSlugServer(req.body?.storeSlug);
  const network = String(req.body?.network || '')
    .toLowerCase()
    .trim();
  const bundleSize = String(req.body?.bundleSize ?? '').trim();
  const phoneDigits = String(req.body?.recipientPhone || '').replace(/\D/g, '');
  if (!storeSlug || !PUBLIC_BUNDLE_NETS.has(network) || !bundleSize) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (phoneDigits.length !== 10) {
    return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
  }
  const row = db.prepare("SELECT user_id, data_json, moderation_status FROM user_stores_v2 WHERE path_slug = ?").get(storeSlug);
  if (!row?.data_json) {
    return res.status(404).json({ error: 'Store not found' });
  }
  let data;
  try {
    data = JSON.parse(row.data_json);
  } catch {
    return res.status(500).json({ error: 'Invalid store data' });
  }
  if (!data || typeof data !== 'object') {
    return res.status(500).json({ error: 'Invalid store data' });
  }
  if (!isStorePubliclyVisible({ moderationStatus: row.moderation_status, data })) {
    return res.status(404).json({ error: 'Store not available' });
  }
  const price = resolveStoreBundlePriceGhsFromData(data, network, bundleSize);
  if (price == null || !Number.isFinite(price) || price < 0.01) {
    return res.status(400).json({ error: 'This package is not available' });
  }
  const amountPesewas = Math.round(price * 100);
  if (amountPesewas < 1) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  const storeOwnerId = row.user_id;
  const reference = `PBS-${Date.now()}-${randomUUID().slice(0, 8)}`;
  // Paystack rejects non-public TLDs (e.g. .local). Use a valid-shaped domain; no mailbox required for MoMo.
  const guestDomain = (process.env.PAYSTACK_GUEST_EMAIL_DOMAIN || 'ultraxas.com').trim().replace(/^@/, '') || 'ultraxas.com';
  const email = `payer+${phoneDigits}@${guestDomain}`.slice(0, 120);
  const baseGhs = defaultBundleBaseGhs(network, bundleSize);
  const meta = {
    kind: 'public_store_bundle',
    store_slug: storeSlug,
    store_owner_id: String(storeOwnerId),
    network,
    bundle_size: bundleSize,
    recipient_phone: phoneDigits,
    amount_ghs: String(price),
  };
  if (baseGhs != null && Number.isFinite(baseGhs)) {
    meta.store_base_ghs = String(baseGhs);
  }
  const callbackUrl = `${resolveClientAppOrigin()}/store/${storeSlug}`;
  try {
    const pData = await paystackInitializeTransaction({
      email,
      amountPesewas,
      reference,
      metadata: meta,
      callbackUrl,
    });
    return res.json({
      access_code: pData.access_code,
      reference: pData.reference || reference,
      authorization_url: pData.authorization_url,
      amount_ghs: price,
    });
  } catch (e) {
    console.error('[public paystack bundle init]', e);
    return res.status(502).json({ error: e.message || 'Paystack error' });
  }
});

/** Public AFA: fee from store; form stored until Paystack success. */
app.post('/api/public/paystack/afa/initialize', async (req, res) => {
  if (!paystackConfigured()) {
    return res.status(503).json({ error: 'Paystack is not configured on this server' });
  }
  const storeSlug = sanitizePathSlugServer(req.body?.storeSlug);
  const fullName = String(req.body?.full_name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const ghanaCard = String(req.body?.ghana_card_number || '').trim();
  const occupation = String(req.body?.occupation || '').trim();
  const dob = String(req.body?.date_of_birth || '').trim();
  if (!storeSlug) {
    return res.status(400).json({ error: 'Store is required' });
  }
  if (!fullName || !phone || !ghanaCard || !occupation || !dob) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 8) {
    return res.status(400).json({ error: 'Enter a valid phone number' });
  }
  const row = db.prepare('SELECT user_id, data_json, moderation_status FROM user_stores_v2 WHERE path_slug = ?').get(storeSlug);
  if (!row?.data_json) {
    return res.status(404).json({ error: 'Store not found' });
  }
  let data;
  try {
    data = JSON.parse(row.data_json);
  } catch {
    return res.status(500).json({ error: 'Invalid store data' });
  }
  if (!isStorePubliclyVisible({ moderationStatus: row.moderation_status, data })) {
    return res.status(404).json({ error: 'Store not available' });
  }
  const fee = resolvePublicAfaFeeGhsFromStoreData(data);
  if (fee == null || !Number.isFinite(fee) || fee < 0.01) {
    return res.status(400).json({ error: 'AFA registration is not available for this store' });
  }
  const storeOwnerId = row.user_id;
  const amountPesewas = Math.round(fee * 100);
  if (amountPesewas < 1) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  const reference = `PFA-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const guestDomain = (process.env.PAYSTACK_GUEST_EMAIL_DOMAIN || 'ultraxas.com').trim().replace(/^@/, '') || 'ultraxas.com';
  const email = `aface+${phoneDigits}@${guestDomain}`.slice(0, 120);
  const callbackUrl = `${resolveClientAppOrigin()}/store/${storeSlug}`;
  const meta = {
    kind: 'public_store_afa',
    store_owner_id: String(storeOwnerId),
    store_slug: storeSlug,
    amount_ghs: String(fee),
  };
  const pending = {
    storeOwnerId,
    storeSlug,
    full_name: fullName,
    phone,
    ghana_card_number: ghanaCard,
    occupation,
    date_of_birth: dob,
  };
  try {
    db.prepare('INSERT INTO afa_public_paystack_pending (reference, data_json) VALUES (?, ?)').run(
      reference,
      JSON.stringify(pending)
    );
  } catch (e) {
    return res.status(500).json({ error: 'Could not start application session' });
  }
  try {
    const pData = await paystackInitializeTransaction({
      email,
      amountPesewas,
      reference,
      metadata: meta,
      callbackUrl,
    });
    return res.json({
      access_code: pData.access_code,
      reference: pData.reference || reference,
      authorization_url: pData.authorization_url,
      amount_ghs: fee,
    });
  } catch (e) {
    try {
      db.prepare('DELETE FROM afa_public_paystack_pending WHERE reference = ?').run(reference);
    } catch (_) {
      // ignore
    }
    console.error('[public paystack afa init]', e);
    return res.status(502).json({ error: e.message || 'Paystack error' });
  }
});

async function sendPublicPaystackVerify(req, res) {
  if (!paystackConfigured()) {
    return res.status(503).json({ error: 'Paystack is not configured' });
  }
  const reference = String(req.body?.reference || '').trim();
  if (!reference) {
    return res.status(400).json({ error: 'reference required' });
  }
  try {
    const out = await fulfillPublicPaystackReference(reference);
    if (out.kind === 'afa') {
      return res.json({
        ok: true,
        kind: 'afa',
        applicationId: out.applicationId,
        already: out.already,
        reference: out.reference,
      });
    }
    if (out.kind === 'bundle') {
      return res.json({
        ok: true,
        kind: 'bundle',
        orderId: out.orderId,
        already: out.already,
        reference: out.reference,
      });
    }
    return res.status(400).json({ error: 'Unknown result' });
  } catch (e) {
    console.error('[public paystack verify]', e);
    return res.status(400).json({ error: e.message || 'Verification failed' });
  }
}

app.post('/api/public/paystack/verify', sendPublicPaystackVerify);
app.post('/api/public/paystack/bundle/verify', sendPublicPaystackVerify);

// ---- My vendor store (signed-in owner) ----
app.get('/api/store', authMiddleware, (req, res) => {
  const requestedStoreId = Number.parseInt(String(req.query?.storeId || ''), 10);
  const row = db
    .prepare(
      Number.isFinite(requestedStoreId)
        ? "SELECT id, path_slug, data_json, updated_at, moderation_status, moderation_note, reviewed_at FROM user_stores_v2 WHERE user_id = ? AND id = ?"
        : "SELECT id, path_slug, data_json, updated_at, moderation_status, moderation_note, reviewed_at FROM user_stores_v2 WHERE user_id = ? ORDER BY datetime(COALESCE(updated_at, '1970-01-01')) DESC, id DESC LIMIT 1"
    )
    .get(...(Number.isFinite(requestedStoreId) ? [req.userId, requestedStoreId] : [req.userId]));
  if (!row?.data_json) {
    return res.json({ store: null });
  }
  try {
    const d = JSON.parse(row.data_json);
    if (!d || typeof d !== 'object') {
      return res.json({ store: null });
    }
    return res.json({
      store: {
        storeId: Number(row.id),
        pathSlug: row.path_slug,
        pathSlugOverride: d.pathSlugOverride != null ? String(d.pathSlugOverride) : null,
        display: d.display || {},
        service: d.service || {},
        availability: d.availability !== false,
        customBundlePrices: d.customBundlePrices && typeof d.customBundlePrices === 'object' ? d.customBundlePrices : {},
        customBundleActive: d.customBundleActive && typeof d.customBundleActive === 'object' ? d.customBundleActive : {},
        bundles: d.bundles || { mtn: [], telecel: [], bigtime: [], ishare: [] },
        ownerName: d.ownerName || 'Store',
        moderationStatus: normalizeStoreModerationStatus(row.moderation_status),
        moderationNote: row.moderation_note ? String(row.moderation_note) : '',
        moderationReviewedAt: row.reviewed_at || null,
        v: d.v != null ? d.v : 1,
        updatedAt: d.updatedAt != null && Number.isFinite(Number(d.updatedAt)) ? Number(d.updatedAt) : 0,
      },
    });
  } catch (e) {
    return res.json({ store: null });
  }
});

app.get('/api/stores', authMiddleware, (req, res) => {
  try {
    const rows = db
      .prepare(
        "SELECT id, path_slug, data_json, updated_at, moderation_status, moderation_note, reviewed_at FROM user_stores_v2 WHERE user_id = ? ORDER BY datetime(COALESCE(updated_at, '1970-01-01')) DESC, id DESC LIMIT 50"
      )
      .all(req.userId);
    const stores = rows
      .map((row) => {
        let d = {};
        try {
          d = JSON.parse(row.data_json || '{}');
        } catch {
          d = {};
        }
        const display = d && typeof d === 'object' && d.display && typeof d.display === 'object' ? d.display : {};
        const name = String(display.storeName || d.ownerName || 'Store').trim() || 'Store';
        return {
          storeId: Number(row.id),
          pathSlug: String(row.path_slug || ''),
          storeName: name,
          moderationStatus: normalizeStoreModerationStatus(row.moderation_status),
          updatedAt: row.updated_at || null,
        };
      })
      .slice(0, 10);
    return res.json({ stores });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load stores' });
  }
});

app.put('/api/store', authMiddleware, (req, res) => {
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const pathSlug = sanitizePathSlugServer(b.pathSlug);
  if (!pathSlug) {
    return res.status(400).json({ error: 'pathSlug (store URL) is required' });
  }
  const overrideRaw = b.pathSlugOverride;
  const pathSlugOverride =
    overrideRaw != null && String(overrideRaw).trim() !== '' ? sanitizePathSlugServer(overrideRaw) : null;
  if (pathSlugOverride && pathSlugOverride !== pathSlug) {
    return res.status(400).json({ error: 'pathSlug and pathSlugOverride are inconsistent' });
  }
  const other = db
    .prepare("SELECT user_id FROM user_stores_v2 WHERE path_slug = ? AND user_id != ?")
    .get(pathSlug, req.userId);
  if (other) {
    return res.status(409).json({ error: 'This store URL is already taken' });
  }
  const display = b.display && typeof b.display === 'object' ? b.display : {};
  const service = b.service && typeof b.service === 'object' ? b.service : {};
  const customBundlePrices =
    b.customBundlePrices && typeof b.customBundlePrices === 'object' ? b.customBundlePrices : {};
  const customBundleActive =
    b.customBundleActive && typeof b.customBundleActive === 'object' ? b.customBundleActive : {};
  const bundles =
    b.bundles && typeof b.bundles === 'object' ? b.bundles : { mtn: [], telecel: [], bigtime: [], ishare: [] };
  const normalizedBundles = {
    mtn: Array.isArray(bundles.mtn) ? bundles.mtn : [],
    telecel: Array.isArray(bundles.telecel) ? bundles.telecel : [],
    bigtime: Array.isArray(bundles.bigtime) ? bundles.bigtime : [],
    ishare: Array.isArray(bundles.ishare) ? bundles.ishare : [],
  };
  const basePriceByKey = new Map();
  for (const network of ['mtn', 'telecel', 'bigtime', 'ishare']) {
    const list = normalizedBundles[network];
    for (const item of list) {
      const size = item && item.size != null ? String(item.size) : '';
      const base = item != null ? Number(item.price) : NaN;
      if (!size || !Number.isFinite(base)) continue;
      basePriceByKey.set(`${network}|${size}`, base);
    }
  }
  for (const [rawKey, rawValue] of Object.entries(customBundlePrices || {})) {
    const key = String(rawKey || '').trim();
    if (!key) continue;
    if (rawValue == null || String(rawValue).trim() === '') continue;
    const priceNum = Number(rawValue);
    if (!Number.isFinite(priceNum)) continue;
    const base = basePriceByKey.get(key);
    if (Number.isFinite(base) && priceNum + 1e-9 < base) {
      return res.status(400).json({
        error: `Price for ${key} cannot be lower than base price (GHS ${base.toFixed(2)}).`,
      });
    }
  }
  const ownerName = typeof b.ownerName === 'string' ? b.ownerName.slice(0, 200) : 'Store';
  const availability = b.availability === false || b.availability === 0 || b.availability === '0' ? false : true;
  const now = Date.now();
  const payload = {
    v: 1,
    slug: pathSlug,
    pathSlugOverride: pathSlugOverride,
    display,
    service,
    customBundlePrices,
    customBundleActive,
    bundles: normalizedBundles,
    ownerName,
    availability,
    updatedAt: now,
  };
  const json = JSON.stringify(payload);
  const requestedStoreId = Number.parseInt(String(b.storeId || ''), 10);
  const createNew = b.createNew === true;
  const targetStore = Number.isFinite(requestedStoreId)
    ? db.prepare('SELECT id, moderation_status FROM user_stores_v2 WHERE id = ? AND user_id = ?').get(requestedStoreId, req.userId)
    : db.prepare("SELECT id, moderation_status FROM user_stores_v2 WHERE user_id = ? ORDER BY datetime(COALESCE(updated_at, '1970-01-01')) DESC, id DESC LIMIT 1").get(req.userId);
  const storeCountRow = db.prepare('SELECT COUNT(1) AS c FROM user_stores_v2 WHERE user_id = ?').get(req.userId);
  const storeCount = Number(storeCountRow?.c || 0);
  const wantsPendingResubmission =
    String(b.moderationStatus || '').trim().toLowerCase() === 'pending';
  if (createNew || !targetStore) {
    if (storeCount >= 10) {
      return res.status(400).json({ error: 'Store limit reached. You can create up to 10 stores.' });
    }
    if (db.prepare("SELECT 1 AS x FROM user_stores_v2 WHERE path_slug = ?").get(pathSlug)) {
      return res.status(409).json({ error: 'This store URL is already taken' });
    }
    const info = db
      .prepare("INSERT INTO user_stores_v2 (user_id, path_slug, data_json, updated_at, moderation_status, moderation_note, reviewed_at, reviewed_by) VALUES (?, ?, ?, datetime('now'), 'pending', '', NULL, NULL)")
      .run(req.userId, pathSlug, json);
    return res.json({ ok: true, storeId: Number(info.lastInsertRowid || 0), pathSlug, updatedAt: now, moderationStatus: 'pending' });
  }
  if (targetStore) {
    if (wantsPendingResubmission) {
      // Vendor re-submission should move an existing store back into admin review queue.
      db
        .prepare(
          "UPDATE user_stores_v2 SET path_slug = ?, data_json = ?, updated_at = datetime('now'), moderation_status = 'pending', moderation_note = '', reviewed_at = NULL, reviewed_by = NULL WHERE id = ? AND user_id = ?"
        )
        .run(pathSlug, json, targetStore.id, req.userId);
    } else {
      db
        .prepare("UPDATE user_stores_v2 SET path_slug = ?, data_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
        .run(pathSlug, json, targetStore.id, req.userId);
    }
  }
  const moderationStatus = targetStore
    ? wantsPendingResubmission
      ? 'pending'
      : normalizeStoreModerationStatus(targetStore.moderation_status)
    : 'pending';
  return res.json({ ok: true, storeId: Number(targetStore?.id || 0), pathSlug, updatedAt: now, moderationStatus });
});

app.delete('/api/store', authMiddleware, (req, res) => {
  const uid = req.userId;
  try {
    const requestedStoreId = Number.parseInt(String(req.body?.storeId || req.query?.storeId || ''), 10);
    if (Number.isFinite(requestedStoreId)) {
      db.prepare('DELETE FROM user_stores_v2 WHERE id = ? AND user_id = ?').run(requestedStoreId, uid);
      return res.json({ ok: true, deletedStoreId: requestedStoreId });
    }
    const row = db.prepare("SELECT id FROM user_stores_v2 WHERE user_id = ? ORDER BY datetime(COALESCE(updated_at, '1970-01-01')) DESC, id DESC LIMIT 1").get(uid);
    if (!row) return res.json({ ok: true });
    db.prepare('DELETE FROM user_stores_v2 WHERE id = ? AND user_id = ?').run(row.id, uid);
    return res.json({ ok: true, deletedStoreId: Number(row.id) });
  } catch (e) {
    console.error('[store/delete]', e);
    return res.status(500).json({ error: 'Failed to delete store' });
  }
});

/**
 * Store dashboard → Earnings: wallet + aggregates for this vendor (orders where store_owner_id = you).
 * Period: today | this-week | this-month | last-month (default this-month). Revenue/profit in period
 * use that window; total* are all-time. Counts all paid/earning rows except failed/cancelled (includes `processing`).
 */
function storeEarningsPeriodClause(period) {
  const p = String(period || 'this-month').trim() || 'this-month';
  if (p === 'today') {
    return "date(o.created_at) = date('now', 'localtime')";
  }
  if (p === 'this-week') {
    return "date(o.created_at) >= date('now', 'localtime', '-6 days')";
  }
  if (p === 'last-month') {
    return "strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now', 'localtime', '-1 month')";
  }
  return "strftime('%Y-%m', o.created_at) = strftime('%Y-%m', 'now', 'localtime')";
}

app.get('/api/store/earnings', authMiddleware, (req, res) => {
  const uid = req.userId;
  const period = String(req.query?.period || 'this-month').trim() || 'this-month';
  const wallet = db.prepare('SELECT balance, updated_at FROM wallets WHERE user_id = ?').get(uid);
  const balanceGhs = wallet ? Number(wallet.balance || 0) : 0;
  const perCond = storeEarningsPeriodClause(period);
  const earned = storeOrderCountsTowardEarnings('o');
  const processingOnly = storeOrderIsProcessing('o');
  const profitX = orderProfitExpression('o');

  let revenueInPeriodGhs = 0;
  let pendingProfitGhs = 0;
  let totalRevenueGhs = 0;
  let totalProfitGhs = 0;
  let periodProfitGhs = 0;
  try {
    const r1 = db
      .prepare(
        `SELECT COALESCE(SUM(o.bundle_price), 0) AS t
         FROM orders o
         WHERE o.store_owner_id = ? AND ${earned} AND ${perCond}`
      )
      .get(uid);
    revenueInPeriodGhs = r1 && r1.t != null ? Number(r1.t) : 0;
  } catch (e) {
    console.error('[store/earnings] revenue in period', e);
  }
  try {
    const r2 = db
      .prepare(
        `SELECT COALESCE(SUM(${profitX}), 0) AS t
         FROM orders o
         WHERE o.store_owner_id = ? AND ${processingOnly}`
      )
      .get(uid);
    pendingProfitGhs = r2 && r2.t != null ? Number(r2.t) : 0;
  } catch (e) {
    console.error('[store/earnings] pending', e);
  }
  try {
    const r3 = db
      .prepare(
        `SELECT COALESCE(SUM(o.bundle_price), 0) AS t
         FROM orders o
         WHERE o.store_owner_id = ? AND ${earned}`
      )
      .get(uid);
    totalRevenueGhs = r3 && r3.t != null ? Number(r3.t) : 0;
  } catch (e) {
    console.error('[store/earnings] total revenue', e);
  }
  try {
    const r4 = db
      .prepare(
        `SELECT COALESCE(SUM(${profitX}), 0) AS t
         FROM orders o
         WHERE o.store_owner_id = ? AND ${earned}`
      )
      .get(uid);
    totalProfitGhs = r4 && r4.t != null ? Number(r4.t) : 0;
  } catch (e) {
    console.error('[store/earnings] total profit', e);
  }
  try {
    const r5 = db
      .prepare(
        `SELECT COALESCE(SUM(${profitX}), 0) AS t
         FROM orders o
         WHERE o.store_owner_id = ? AND ${earned} AND ${perCond}`
      )
      .get(uid);
    periodProfitGhs = r5 && r5.t != null ? Number(r5.t) : 0;
  } catch (e) {
    console.error('[store/earnings] period profit', e);
  }

  let totalWithdrawnGhs = 0;
  let pendingRequestedGhs = 0;
  const withdrawals = [];
  let latestWithdrawalRequestStatus = 'pending';
  try {
    const tw = db
      .prepare(
        `SELECT COALESCE(SUM(ABS(amount)), 0) AS t
         FROM transactions
         WHERE user_id = ? AND LOWER(COALESCE(type,'')) IN ('withdrawal', 'payout', 'store_payout')`
      )
      .get(uid);
    totalWithdrawnGhs = tw && tw.t != null ? Number(tw.t) : 0;
  } catch (e) {
    console.error('[store/earnings] total withdrawn', e);
  }
  try {
    const wrows = db
      .prepare(
        `SELECT id, type, amount, reference,
                COALESCE(created_at, datetime('now')) AS created_at,
                COALESCE(description, '') AS description
         FROM transactions
         WHERE user_id = ? AND LOWER(COALESCE(type,'')) IN ('withdrawal', 'payout', 'store_payout')
         ORDER BY datetime(created_at) DESC
         LIMIT 20`
      )
      .all(uid);
    for (const row of wrows) {
      withdrawals.push({
        id: row.id,
        type: row.type,
        amount: row.amount,
        reference: row.reference,
        created_at: row.created_at,
        description: row.description,
      });
    }
  } catch (e) {
    console.error('[store/earnings] withdrawals list', e);
  }
  try {
    const latestReq = db
      .prepare(
        `SELECT status
         FROM store_withdrawal_requests
         WHERE user_id = ?
         ORDER BY datetime(created_at) DESC, id DESC
         LIMIT 1`
      )
      .get(uid);
    latestWithdrawalRequestStatus = normalizeWithdrawalRequestStatus(latestReq?.status);
  } catch (e) {
    console.error('[store/earnings] latest withdrawal request status', e);
  }

  try {
    const pr = db
      .prepare(
        `SELECT COALESCE(SUM(amount_ghs), 0) AS t
         FROM store_withdrawal_requests
         WHERE user_id = ? AND LOWER(COALESCE(status,'')) IN ('pending','processing')`
      )
      .get(uid);
    pendingRequestedGhs = pr && pr.t != null ? Number(pr.t) : 0;
  } catch (e) {
    console.error('[store/earnings] pending requests total', e);
  }
  const withdrawableFromProfit = Math.max(0, totalProfitGhs - totalWithdrawnGhs - pendingRequestedGhs);
  const withdrawableGhs = Math.round(withdrawableFromProfit * 100) / 100;
  return res.json({
    balanceGhs,
    walletUpdatedAt: wallet?.updated_at || null,
    withdrawableGhs,
    period,
    revenueInPeriodGhs: revenueInPeriodGhs,
    periodProfitGhs: periodProfitGhs,
    profitPendingGhs: pendingProfitGhs,
    totalRevenueGhs: totalRevenueGhs,
    totalProfitGhs: totalProfitGhs,
    totalWithdrawnGhs: totalWithdrawnGhs,
    pendingRequestedGhs,
    latestWithdrawalRequestStatus,
    withdrawals,
  });
});

const MIN_STORE_WITHDRAWAL_GHS = 50;
const STORE_WITHDRAWAL_FEE_RATE = 0.02;

/** Store vendor: request a payout to mobile money (admin reviews on dashboard). */
app.post('/api/store/withdrawal-request', authMiddleware, (req, res) => {
  const requestedStoreId = Number.parseInt(String(req.body?.storeId || ''), 10);
  const targetStore = Number.isFinite(requestedStoreId)
    ? db.prepare('SELECT id, data_json FROM user_stores_v2 WHERE id = ? AND user_id = ?').get(requestedStoreId, req.userId)
    : db
        .prepare(
          "SELECT id, data_json FROM user_stores_v2 WHERE user_id = ? ORDER BY datetime(COALESCE(updated_at, '1970-01-01')) DESC, id DESC LIMIT 1"
        )
        .get(req.userId);
  if (!targetStore) {
    return res.status(404).json({ error: 'Store not found for withdrawal request.' });
  }
  let storeData = {};
  try {
    storeData = JSON.parse(targetStore.data_json || '{}');
  } catch {
    storeData = {};
  }
  const storeService =
    storeData && typeof storeData === 'object' && storeData.service && typeof storeData.service === 'object'
      ? storeData.service
      : {};
  if (normalizeStoreWithdrawalStatus(storeService.withdrawalStatus) !== 'enabled') {
    return res.status(403).json({ error: 'Withdrawals are paused by admin for this store right now.' });
  }
  const fullName = String(req.body?.fullName || req.body?.full_name || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const amountGhs = Number(req.body?.amountGhs ?? req.body?.amount_ghs);
  if (!fullName) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 8) {
    return res.status(400).json({ error: 'Enter a valid phone number (at least 8 digits).' });
  }
  if (!Number.isFinite(amountGhs) || amountGhs < MIN_STORE_WITHDRAWAL_GHS) {
    return res.status(400).json({ error: `Minimum withdrawal is GHS ${MIN_STORE_WITHDRAWAL_GHS}.` });
  }
  const earned = storeOrderCountsTowardEarnings('o');
  const profitRow = db
    .prepare(
      `SELECT COALESCE(SUM(${orderProfitExpression('o')}), 0) AS t
       FROM orders o
       WHERE o.store_owner_id = ? AND ${earned}`
    )
    .get(req.userId);
  const totalProfitGhs = profitRow && profitRow.t != null ? Number(profitRow.t) : 0;
  const withdrawnRow = db
    .prepare(
      `SELECT COALESCE(SUM(ABS(amount)), 0) AS t
       FROM transactions
       WHERE user_id = ? AND LOWER(COALESCE(type,'')) IN ('withdrawal', 'payout', 'store_payout')`
    )
    .get(req.userId);
  const totalWithdrawnGhs = withdrawnRow && withdrawnRow.t != null ? Number(withdrawnRow.t) : 0;
  const pendingReqRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount_ghs), 0) AS t
       FROM store_withdrawal_requests
       WHERE user_id = ? AND LOWER(COALESCE(status,'')) IN ('pending','processing')`
    )
    .get(req.userId);
  const pendingRequestedGhs = pendingReqRow && pendingReqRow.t != null ? Number(pendingReqRow.t) : 0;
  const availableToWithdraw = Math.max(0, totalProfitGhs - totalWithdrawnGhs - pendingRequestedGhs);
  if (amountGhs > availableToWithdraw + 1e-6) {
    return res
      .status(400)
      .json({ error: `Amount cannot exceed your withdrawable profit balance (GHS ${availableToWithdraw.toFixed(2)}).` });
  }
  const rawFee = amountGhs * STORE_WITHDRAWAL_FEE_RATE;
  const feeGhs = Math.round(rawFee * 100) / 100;
  const netGhs = Math.round((amountGhs - feeGhs) * 100) / 100;
  if (netGhs <= 0) {
    return res.status(400).json({ error: 'Amount is too small after the processing fee.' });
  }
  try {
    const r = db
      .prepare(
        `INSERT INTO store_withdrawal_requests
         (user_id, full_name, phone, amount_ghs, fee_ghs, net_after_fee_ghs, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`
      )
      .run(req.userId, fullName, phone, amountGhs, feeGhs, netGhs);
    return res.json({
      ok: true,
      id: r.lastInsertRowid,
      amountGhs,
      feeGhs,
      netAfterFeeGhs: netGhs,
    });
  } catch (e) {
    console.error('[store/withdrawal-request]', e);
    return res.status(500).json({ error: 'Could not save withdrawal request' });
  }
});

app.get('/api/admin/withdrawal-requests', adminAuthMiddleware, (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT r.id, r.user_id, r.full_name, r.phone, r.amount_ghs, r.fee_ghs, r.net_after_fee_ghs, r.status, r.created_at,
                u.email AS user_email,
                u.full_name AS user_account_name
         FROM store_withdrawal_requests r
         JOIN users u ON u.id = r.user_id
         ORDER BY datetime(r.created_at) DESC
         LIMIT 500`
      )
      .all();
    return res.json({ requests: rows });
  } catch (e) {
    console.error('[admin/withdrawal-requests]', e);
    return res.status(500).json({ error: 'Failed to list withdrawal requests' });
  }
});

app.patch('/api/admin/withdrawal-requests/:requestId', adminAuthMiddleware, (req, res) => {
  const requestId = parseInt(String(req.params.requestId || ''), 10);
  if (!Number.isFinite(requestId)) {
    return res.status(400).json({ error: 'Invalid request id' });
  }
  const nextStatus = normalizeWithdrawalRequestStatus(req.body?.status);
  const row = db
    .prepare(
      `SELECT id, user_id, amount_ghs, fee_ghs, net_after_fee_ghs, status
       FROM store_withdrawal_requests
       WHERE id = ?`
    )
    .get(requestId);
  if (!row) {
    return res.status(404).json({ error: 'Withdrawal request not found' });
  }
  const prevStatus = normalizeWithdrawalRequestStatus(row.status);
  if (prevStatus === 'completed' && nextStatus !== 'completed') {
    return res.status(400).json({ error: 'Completed withdrawals cannot be moved back to another status.' });
  }

  try {
    db.prepare("UPDATE store_withdrawal_requests SET status = ? WHERE id = ?").run(nextStatus, requestId);
    if (nextStatus === 'completed' && prevStatus !== 'completed') {
      const amountGhs = Number(row.amount_ghs || 0);
      const netGhs = Number(row.net_after_fee_ghs || 0);
      const feeGhs = Number(row.fee_ghs || 0);
      const ref = `STORE-WD-REQ-${requestId}-${Date.now()}`;
      const desc = `Store withdrawal paid (request #${requestId}): requested GHS ${amountGhs.toFixed(2)}, fee GHS ${feeGhs.toFixed(2)}, net GHS ${netGhs.toFixed(2)}`;
      db.prepare(
        "INSERT INTO transactions (user_id, type, amount, reference, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
      ).run(row.user_id, 'store_payout', -Math.abs(amountGhs), ref, desc, 'completed');
    }
    const updated = db
      .prepare(
        `SELECT r.id, r.user_id, r.full_name, r.phone, r.amount_ghs, r.fee_ghs, r.net_after_fee_ghs, r.status, r.created_at,
                u.email AS user_email,
                u.full_name AS user_account_name
         FROM store_withdrawal_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ?`
      )
      .get(requestId);
    return res.json({ ok: true, request: updated || null });
  } catch (e) {
    console.error('[admin/withdrawal-requests patch]', e);
    return res.status(500).json({ error: 'Failed to update withdrawal request' });
  }
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
