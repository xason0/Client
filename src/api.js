/** Local dev default when hostname is localhost (override with VITE_API_URL in .env.local). */
const LOCAL_DEV_API_DEFAULT = 'http://87.106.69.120:3001';

/**
 * VITE_API_URL — set in the host (Vercel/Netlify/VPS build) when the API is on another origin.
 * VITE_PAYSTACK_PUBLIC_KEY — must be present at `npm run build` or Paystack checkout is disabled in the bundle.
 * Server JWT_SECRET must not change between deploys or every user must sign in again.
 */
const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location?.hostname !== 'localhost'
    ? 'https://ok.ultraxas.com'
    : LOCAL_DEV_API_DEFAULT);

const ADMIN_TOKEN_KEY = 'dataplus_admin_token';

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
      headers: headers(),
      body: JSON.stringify({ fullName: fullName ?? undefined, email: email ?? undefined, phone: phone ?? undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update profile');
    return data;
  },

  async changePassword({ currentPassword, newPassword }) {
    const res = await fetch(`${API_URL}/api/profile/password`, {
      method: 'PUT',
      headers: headers(),
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
    const res = await fetch(`${API_URL}/api/admin/stats`, { headers: adminHeaders() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to load admin stats');
    return data;
  },

  async getAdminUsers() {
    const res = await fetch(`${API_URL}/api/admin/users`, { headers: adminHeaders() });
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

  async getAdminOrders() {
    const parseList = (data) => {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.orders)) return data.orders;
      if (data && Array.isArray(data.data)) return data.data;
      return [];
    };
    let res = await fetch(`${API_URL}/api/admin/orders`, { headers: adminHeaders() });
    let data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    res = await fetch(`${API_URL}/api/orders`, { headers: adminHeaders() });
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
    let res = await fetch(`${API_URL}/api/admin/transactions`, { headers: adminHeaders() });
    let data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    res = await fetch(`${API_URL}/api/admin/wallet/transactions`, { headers: adminHeaders() });
    data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    res = await fetch(`${API_URL}/api/transactions`, { headers: adminHeaders() });
    data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (res.ok) return parseList(data);

    throw new Error(
      data.error ||
        'Failed to load wallet transactions. Add GET /api/admin/transactions (or /api/admin/wallet/transactions) that returns an array or { transactions: [...] }.'
    );
  },

  async getAdminWallets() {
    const res = await fetch(`${API_URL}/api/admin/wallets`, { headers: adminHeaders() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error(data.error || 'Admin access required');
    if (!res.ok) throw new Error(data.error || 'Failed to load wallets');
    return Array.isArray(data) ? data : [];
  },

  async getAgentApplications() {
    const res = await fetch(`${API_URL}/api/admin/agent-applications`, { headers: adminHeaders() });
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
};
