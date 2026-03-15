const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' && window.location?.hostname !== 'localhost'
    ? 'https://ok.ultraxas.com'
    : 'http://localhost:3001');

function getToken() {
  return localStorage.getItem('dataplus_token');
}

function setToken(token) {
  if (token) localStorage.setItem('dataplus_token', token);
  else localStorage.removeItem('dataplus_token');
}

function headers() {
  const t = getToken();
  return {
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

export const api = {
  getUrl: () => API_URL,
  getToken,
  setToken,

  async register({ email, password, fullName }) {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, fullName: (fullName || '').trim() }),
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

  async getTransactions() {
    const res = await fetch(`${API_URL}/api/wallet/transactions`, { headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load transactions');
    return data;
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
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Order failed');
    return data;
  },

  async getBundles() {
    const res = await fetch(`${API_URL}/api/bundles`);
    const data = await res.json().catch(() => ([]));
    return Array.isArray(data) ? data : [];
  },
};
