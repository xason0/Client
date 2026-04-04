import { splitBroadcastCaption, packBroadcastCaption } from '../shared/broadcastSanitize.js';

/** Opt-in only: API runs on same machine (`npm run api:dev` → port 3001). Production API lives on the VPS. */
const LOCAL_DEV_API_DEFAULT = 'http://localhost:3001';
/** Default API host — all routes (auth, admin, broadcasts, etc.) are served here from the VPS. */
const DEFAULT_API_BASE = 'https://ok.ultraxas.com';

/**
 * VITE_API_URL — override base URL (staging, alternate domain, etc.).
 * VITE_API_USE_LOCAL=true — use http://localhost:3001 when you run the Node API locally (not the VPS).
 * VITE_PAYSTACK_PUBLIC_KEY — must be present at `npm run build` or Paystack checkout is disabled in the bundle.
 */
function resolveApiBase() {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (envUrl) return envUrl;
  if (import.meta.env.VITE_API_USE_LOCAL === 'true') {
    return LOCAL_DEV_API_DEFAULT;
  }
  return DEFAULT_API_BASE;
}

const API_URL = resolveApiBase();

const MAX_BROADCAST_RESHOW_HOURS = 8760;

function normalizeBroadcastRow(b) {
  if (!b || typeof b !== 'object') return b;
  const { title, captionHtml } = splitBroadcastCaption(b.caption, b.title);
  let reshowHours = 0;
  if (b.reshow_after_hours != null || b.reshowAfterHours != null) {
    const h = Number(b.reshow_after_hours ?? b.reshowAfterHours);
    reshowHours = Number.isFinite(h) ? Math.round(h) : 0;
  } else {
    const d = Number(b.reshow_after_days ?? b.reshowAfterDays ?? 0);
    reshowHours = Number.isFinite(d) ? Math.round(d * 24) : 0;
  }
  reshowHours = Math.min(MAX_BROADCAST_RESHOW_HOURS, Math.max(0, reshowHours));
  const out = {
    ...b,
    title,
    caption: captionHtml,
    popup_delay_seconds: b.popup_delay_seconds ?? b.popupDelaySeconds,
    auto_close_seconds: b.auto_close_seconds ?? b.autoCloseSeconds,
    reshow_after_hours: reshowHours,
  };
  delete out.reshow_after_days;
  delete out.reshowAfterDays;
  return out;
}

const ADMIN_TOKEN_KEY = 'dataplus_admin_token';
const withNoStoreTs = (url) => `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

function getToken() {
  return localStorage.getItem('dataplus_token');
}

function setToken(token) {
  if (token) localStorage.setItem('dataplus_token', token);
  else localStorage.removeItem('dataplus_token');
}

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function setAdminToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function headers() {
  const t = getToken();
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

/** Abort fetch after ms so the UI does not hang forever on unreachable/slow API. */
function fetchWithTimeout(url, init = {}, timeoutMs = 35000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
}

function adminHeaders() {
  const t = getAdminToken() || getToken();
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

/** Production hosts return 404 until support routes are deployed with the Node API. */
function supportFetchError(res, data, fallback) {
  const serverMsg = data && typeof data === 'object' && typeof data.error === 'string' ? data.error : '';
  if (res.status === 404) {
    return new Error(
      serverMsg ||
        'Support chat is not on this API yet (404). Deploy the latest server code to your API host, or set VITE_API_USE_LOCAL=true and run the local API.'
    );
  }
  return new Error(serverMsg || fallback);
}

/** Normalize reply_* / camelCase and backfill quote text from the target message after a full page reload. */
function normalizeSupportThreadMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return Array.isArray(messages) ? messages : [];
  const byId = new Map();
  for (const x of messages) {
    if (x && x.id != null) byId.set(String(x.id), x);
  }
  return messages.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const rt = m.replyTo ?? m.reply_to ?? m.reply_to_id;
    if (rt == null || String(rt).trim() === '') return m;
    const rid = String(rt).trim();
    const prev = String(m.replyPreview ?? m.reply_preview ?? '').trim();
    const roleStr = String(m.replyRole ?? m.reply_role ?? '').trim();
    const hasRole = roleStr.length > 0;
    if (prev && prev !== '…' && hasRole) return { ...m, replyTo: rid, replyPreview: prev, replyRole: roleStr };
    const target = byId.get(rid);
    if (!target) {
      return { ...m, replyTo: rid, replyPreview: prev || '…', replyRole: hasRole ? roleStr : 'user' };
    }
    const bodyTrim = String(target.body || '').trim();
    const fromTarget =
      target.image && !bodyTrim ? '📷 Image' : bodyTrim.slice(0, 220) || '…';
    const replyPreview = !prev || prev === '…' ? fromTarget : prev;
    const replyRole = hasRole ? roleStr : String(target.role || 'user');
    return { ...m, replyTo: rid, replyPreview, replyRole };
  });
}

export const api = {
  getUrl: () => API_URL,
  getToken,
  setToken,
  getAdminToken,
  setAdminToken,
  clearAdminToken,

  /** Paystack publishable key + flags (no auth). Lets production hosts work without VITE_PAYSTACK_PUBLIC_KEY at build time. */
  async getPublicConfig() {
    const res = await fetch(`${API_URL}/api/public/config`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { paystackPublicKey: '', paystackEnabled: false };
    return data;
  },

  async register({ email, password, fullName, phone }) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        fullName: (fullName || '').trim(),
        phone: (phone || '').trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    return data;
  },

  async login({ email, password }) {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Login failed');
    return data;
  },

  async me() {
    const res = await fetch(`${API_URL}/api/auth/me`, { headers: headers() });
    if (res.status === 401) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load user');
    return data;
  },

  async uploadProfileImage(avatarDataUrlOrNull) {
    const res = await fetch(`${API_URL}/api/profile/avatar`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ avatar: avatarDataUrlOrNull ?? null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save profile picture');
    return data;
  },

  async updateProfile({ fullName, email, phone }) {
    const res = await fetch(`${API_URL}/api/profile`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ fullName: fullName ?? undefined, email: email ?? undefined, phone: phone ?? undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update profile');
    return data;
  },

  async changePassword({ currentPassword, newPassword }) {
    const res = await fetch(`${API_URL}/api/profile/password`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to change password');
    return data;
  },

  async getWallet() {
    const res = await fetch(`${API_URL}/api/wallet`, { headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load wallet');
    return data;
  },

  async topUp(amount) {
    const res = await fetch(`${API_URL}/api/wallet/topup`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ amount: parseFloat(amount) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Top-up failed');
    return data;
  },

  async initPaystackWalletTopUp(amount) {
    let res;
    try {
      res = await fetchWithTimeout(
        `${API_URL}/api/wallet/paystack/initialize`,
        {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ amount: parseFloat(amount) }),
        },
        40000
      );
    } catch (e) {
      if (e?.name === 'AbortError') {
        throw new Error(
          'Payment server did not respond in time. Check VPN/firewall, that the API is up, and VITE_API_URL.'
        );
      }
      if (e instanceof TypeError) {
        throw new Error('Cannot reach the API (network). Confirm VITE_API_URL and that the backend is running.');
      }
      throw e;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not start Paystack checkout (${res.status})`);
    return data;
  },

  async verifyPaystackWalletTopUp(reference) {
    const res = await fetch(`${API_URL}/api/wallet/paystack/verify`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ reference: String(reference || '').trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not verify payment');
    return data;
  },

  async getTransactions() {
    const res = await fetch(`${API_URL}/api/wallet/transactions`, { headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load transactions');
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.transactions)) return data.transactions;
    return [];
  },

  async getOrders() {
    const res = await fetch(`${API_URL}/api/orders?t=${Date.now()}`, { headers: headers(), cache: 'no-store' });
    if (res.status === 401) return [];
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load orders');
    return Array.isArray(data) ? data : [];
  },

  async createOrders(items) {
    const res = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        items: items.map((i) => ({
          bundle_size: i.bundle?.size,
          bundle_price: i.bundle?.price,
          recipient_number: i.recipientNumber || i.recipient_number,
          network: i.bundle?.network ?? 'mtn',
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Order failed');
    return data;
  },

  async getAfaApplications() {
    const res = await fetch(`${API_URL}/api/afa-applications?t=${Date.now()}`, { headers: headers(), cache: 'no-store' });
    if (res.status === 401) return [];
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load AFA applications');
    return Array.isArray(data) ? data : [];
  },

  async createAfaApplication(payload) {
    const res = await fetch(`${API_URL}/api/afa-applications`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error(data.error || 'Failed to submit AFA application');
    return data;
  },

  async getBundles() {
    const res = await fetch(`${API_URL}/api/bundles`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Failed to load bundles (${res.status})`);
    if (!data || typeof data !== 'object' || !Array.isArray(data.mtn)) {
      throw new Error(data?.error || 'Invalid bundles response');
    }
    return data;
  },

  async updateBundles(bundles) {
    const res = await fetch(`${API_URL}/api/admin/bundles`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ bundles }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to update bundles');
    return data;
  },

  async verifyAdminPin(pin) {
    const body = { pin: String(pin ?? '').trim() };
    const res = await fetch(`${API_URL}/api/admin/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) throw new Error('Admin PIN not available. Is the backend running?');
      throw new Error(data.error || 'Invalid PIN');
    }
    return data;
  },

  async getAdminStats() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/admin/stats`), { headers: adminHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to load admin stats');
    return data;
  },

  async getAdminUsers() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/admin/users`), { headers: adminHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => ([]));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to load users');
    return Array.isArray(data) ? data : [];
  },

  async updateUserRole(userId, role) {
    const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to update role');
    return data;
  },

  async deleteAdminUser(userId) {
    const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to delete user');
    return data;
  },

  async getAdminOrders() {
    const parseList = (data) => {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.orders)) return data.orders;
      if (data && Array.isArray(data.data)) return data.data;
      return [];
    };
    let res = await fetch(withNoStoreTs(`${API_URL}/api/admin/orders`), { headers: adminHeaders(), cache: 'no-store' });
    let data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    res = await fetch(withNoStoreTs(`${API_URL}/api/orders`), { headers: adminHeaders(), cache: 'no-store' });
    data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    throw new Error(data.error || 'Failed to load orders. Ensure the API exposes GET /api/admin/orders or returns all orders for admins on GET /api/orders.');
  },

  async updateAdminOrderStatus(orderId, status) {
    const res = await fetch(`${API_URL}/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to update order status');
    return data;
  },

  async getAdminTransactions() {
    const parseList = (data) => {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.transactions)) return data.transactions;
      if (data && Array.isArray(data.data)) return data.data;
      if (data && Array.isArray(data.rows)) return data.rows;
      return [];
    };
    let res = await fetch(withNoStoreTs(`${API_URL}/api/admin/transactions`), { headers: adminHeaders(), cache: 'no-store' });
    let data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    res = await fetch(withNoStoreTs(`${API_URL}/api/admin/wallet/transactions`), { headers: adminHeaders(), cache: 'no-store' });
    data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    res = await fetch(withNoStoreTs(`${API_URL}/api/transactions`), { headers: adminHeaders(), cache: 'no-store' });
    data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    throw new Error(
      data.error ||
        'Failed to load wallet transactions. Add GET /api/admin/transactions (or /api/admin/wallet/transactions) that returns an array or { transactions: [...] }.'
    );
  },

  async getAdminWallets() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/admin/wallets`), { headers: adminHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to load wallets');
    return Array.isArray(data) ? data : [];
  },

  async getAgentApplications() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/admin/agent-applications`), { headers: adminHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to load agent applications');
    return Array.isArray(data) ? data : [];
  },

  async patchAgentApplication(id, { status }) {
    const res = await fetch(`${API_URL}/api/admin/agent-applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Update failed');
    return data;
  },

  async adminWalletCredit(userId, amount) {
    const res = await fetch(`${API_URL}/api/admin/wallets/${encodeURIComponent(userId)}/credit`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ amount: parseFloat(amount) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Credit failed');
    return data;
  },

  async adminWalletDebit(userId, amount) {
    const res = await fetch(`${API_URL}/api/admin/wallets/${encodeURIComponent(userId)}/debit`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ amount: parseFloat(amount) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Debit failed');
    return data;
  },

  async getSettings() {
    const res = await fetch(`${API_URL}/api/settings`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load settings');
    return data;
  },

  async updateAdminSettings({ sidebarLogoUrl }) {
    const res = await fetch(`${API_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ sidebarLogoUrl: sidebarLogoUrl ?? undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.status === 413) throw new Error('Image too large. Try a smaller image or use a URL instead.');
    if (!res.ok) throw new Error(data.error || 'Failed to update settings');
    return data;
  },

  /** Active image+caption promos for all site visitors (no auth). */
  async getBroadcasts() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/broadcasts`), { cache: 'no-store' });
    const data = await res.json().catch(() => []);
    if (!res.ok) return [];
    const list = Array.isArray(data) ? data : [];
    return list.map(normalizeBroadcastRow);
  },

  async getAdminBroadcasts() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/admin/broadcasts`), { headers: adminHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => ([]));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to load broadcasts');
    const list = Array.isArray(data) ? data : [];
    return list.map(normalizeBroadcastRow);
  },

  async createAdminBroadcast(payload) {
    const body =
      payload && typeof payload === 'object'
        ? {
            ...payload,
            caption: packBroadcastCaption(payload.title, payload.caption),
          }
        : payload;
    const res = await fetch(`${API_URL}/api/admin/broadcasts`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to publish broadcast');
    return normalizeBroadcastRow(data);
  },

  async updateAdminBroadcast(id, payload) {
    const p = payload && typeof payload === 'object' ? { ...payload } : payload;
    if (p && typeof p === 'object' && ('caption' in p || 'title' in p)) {
      p.caption = packBroadcastCaption(p.title ?? '', p.caption ?? '');
    }
    const res = await fetch(`${API_URL}/api/admin/broadcasts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify(p),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to update');
    return normalizeBroadcastRow(data);
  },

  async deleteAdminBroadcast(id) {
    const res = await fetch(`${API_URL}/api/admin/broadcasts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to delete');
    return data;
  },

  async getSupportStatus() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/support/status`), { headers: headers(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw supportFetchError(res, data, 'Failed to load support status');
    return data;
  },

  async getSupportThread() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/support/thread`), { headers: headers(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw supportFetchError(res, data, 'Failed to load chat');
    const messages = normalizeSupportThreadMessages(Array.isArray(data.messages) ? data.messages : []);
    return { ...data, messages, adminTyping: data.adminTyping === true };
  },

  async postSupportRead() {
    const res = await fetch(`${API_URL}/api/support/read`, { method: 'POST', headers: headers(), body: '{}' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw supportFetchError(res, data, 'Failed');
    return data;
  },

  async postSupportTyping(typing) {
    const res = await fetch(`${API_URL}/api/support/typing`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ typing: !!typing }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw supportFetchError(res, data, 'Failed');
    return data;
  },

  async postAdminSupportTyping(userId, typing) {
    const res = await fetch(`${API_URL}/api/admin/support/typing`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ userId, typing: !!typing }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw supportFetchError(res, data, 'Failed');
    return data;
  },

  async postSupportMessage({ text, requestHuman, image, replyToMessageId, replyToPreview, replyToRole, signal } = {}) {
    const res = await fetch(`${API_URL}/api/support/messages`, {
      method: 'POST',
      headers: headers(),
      signal,
      body: JSON.stringify({
        text: text ?? '',
        requestHuman: !!requestHuman,
        ...(image ? { image: String(image) } : {}),
        ...(replyToMessageId
          ? {
              replyToMessageId: String(replyToMessageId),
              replyToPreview: String(replyToPreview ?? '').slice(0, 300),
              ...(replyToRole ? { replyToRole: String(replyToRole) } : {}),
            }
          : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw supportFetchError(res, data, 'Failed to send message');
    return data;
  },

  async patchSupportMessage({ messageId, text, image, removeImage, signal } = {}) {
    const body = { messageId: String(messageId || '') };
    if (typeof text === 'string') body.text = text;
    if (image) body.image = String(image);
    if (removeImage) body.removeImage = true;
    const res = await fetch(`${API_URL}/api/support/messages`, {
      method: 'PATCH',
      headers: headers(),
      signal,
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw supportFetchError(res, data, 'Failed to update message');
    return data;
  },

  async deleteSupportMessage(messageId) {
    const res = await fetch(`${API_URL}/api/support/messages`, {
      method: 'DELETE',
      headers: headers(),
      body: JSON.stringify({ messageId: String(messageId || '') }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw supportFetchError(res, data, 'Failed to delete message');
    return data;
  },

  async getAdminSupportInbox() {
    const res = await fetch(withNoStoreTs(`${API_URL}/api/admin/support/inbox`), { headers: adminHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw supportFetchError(res, data, 'Failed to load support inbox');
    if (!Array.isArray(data)) return [];
    return data.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const pa = row.profileAvatar ?? row.profile_avatar ?? '';
      const s = typeof pa === 'string' ? pa.trim() : '';
      return { ...row, profileAvatar: s };
    });
  },

  async getAdminSupportThread(userId) {
    const res = await fetch(
      withNoStoreTs(`${API_URL}/api/admin/support/thread/${encodeURIComponent(userId)}`),
      { headers: adminHeaders(), cache: 'no-store' }
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw supportFetchError(res, data, 'Failed to load conversation');
    const pa = data.profileAvatar ?? data.profile_avatar ?? '';
    const s = typeof pa === 'string' ? pa.trim() : '';
    const messages = normalizeSupportThreadMessages(Array.isArray(data.messages) ? data.messages : []);
    return { ...data, messages, profileAvatar: s, userTyping: data.userTyping === true };
  },

  async postAdminSupportAutoClear(userId, { cancel, minutes, seconds, durationSeconds } = {}) {
    let body;
    if (cancel === true) {
      body = { cancel: true };
    } else if (durationSeconds != null && String(durationSeconds).trim() !== '') {
      body = { durationSeconds: Number(durationSeconds) };
    } else if (
      (minutes != null && minutes !== '') ||
      (seconds != null && seconds !== '')
    ) {
      body = {
        minutes: minutes != null && minutes !== '' ? Number(minutes) : 0,
        seconds: seconds != null && seconds !== '' ? Number(seconds) : 0,
      };
    } else if (minutes != null && Number.isFinite(Number(minutes))) {
      body = { minutes: Number(minutes) };
    } else {
      body = {};
    }
    const res = await fetch(
      `${API_URL}/api/admin/support/thread/${encodeURIComponent(userId)}/auto-clear`,
      { method: 'POST', headers: adminHeaders(), body: JSON.stringify(body) }
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw supportFetchError(res, data, 'Failed to set auto-clear');
    const pa = data.profileAvatar ?? data.profile_avatar ?? '';
    const s = typeof pa === 'string' ? pa.trim() : '';
    return { ...data, profileAvatar: s, userTyping: data.userTyping === true };
  },

  async postAdminSupportReply(userId, text, image, replyToMessageId, replyMeta = null) {
    const rid =
      replyToMessageId != null && String(replyToMessageId).trim() !== ''
        ? String(replyToMessageId).trim()
        : '';
    const res = await fetch(`${API_URL}/api/admin/support/reply`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        userId,
        text: text ?? '',
        ...(image ? { image: String(image) } : {}),
        ...(rid
          ? {
              replyToMessageId: rid,
              replyToPreview: String(
                replyMeta && typeof replyMeta === 'object' ? replyMeta.preview ?? '' : '',
              ).slice(0, 300),
              ...(replyMeta?.role ? { replyToRole: String(replyMeta.role) } : {}),
            }
          : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw supportFetchError(res, data, 'Failed to send reply');
    return data;
  },

  async patchAdminSupportMessage(userId, { messageId, text, image, removeImage }) {
    const body = {
      userId: String(userId || ''),
      messageId: String(messageId || ''),
    };
    if (typeof text === 'string') body.text = text;
    if (image) body.image = String(image);
    if (removeImage) body.removeImage = true;
    const res = await fetch(`${API_URL}/api/admin/support/messages`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw supportFetchError(res, data, 'Failed to update message');
    return data;
  },

  async deleteAdminSupportMessage(userId, messageId) {
    const res = await fetch(`${API_URL}/api/admin/support/messages`, {
      method: 'DELETE',
      headers: adminHeaders(),
      body: JSON.stringify({
        userId: String(userId || ''),
        messageId: String(messageId || ''),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw supportFetchError(res, data, 'Failed to delete message');
    return data;
  },
};
