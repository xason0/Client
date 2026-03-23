import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from './api';
import UltraxasChatBar from './components/UltraxasChatBar';

/** Must match server `MIN_WALLET_TOPUP_GHS` / `WALLET_MIN_TOPUP_GHS`. */
const MIN_WALLET_TOPUP_GHS = 1;
const DASHBOARD_HEADLINES = [
  'Welcome to DataPlus',
  'Powering Smart Business Connectivity',
  'Fast. Trusted. Professional.',
  'Advert-Ready Digital Service',
];

function getTheme() {
  if (typeof window === 'undefined') return 'light';
  const s = localStorage.getItem('theme');
  if (s === 'dark' || s === 'light') return s;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (_) {
    return window.__INITIAL_THEME__ || 'light';
  }
}

export default function App({ adminRoute: adminRouteProp = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const adminRoute = adminRouteProp || (typeof location?.pathname === 'string' && location.pathname === '/admin');
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && window.__INITIAL_THEME__) || getTheme());
  const [token, setToken] = useState(() => (typeof window !== 'undefined' ? api.getToken() : null));
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(!!token);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState(() => (typeof window !== 'undefined' && window.location.pathname === '/admin' && api.getAdminToken()) ? 'admin-analytics' : 'dashboard');
  const [activeTab, setActiveTab] = useState('mtn');
  const [scrolled, setScrolled] = useState(false);
  const [currentPage, setCurrentPage] = useState(() => (typeof window !== 'undefined' && window.location.pathname === '/admin' && api.getAdminToken()) ? 'admin-analytics' : 'dashboard');
  const [profileImage, setProfileImage] = useState(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [buyBundle, setBuyBundle] = useState(null);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [recipientError, setRecipientError] = useState(null);
  const [bulkOrderInput, setBulkOrderInput] = useState('');
  const [bulkOrderError, setBulkOrderError] = useState(null);
  const [bulkOrderSuccess, setBulkOrderSuccess] = useState(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [topUpError, setTopUpError] = useState(null);
  const [topUpSuccess, setTopUpSuccess] = useState(null);
  const [topUpBusy, setTopUpBusy] = useState(false);
  /** Falls back to GET /api/public/config when VITE_PAYSTACK_PUBLIC_KEY was not baked into the build */
  const [paystackPublicKey, setPaystackPublicKey] = useState(() => import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '');
  const [paystackConfigLoading, setPaystackConfigLoading] = useState(() => !import.meta.env.VITE_PAYSTACK_PUBLIC_KEY);
  const [cartPosition, setCartPosition] = useState(() => {
    if (typeof window === 'undefined') return { x: 24, y: 80 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { x: Math.max(16, (w - 320) / 2), y: Math.max(16, (h - 400) / 2) };
  });
  const cartDragRef = useRef({ startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const [cartButtonPosition, setCartButtonPosition] = useState(null);
  const cartButtonRef = useRef(null);
  const cartButtonDragRef = useRef({ didMove: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });
  const fileInputRef = useRef(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileEditFullName, setProfileEditFullName] = useState('');
  const [profileEditEmail, setProfileEditEmail] = useState('');
  const [profileEditPhone, setProfileEditPhone] = useState('');
  const [profileEditError, setProfileEditError] = useState(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderHistorySearch, setOrderHistorySearch] = useState('');
  const [orderDateFilter, setOrderDateFilter] = useState('Today');
  const [orderCustomStart, setOrderCustomStart] = useState('');
  const [orderCustomEnd, setOrderCustomEnd] = useState('');
  const [orders, setOrders] = useState([]);
  const orderCreatedAtByIdRef = useRef(new Map());
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [transactionDateFilter, setTransactionDateFilter] = useState('Today');
  const [transactionCustomStart, setTransactionCustomStart] = useState('');
  const [transactionCustomEnd, setTransactionCustomEnd] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('All Types');
  const [transactionStatusFilter, setTransactionStatusFilter] = useState('All Status');
  const [transactionSearch, setTransactionSearch] = useState('');
  const [adminStats, setAdminStats] = useState(null);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);
  const [adminStatsError, setAdminStatsError] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUsersSearch, setAdminUsersSearch] = useState('');
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminRoleUpdating, setAdminRoleUpdating] = useState(null);
  const [adminOrders, setAdminOrders] = useState([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const [adminOrdersError, setAdminOrdersError] = useState(null);
  const [adminOrdersSearch, setAdminOrdersSearch] = useState('');
  const [adminOrderStatusUpdating, setAdminOrderStatusUpdating] = useState(null);
  const [adminAllTransactions, setAdminAllTransactions] = useState([]);
  const [adminAllTxLoading, setAdminAllTxLoading] = useState(false);
  const [adminAllTxError, setAdminAllTxError] = useState(null);
  const [adminAllTxSearch, setAdminAllTxSearch] = useState('');
  const [adminWallets, setAdminWallets] = useState([]);
  const [adminWalletsLoading, setAdminWalletsLoading] = useState(false);
  const [adminWalletsError, setAdminWalletsError] = useState(null);
  const [adminWalletsSearch, setAdminWalletsSearch] = useState('');
  const [adminTotalWalletBalance, setAdminTotalWalletBalance] = useState(0);
  const [dashboardHeadlineIndex, setDashboardHeadlineIndex] = useState(0);
  const [dashboardHeadlineVisible, setDashboardHeadlineVisible] = useState(true);
  const [agentApplications, setAgentApplications] = useState([]);
  const [agentApplicationsLoading, setAgentApplicationsLoading] = useState(false);
  const [agentApplicationsError, setAgentApplicationsError] = useState(null);
  const [agentApplicationsSearch, setAgentApplicationsSearch] = useState('');
  const [afaApplications, setAfaApplications] = useState([]);
  const [afaApplicationsLoading, setAfaApplicationsLoading] = useState(false);
  const [afaModalOpen, setAfaModalOpen] = useState(false);
  const [afaSubmitting, setAfaSubmitting] = useState(false);
  const [afaError, setAfaError] = useState(null);
  const [afaSuccess, setAfaSuccess] = useState(null);
  const [afaForm, setAfaForm] = useState({
    full_name: '',
    phone: '',
    ghana_card_number: '',
    occupation: '',
    date_of_birth: '',
  });
  const [agentAppReview, setAgentAppReview] = useState(null);
  const [agentAppReviewSaving, setAgentAppReviewSaving] = useState(false);
  const [agentAppReviewError, setAgentAppReviewError] = useState(null);
  const [walletAdjust, setWalletAdjust] = useState(null);
  const [walletAdjustAmount, setWalletAdjustAmount] = useState('');
  const [walletAdjustSaving, setWalletAdjustSaving] = useState(false);
  const [walletAdjustError, setWalletAdjustError] = useState(null);
  const [recentUsersExpanded, setRecentUsersExpanded] = useState(false);
  const [adminPinVerified, setAdminPinVerified] = useState(() => !!api.getAdminToken());
  const [appSettings, setAppSettings] = useState({ sidebarLogoUrl: 'https://files.catbox.moe/l3islw.jpg' });
  const [bundlesData, setBundlesData] = useState(null);
  const [adminSettingsSaving, setAdminSettingsSaving] = useState(false);
  const [adminSettingsMessage, setAdminSettingsMessage] = useState(null);
  const [adminBundlesSaving, setAdminBundlesSaving] = useState(false);
  const [adminBundlesMessage, setAdminBundlesMessage] = useState(null);
  const [adminPackagesNetwork, setAdminPackagesNetwork] = useState('mtn');
  const [editingBundle, setEditingBundle] = useState(null);
  const [editBundleForm, setEditBundleForm] = useState({ size: '', price: 0 });
  const [ultraxasChatInput, setUltraxasChatInput] = useState('');
  const [ultraxasChatSending, setUltraxasChatSending] = useState(false);
  const [ultraxasChatMessages, setUltraxasChatMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Welcome to ULTRAXAS MODE chat. Ask about orders, bundles, wallets, or admin actions.',
    },
  ]);
  const ultraxasFileInputRef = useRef(null);
  const [headerShowWelcome, setHeaderShowWelcome] = useState(true);
  const adminLogoInputRef = useRef(null);
  const headerWelcomeEnteredAtRef = useRef(null);
  const headerBrandTimeoutRef = useRef(null);
  const mountedRef = useRef(true);
  const hasAdminRole = (user?.role || '').toLowerCase() === 'admin';
  /** Sidebar admin links + logo upload — only when URL is /admin */
  const showAdminNav = adminRoute && (adminPinVerified || (isSignedIn && hasAdminRole));
  /** Catalog / bundle edit controls — admins use customer UI on /, tools on /admin */
  const adminStoreTools = adminRoute && (hasAdminRole || adminPinVerified);
  const adminDisplayName = (raw) => {
    const name = (raw ?? '').toString().trim();
    if (name.toLowerCase() === 'xason') return 'Gyamfi Bless';
    return name || 'Gyamfi Bless';
  };
  const brandLogoUrl = appSettings?.sidebarLogoUrl || 'https://files.catbox.moe/l3islw.jpg';
  const adminAvatarSrc = adminRoute && (hasAdminRole || adminPinVerified) ? brandLogoUrl : profileImage;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    api.getSettings().then((s) => setAppSettings((prev) => ({ ...prev, ...s }))).catch(() => {});
  }, []);

  useEffect(() => {
    api.getBundles().then((b) => setBundlesData(b)).catch(() => {});
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY) return;
    let cancelled = false;
    api
      .getPublicConfig()
      .then((c) => {
        if (!cancelled && c?.paystackPublicKey) setPaystackPublicKey(String(c.paystackPublicKey).trim());
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPaystackConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** After Paystack redirect, URL contains ?reference=… — verify and credit wallet */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get('reference') || params.get('trxref') || '').trim();
    if (!ref || !api.getToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.verifyPaystackWalletTopUp(ref);
        if (cancelled) return;
        setWalletBalance(r.balance);
        setTopUpSuccess('Payment successful. Your wallet balance has been updated.');
        setTopUpError(null);
        setCurrentPage('topup');
        const list = await api.getTransactions();
        if (!cancelled) setTransactions(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) {
          setTopUpError(e?.message || 'Could not verify payment');
          setCurrentPage('topup');
        }
      } finally {
        if (!cancelled && typeof window !== 'undefined') {
          const path = window.location.pathname || '/';
          window.history.replaceState({}, '', path + (window.location.hash || ''));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Switch header from welcome back to brand name after 10 seconds. Do NOT clear the timeout in cleanup when effect re-runs (e.g. auth state) so the timer keeps running.
  useEffect(() => {
    const hasMainApp = isSignedIn || (adminRoute && adminPinVerified);

    if (!hasMainApp) {
      headerWelcomeEnteredAtRef.current = null;
      if (headerBrandTimeoutRef.current) {
        clearTimeout(headerBrandTimeoutRef.current);
        headerBrandTimeoutRef.current = null;
      }
      return;
    }

    const justEntered = headerWelcomeEnteredAtRef.current === null;
    if (justEntered) {
      headerWelcomeEnteredAtRef.current = Date.now();
      setHeaderShowWelcome(true);
      headerBrandTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setHeaderShowWelcome(false);
        headerBrandTimeoutRef.current = null;
      }, 10 * 1000);
    }
    // Intentionally no cleanup: when effect re-runs (e.g. isSignedIn updates), we keep the existing timeout so it can fire after 3 min. Timeout is cleared only when hasMainApp becomes false above.
  }, [isSignedIn, adminRoute, adminPinVerified]);

  const clearSession = () => {
    api.setToken(null);
    api.clearAdminToken();
    setToken(null);
    setIsSignedIn(false);
    setAdminPinVerified(false);
    setUser(null);
    setWalletBalance(0);
    setCurrentPage('dashboard');
    setSelectedMenu('dashboard');
    setProfileOpen(false);
    setSidebarOpen(false);
    orderCreatedAtByIdRef.current = new Map();
    localStorage.removeItem('dataplus_signed_in');
  };

  const parseTimestampMs = (value) => {
    if (value === null || value === undefined || value === '') return NaN;
    if (value instanceof Date) {
      const ms = value.getTime();
      return Number.isFinite(ms) ? ms : NaN;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return NaN;
      return value < 1e12 ? value * 1000 : value;
    }
    const raw = String(value).trim();
    if (!raw) return NaN;
    if (/^\d{10,16}$/.test(raw)) {
      const asNum = Number(raw);
      if (Number.isFinite(asNum)) {
        if (raw.length <= 10) return asNum * 1000;
        if (raw.length === 13) return asNum;
        if (raw.length > 13) return Math.floor(asNum / (10 ** (raw.length - 13)));
      }
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const parseTimestampFromText = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return NaN;
    const matches = raw.match(/\d{10,16}/g) || [];
    for (const token of matches) {
      const ms = parseTimestampMs(token);
      if (!Number.isFinite(ms)) continue;
      if (ms < Date.parse('2019-01-01T00:00:00.000Z')) continue;
      if (ms > Date.now() + 7 * 86400000) continue;
      return ms;
    }
    return NaN;
  };

  const getOrderCreatedAtIso = (order) => {
    if (!order || typeof order !== 'object') return null;
    const candidates = [
      order.created_at,
      order.createdAt,
      order.date,
      order.ordered_at,
      order.order_date,
      order.timestamp,
    ];
    for (const value of candidates) {
      const ms = parseTimestampMs(value);
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
    const referenceCandidates = [
      order.reference,
      order.payment_reference,
      order.paystack_reference,
      order.transaction_reference,
      order.ref,
      order.order_ref,
    ];
    for (const value of referenceCandidates) {
      const ms = parseTimestampFromText(value);
      if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
    return null;
  };

  const stabilizeOrdersList = (list) => {
    if (!Array.isArray(list)) return [];
    return list.map((order) => {
      if (!order || typeof order !== 'object') return order;
      const id = order.id ?? order.order_id ?? order.orderId;
      if (id === undefined || id === null) return order;
      const key = String(id);
      const normalizedCreatedAt = getOrderCreatedAtIso(order);
      const cached = orderCreatedAtByIdRef.current.get(key) ?? null;
      if (normalizedCreatedAt) {
        if (!cached) orderCreatedAtByIdRef.current.set(key, normalizedCreatedAt);
        return { ...order, created_at: cached || normalizedCreatedAt };
      }
      if (cached) return { ...order, created_at: cached };
      // Some upstream order rows do not include any timestamp field.
      // Keep a stable first-seen fallback so UI never shows moving/dash time.
      const firstSeenCreatedAt = new Date().toISOString();
      orderCreatedAtByIdRef.current.set(key, firstSeenCreatedAt);
      return { ...order, created_at: firstSeenCreatedAt };
    });
  };

  const fetchWallet = () => {
    if (!api.getToken()) return;
    api.getWallet()
      .then((d) => setWalletBalance(d.balance))
      .catch((e) => {
        if (/unauthorized|expired|401/i.test(String(e?.message || ''))) clearSession();
      });
  };

  const sendUltraxasChatMessage = async () => {
    const text = ultraxasChatInput.trim();
    if (!text || ultraxasChatSending) return;
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text };
    setUltraxasChatMessages((prev) => [...prev, userMsg]);
    setUltraxasChatInput('');
    setUltraxasChatSending(true);
    try {
      // Keep the same chatbox experience in ULTRAXAS MODE even without an AI endpoint in this app.
      await new Promise((r) => setTimeout(r, 350));
      const lower = text.toLowerCase();
      let reply = 'Received. You can manage this in ULTRAXAS MODE from Orders, Data Packages, Wallet, and Users.';
      if (lower.includes('order')) reply = 'For orders, open Order Management to update status and track processing/completed rows.';
      else if (lower.includes('package') || lower.includes('bundle')) reply = 'For packages, use Data Packages. Edits there update what users see.';
      else if (lower.includes('wallet')) reply = 'For wallets, use Wallet Management to credit/debit and review balances.';
      else if (lower.includes('user')) reply = 'For users and roles, open User Management in the sidebar.';
      setUltraxasChatMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
    } finally {
      setUltraxasChatSending(false);
    }
  };
  const handleUltraxasUploadClick = () => {
    ultraxasFileInputRef.current?.click();
  };

  useEffect(() => {
    if (!token) {
      setIsSignedIn(false);
      setUser(null);
      setWalletBalance(0);
      return;
    }
    api.me()
      .then((u) => {
        // me() returns null on 401 — must not leave isSignedIn true with a dead token
        if (!u) {
          clearSession();
          return;
        }
        setUser(u);
        setIsSignedIn(true);
        if (u.profile_avatar) setProfileImage(u.profile_avatar);
        fetchWallet();
      })
      .catch(() => {
        clearSession();
      });
  }, [token]);

  useEffect(() => {
    if ((currentPage === 'topup' || currentPage === 'transactions' || currentPage === 'dashboard') && api.getToken()) {
      api.getTransactions()
        .then(setTransactions)
        .catch((e) => {
          if (/unauthorized|expired|401/i.test(String(e?.message || ''))) clearSession();
          setTransactions([]);
        });
    }
  }, [currentPage]);

  useEffect(() => {
    if ((currentPage === 'orders' || currentPage === 'dashboard') && api.getToken()) {
      setOrdersLoading(true);
      api.getOrders()
        .then((list) => setOrders(stabilizeOrdersList(list)))
        .catch(() => setOrders([]))
        .finally(() => setOrdersLoading(false));
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== 'dashboard') return undefined;
    let fadeTimer;
    const timer = setInterval(() => {
      setDashboardHeadlineVisible(false);
      fadeTimer = setTimeout(() => {
        setDashboardHeadlineIndex((prev) => (prev + 1) % DASHBOARD_HEADLINES.length);
        setDashboardHeadlineVisible(true);
      }, 220);
    }, 3200);
    return () => {
      clearInterval(timer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, [currentPage]);

  useEffect(() => {
    if (currentPage === 'afa-registration' && api.getToken()) {
      setAfaApplicationsLoading(true);
      api.getAfaApplications()
        .then((list) => setAfaApplications(Array.isArray(list) ? list : []))
        .catch(() => setAfaApplications([]))
        .finally(() => setAfaApplicationsLoading(false));
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== 'orders' || !api.getToken()) return undefined;
    const timer = setInterval(() => {
      api.getOrders()
        .then((list) => setOrders(stabilizeOrdersList(list)))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [currentPage, token]);

  useEffect(() => {
    const hasAdminAccess = adminPinVerified || (user?.role === 'admin' && api.getToken());
    if (currentPage === 'admin-analytics' && hasAdminAccess) {
      setAdminStatsLoading(true);
      setAdminStatsError(null);
      Promise.all([api.getAdminStats(), api.getAdminUsers(), api.getAdminWallets()])
        .then(([stats, users, wallets]) => {
          setAdminStats(stats);
          setAdminUsers(Array.isArray(users) ? users : []);
          const walletTotal = (Array.isArray(wallets) ? wallets : []).reduce((sum, w) => {
            const raw = w?.balance;
            const parsed = typeof raw === 'number' ? raw : parseFloat(raw);
            return sum + (Number.isFinite(parsed) ? parsed : 0);
          }, 0);
          setAdminTotalWalletBalance(walletTotal);
        })
        .catch((err) => {
          const msg = err?.message || 'Failed to load admin data';
          setAdminStatsError(msg);
          setAdminStats(null);
          setAdminUsers([]);
          setAdminTotalWalletBalance(0);
          const isTokenInvalid = /invalid|expired|token|unauthorized|401|403/i.test(msg);
          if (isTokenInvalid) {
            api.clearAdminToken();
            setAdminPinVerified(false);
          }
        })
        .finally(() => setAdminStatsLoading(false));
    } else if (currentPage === 'admin-users' && hasAdminAccess) {
      setAdminUsersLoading(true);
      api.getAdminUsers()
        .then((users) => setAdminUsers(Array.isArray(users) ? users : []))
        .catch(() => setAdminUsers([]))
        .finally(() => setAdminUsersLoading(false));
    } else if (currentPage === 'admin-orders' && hasAdminAccess) {
      setAdminOrdersLoading(true);
      setAdminOrdersError(null);
      setAgentApplicationsLoading(true);
      setAgentApplicationsError(null);
      Promise.all([api.getAdminOrders(), api.getAgentApplications()])
        .then(([ordersList, appList]) => {
          setAdminOrders(Array.isArray(ordersList) ? ordersList : []);
          setAgentApplications(Array.isArray(appList) ? appList : []);
        })
        .catch((err) => {
          const msg = err?.message || 'Failed to load admin order data';
          setAdminOrdersError(msg);
          setAgentApplicationsError(msg);
          setAdminOrders([]);
          setAgentApplications([]);
        })
        .finally(() => setAgentApplicationsLoading(false))
        .finally(() => setAdminOrdersLoading(false));
    } else if (currentPage === 'admin-packages' && hasAdminAccess) {
      api.getBundles()
        .then((b) => setBundlesData(b && typeof b === 'object' ? b : null))
        .catch(() => {});
    } else if (currentPage === 'admin-all-transactions' && hasAdminAccess) {
      setAdminAllTxLoading(true);
      setAdminAllTxError(null);
      api.getAdminTransactions()
        .then((list) => setAdminAllTransactions(Array.isArray(list) ? list : []))
        .catch((err) => {
          setAdminAllTxError(err?.message || 'Failed to load transactions');
          setAdminAllTransactions([]);
        })
        .finally(() => setAdminAllTxLoading(false));
    } else if (currentPage === 'admin-wallet' && hasAdminAccess) {
      setAdminWalletsLoading(true);
      setAdminWalletsError(null);
      api.getAdminWallets()
        .then((list) => setAdminWallets(Array.isArray(list) ? list : []))
        .catch((err) => {
          setAdminWalletsError(err?.message || 'Failed to load wallets');
          setAdminWallets([]);
        })
        .finally(() => setAdminWalletsLoading(false));
    } else if (currentPage === 'admin-applications' && hasAdminAccess) {
      setAgentApplicationsLoading(true);
      setAgentApplicationsError(null);
      api
        .getAgentApplications()
        .then((list) => setAgentApplications(Array.isArray(list) ? list : []))
        .catch((err) => {
          setAgentApplicationsError(err?.message || 'Failed to load applications');
          setAgentApplications([]);
        })
        .finally(() => setAgentApplicationsLoading(false));
    }
  }, [currentPage, user?.role, adminPinVerified]);

  const networkLabel = (n) => ({ mtn: 'MTN', telecel: 'Telecel', bigtime: 'AT BigTime', ishare: 'AT iShare' }[n] || 'MTN');
  const stableOrderCodeSuffix = (id, createdAt) => {
    const s = String(id ?? '');
    const hexish = s.replace(/[^0-9a-f]/gi, '');
    if (hexish.length >= 8) return hexish.slice(0, 8).toUpperCase();
    const seed = `${s}|${createdAt || ''}`;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16).padStart(8, '0').slice(0, 8).toUpperCase();
  };
  const formatOrderDisplayId = (order, fallbackCreatedAt) => {
    const rawOrd = (order?.order_number || order?.orderNumber || order?.order_id || '').toString().trim();
    if (rawOrd) return rawOrd.toUpperCase().startsWith('ORD-') ? rawOrd : `ORD-${rawOrd.replace(/^ORD-?/i, '')}`;
    const refRaw = (
      order?.reference ||
      order?.payment_reference ||
      order?.paystack_reference ||
      order?.transaction_reference ||
      ''
    ).toString();
    const seqMatch = refRaw.match(/(?:^|[-_])(\\d{1,9})(?:[-_]|$)/);
    if (seqMatch && seqMatch[1]) return `ORD-${seqMatch[1].padStart(6, '0')}`;
    const rawId = (order?.id ?? '').toString().trim();
    if (/^\d+$/.test(rawId)) return `ORD-${rawId.padStart(6, '0')}`;
    return `ORD-${stableOrderCodeSuffix(order?.id, fallbackCreatedAt || order?.created_at || order?.createdAt)}`;
  };
  const normalizeAdminOrderRow = (o) => {
    const netKey = o.network;
    const net = networkLabel(typeof netKey === 'string' && netKey.length <= 24 ? netKey.toLowerCase() : 'mtn');
    const bundle = (o.bundle_size || o.bundle || o.data_bundle || o.plan || '').toString().trim() || '—';
    const recipient = (
      o.recipient_number ||
      o.recipient_phone ||
      o.phone_number ||
      o.msisdn ||
      o.phone ||
      o.recipient ||
      ''
    ).toString();
    const orderIdDisplay = formatOrderDisplayId(o, o.created_at);
    const ref =
      o.reference ||
      o.payment_reference ||
      o.paystack_reference ||
      o.transaction_reference ||
      o.pay_ref ||
      (() => {
        const t = o.created_at ? Date.parse(o.created_at) : Date.now();
        const tail = String(o.id ?? '').replace(/\D/g, '').slice(-6) || String(Math.abs((t % 1e9) | 0)).padStart(6, '0');
        return `${t}${tail}`.replace(/\D/g, '').slice(0, 17);
      })();
    const customer =
      o.customer_name ||
      o.buyer_name ||
      o.full_name ||
      o.name ||
      o.user_full_name ||
      (o.user && (o.user.full_name || o.user.name || o.user.email)) ||
      'Unknown';
    const customerSub = (o.user_email || o.email || o.user?.email || '').toString().trim() || 'Unknown';
    const packageTitle = (o.package_title || o.bundle_label || o.plan_name || `${net} ${bundle}`).trim();
    const packageSub = (o.package_subtitle || `${bundle} • ${net} Ghana`).trim();
    const packageFull = `${packageTitle} — ${packageSub}`;
    const rawPrice = o.bundle_price ?? o.amount ?? o.price ?? o.total_amount ?? o.total ?? o.paid_amount;
    const numPrice = typeof rawPrice === 'number' ? rawPrice : parseFloat(rawPrice);
    const amount = Number.isFinite(numPrice) ? numPrice.toFixed(2) : String(rawPrice ?? '0');
    const st = (o.status && String(o.status).toLowerCase()) || 'processing';
    const statusLabel = st === 'completed' ? 'Completed' : st === 'failed' || st === 'cancelled' ? 'Failed' : 'Processing';
    return {
      id: o.id,
      key: String(o.id ?? ref),
      orderIdDisplay,
      reference: String(ref),
      customer,
      customerSub,
      packageTitle,
      packageSub,
      packageFull,
      recipient,
      amount,
      statusLabel,
      dateIso: o.created_at,
    };
  };
  const normalizeAdminTxRow = (t, idx) => {
    const rawId = t.id ?? t.transaction_id ?? `tx-${idx}`;
    const created = t.created_at ?? t.createdAt ?? t.date ?? null;
    const rawAmt = t.amount;
    const parsed = typeof rawAmt === 'number' ? rawAmt : parseFloat(rawAmt);
    const amount = Number.isFinite(parsed) ? parsed : 0;
    const typ = (t.type || '').toString().toLowerCase();
    const reference = (
      t.reference ||
      t.payment_reference ||
      t.paystack_reference ||
      t.transaction_reference ||
      ''
    ).toString();
    const userName = (t.user_name || t.full_name || t.user_full_name || t.user?.full_name || '').toString().trim();
    const userEmail = (t.user_email || t.email || t.user?.email || '').toString().trim();
    const userPhone = (t.user_phone || t.phone || t.user?.phone || '').toString().trim();
    const userLine =
      [userName, userEmail].filter(Boolean).join(' · ') ||
      userPhone ||
      (t.user_id != null ? `User #${t.user_id}` : '—');
    const narration =
      (t.description || t.narration || '').toString().trim() ||
      (reference || (typ === 'topup' ? 'Wallet top-up' : typ === 'payment' ? 'Bundle purchase' : typ || '—'));
    const st = (t.status && String(t.status).toLowerCase()) || 'completed';
    const statusLabel =
      st === 'completed' || st === 'success'
        ? 'Completed'
        : st === 'failed' || st === 'cancelled' || st === 'reversed'
          ? 'Failed'
          : st.charAt(0).toUpperCase() + st.slice(1);
    const time = created ? Date.parse(created) : 0;
    return {
      key: String(rawId),
      created_at: created,
      time,
      amount,
      type: typ,
      reference,
      userLine,
      narration,
      statusLabel,
    };
  };
  const userTodayStats = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const isToday = (value) => {
      const t = Date.parse(value || '');
      return Number.isFinite(t) && t >= startMs;
    };
    const todayOrders = (orders || []).filter((o) => isToday(o.created_at));
    const todaySpent = (transactions || []).reduce((sum, t) => {
      if (!isToday(t.created_at)) return sum;
      const rawAmount = t.amount ?? t.bundle_price ?? t.price ?? t.value;
      const parsed = typeof rawAmount === 'number' ? rawAmount : parseFloat(rawAmount);
      if (!Number.isFinite(parsed) || parsed >= 0) return sum;
      return sum + Math.abs(parsed);
    }, 0);
    const amount = todayOrders.reduce((sum, o) => {
      const p = typeof o.bundle_price === 'number' ? o.bundle_price : parseFloat(o.bundle_price);
      return sum + (Number.isFinite(p) ? p : 0);
    }, 0);
    const bundles = todayOrders.reduce((sum, o) => {
      const rawSize = String(o.bundle_size || o.bundle || o.data_bundle || '').trim();
      const match = rawSize.match(/(\d+(\.\d+)?)/);
      const parsed = match ? parseFloat(match[1]) : NaN;
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
    return {
      spent: todaySpent,
      orders: todayOrders.length,
      amount,
      bundles,
    };
  })();
  const isPinOnlyAdminSession = showAdminNav && !hasAdminRole;
  const dashboardBalance = isPinOnlyAdminSession ? 0 : walletBalance;
  const dashboardTodaySpent = isPinOnlyAdminSession ? 0 : userTodayStats.spent;
  const dashboardTodayOrders = isPinOnlyAdminSession ? 0 : userTodayStats.orders;
  const dashboardTodayAmount = isPinOnlyAdminSession ? 0 : userTodayStats.amount;
  const dashboardTodayBundles = isPinOnlyAdminSession ? 0 : userTodayStats.bundles;
  const networkBg = (n) => n === 'telecel' ? 'url(https://files.catbox.moe/yzcokj.jpg)' : (n === 'bigtime' || n === 'ishare') ? 'url(https://files.catbox.moe/riugtj.png)' : 'url(https://files.catbox.moe/r1m0uh.png)';

  const validGhanaPrefixes = ['020', '024', '026', '027', '054', '055', '059'];
  const isValidGhanaNumber = (digits) => digits.length === 10 && validGhanaPrefixes.some((p) => digits.startsWith(p));

  const addToCart = () => {
    if (!buyBundle) return;
    const digitsOnly = recipientNumber.replace(/\D/g, '');
    if (digitsOnly.length !== 10) {
      setRecipientError('Enter exactly 10 digits (numbers only). No country code, symbols or emojis.');
      return;
    }
    if (!isValidGhanaNumber(digitsOnly)) {
      setRecipientError('Use a valid Ghana mobile number (e.g. 024, 020, 054, 055, 059, 026, 027).');
      return;
    }
    setRecipientError(null);
    setCart((prev) => [...prev, { id: Date.now(), bundle: buyBundle, recipientNumber: digitsOnly }]);
    setBuyBundle(null);
    setRecipientNumber('');
  };

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const defaultBundlesForUse = {
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
  const mtnBundlesForBulk = (bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData.mtn : defaultBundlesForUse.mtn) || [];

  const validMtnCapacities = (mtnBundlesForBulk || []).map((b) => parseInt(b.size.replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const getMtnBundleByCapacity = (capacityNum) => {
    const b = (mtnBundlesForBulk || []).find((x) => x.size === `${capacityNum} GB`);
    if (!b) return null;
    const price = typeof b.price === 'number' ? b.price : parseFloat(b.price);
    return { size: b.size, price: Number.isFinite(price) ? price : 0, network: 'mtn' };
  };

  const parseBulkLines = () => {
    setBulkOrderError(null);
    setBulkOrderSuccess(null);
    const lines = bulkOrderInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      return { added: [], errors: ['Enter at least one line in the format: phone_number capacity (e.g. 0241234567 5)'] };
    }
    const added = [];
    const errors = [];
    lines.forEach((line, idx) => {
      const parts = line.split(/\s+/);
      if (parts.length < 2) {
        errors.push(`Line ${idx + 1}: need "phone_number capacity" (e.g. 0241234567 5)`);
        return;
      }
      const digitsOnly = parts[0].replace(/\D/g, '');
      const capacityNum = parseInt(parts[1], 10);
      if (digitsOnly.length !== 10) {
        errors.push(`Line ${idx + 1}: phone must be exactly 10 digits.`);
        return;
      }
      if (!isValidGhanaNumber(digitsOnly)) {
        errors.push(`Line ${idx + 1}: use a valid Ghana mobile number (e.g. 024, 020, 054).`);
        return;
      }
      if (!Number.isInteger(capacityNum) || !validMtnCapacities.includes(capacityNum)) {
        errors.push(`Line ${idx + 1}: capacity must be a valid MTN bundle size (e.g. 1, 2, 5, 10, 15, 20, 25, 30, 40, 50).`);
        return;
      }
      const bundle = getMtnBundleByCapacity(capacityNum);
      if (!bundle) {
        errors.push(`Line ${idx + 1}: no MTN bundle for ${capacityNum} GB.`);
        return;
      }
      added.push({ id: Date.now() + idx, bundle, recipientNumber: digitsOnly });
    });
    return { added, errors };
  };

  const processBulkOrders = () => {
    const { added, errors } = parseBulkLines();
    if (errors.length > 0) {
      const msg = errors.length > 10
        ? errors.slice(0, 10).join(' ') + ` ... and ${errors.length - 10} more.`
        : errors.join(' ');
      setBulkOrderError(msg);
      return;
    }
    const total = added.reduce((sum, i) => sum + Number(i.bundle?.price || 0), 0);
    setCart((prev) => [...prev, ...added]);
    setCartOpen(true);
    setBulkOrderInput('');
    setBulkOrderSuccess(`${added.length} order(s) queued separately (¢${total.toFixed(2)} total). Checkout to send to management.`);
  };

  const submitBulkOrdersNow = async () => {
    const { added, errors } = parseBulkLines();
    if (errors.length > 0) {
      const msg = errors.length > 10
        ? errors.slice(0, 10).join(' ') + ` ... and ${errors.length - 10} more.`
        : errors.join(' ');
      setBulkOrderError(msg);
      return;
    }
    const total = added.reduce((sum, i) => sum + Number(i.bundle?.price || 0), 0);
    if (walletBalance < total) {
      setBulkOrderError(`Insufficient balance. You have ¢ ${walletBalance.toFixed(2)} but bulk total is ¢ ${total.toFixed(2)}.`);
      return;
    }
    setBulkSubmitting(true);
    try {
      const data = await api.createOrders(added);
      setWalletBalance(Number(data?.balance ?? walletBalance));
      setBulkOrderInput('');
      setBulkOrderSuccess(`${added.length} bulk order(s) sent. They are now in admin management as separate lines.`);
      fetchWallet();
      api.getOrders().then((list) => setOrders(stabilizeOrdersList(list))).catch(() => {});
      if (adminPinVerified || user?.role === 'admin') {
        api.getAdminOrders().then((list) => setAdminOrders(Array.isArray(list) ? list : [])).catch(() => {});
      }
    } catch (err) {
      setBulkOrderError(err?.message || 'Failed to submit bulk orders');
    } finally {
      setBulkSubmitting(false);
    }
  };

  const clampCartPosition = (x, y) => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 400;
    const h = typeof window !== 'undefined' ? window.innerHeight : 600;
    const panelW = 320;
    const panelH = 400;
    return {
      x: Math.max(0, Math.min(w - panelW, x)),
      y: Math.max(0, Math.min(h - 120, y)),
    };
  };

  const handleCartDragStart = (e) => {
    if (e.target.closest('button')) return;
    if (e.cancelable) e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    cartDragRef.current = {
      startX: clientX,
      startY: clientY,
      startLeft: cartPosition.x,
      startTop: cartPosition.y,
    };
    const onMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { startX, startY, startLeft, startTop } = cartDragRef.current;
      setCartPosition(clampCartPosition(startLeft + cx - startX, startTop + cy - startY));
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const clampCartButtonPosition = (x, y) => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 400;
    const h = typeof window !== 'undefined' ? window.innerHeight : 600;
    const size = 56;
    return {
      x: Math.max(0, Math.min(w - size, x)),
      y: Math.max(0, Math.min(h - size, y)),
    };
  };

  const handleCartButtonDragStart = (e) => {
    if (e.cancelable) e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let startLeft = cartButtonPosition?.x;
    let startTop = cartButtonPosition?.y;
    if (startLeft == null || startTop == null) {
      const el = cartButtonRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        setCartButtonPosition({ x: startLeft, y: startTop });
      } else return;
    }
    cartButtonDragRef.current = { didMove: false, startX: clientX, startY: clientY, startLeft, startTop };
    const onMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const { startX, startY, startLeft: sl, startTop: st } = cartButtonDragRef.current;
      const dx = cx - startX;
      const dy = cy - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) cartButtonDragRef.current.didMove = true;
      setCartButtonPosition(clampCartButtonPosition(sl + dx, st + dy));
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const handleCartButtonClick = () => {
    if (cartButtonDragRef.current.didMove) {
      cartButtonDragRef.current.didMove = false;
      return;
    }
    setCartOpen(true);
  };

  useEffect(() => {
    const savedImage = localStorage.getItem('profileImage');
    if (savedImage) setProfileImage(savedImage);
  }, []);

  // After user is loaded from api.me(), prefer VPS avatar over localStorage
  useEffect(() => {
    if (user?.profile_avatar) setProfileImage(user.profile_avatar);
  }, [user?.profile_avatar]);

  // Apply theme before first paint and subscribe to system preference
  useLayoutEffect(() => {
    const resolved = getTheme();
    setTheme(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  // When system dark/light mode changes, always follow it and clear any manual override
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applySystemTheme = () => {
      const next = mq.matches ? 'dark' : 'light';
      localStorage.removeItem('theme');
      setTheme(next);
      document.documentElement.setAttribute('data-theme', next);
    };
    mq.addEventListener('change', applySystemTheme);
    return () => mq.removeEventListener('change', applySystemTheme);
  }, []);

  // When user returns to the tab, re-sync theme (in case system changed while tab was in background)
  useEffect(() => {
    const onVisible = () => {
      const resolved = getTheme();
      setTheme(resolved);
      document.documentElement.setAttribute('data-theme', resolved);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /* Allow copy/paste on login/register; disable in main app */
  useEffect(() => {
    if (isSignedIn) {
      document.documentElement.removeAttribute('data-auth-screen');
    } else {
      document.documentElement.setAttribute('data-auth-screen', 'true');
    }
  }, [isSignedIn]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Desktop: show sidebar by default and track viewport
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handle = () => {
      setIsDesktop(mq.matches);
      if (mq.matches) setSidebarOpen(true);
    };
    handle();
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  useEffect(() => {
    if (!adminRoute) return;
    if (adminPinVerified || (isSignedIn && user?.role === 'admin')) {
      const adminSubPages = ['admin', 'admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-analytics'];
      const mainAppPages = ['dashboard', 'bulk-orders', 'afa-registration', 'orders', 'transactions', 'join-us', 'profile', 'topup', 'pending-orders', 'completed-orders', 'my-orders'];
      if (adminSubPages.includes(currentPage)) return;
      if (mainAppPages.includes(currentPage)) return;
      setCurrentPage('admin-analytics');
      setSelectedMenu('admin-analytics');
    }
    // Do NOT redirect non-admin users away from /admin — they can still enter the admin PIN to get access.
  }, [adminRoute, adminPinVerified, isSignedIn, user?.role, navigate, currentPage]);

  /** Leaving /admin must drop admin-only pages from state; PIN sessions are not admin UI on `/`. */
  useEffect(() => {
    if (location.pathname === '/admin') return;
    const adminPages = ['admin', 'admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-analytics'];
    setCurrentPage((p) => (adminPages.includes(p) ? 'dashboard' : p));
    setSelectedMenu((m) => (adminPages.includes(m) ? 'dashboard' : m));
  }, [location.pathname]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const toggleProfile = () => setProfileOpen((prev) => !prev);
  const toggleOrders = () => setOrdersExpanded((prev) => !prev);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    setTheme(next);
  };

  const handleMenuSelect = (menu) => {
    setSelectedMenu(menu);
    if (menu === 'profile-page') {
      setCurrentPage('profile');
      setProfileOpen(false);
    } else if (menu === 'dashboard') {
      setCurrentPage('dashboard');
      setProfileOpen(false);
    } else if (menu === 'wallet' || menu === 'topup') {
      setCurrentPage('topup');
      setProfileOpen(false);
    } else if (menu === 'my-orders') {
      setCurrentPage('orders');
      setOrderStatusFilter('all');
      setProfileOpen(false);
    } else if (menu === 'pending-orders') {
      setCurrentPage('orders');
      setOrderStatusFilter('processing');
      setProfileOpen(false);
    } else if (menu === 'completed-orders') {
      setCurrentPage('orders');
      setOrderStatusFilter('completed');
      setProfileOpen(false);
    } else if (menu === 'bulk-orders') {
      setCurrentPage('bulk-orders');
      setProfileOpen(false);
    } else if (menu === 'afa-registration') {
      setCurrentPage('afa-registration');
      setProfileOpen(false);
    } else if (menu === 'transactions') {
      setCurrentPage('transactions');
      setProfileOpen(false);
    } else if (menu === 'join-us') {
      setCurrentPage('join-us');
      setProfileOpen(false);
    } else if (menu === 'admin') {
      navigate('/admin');
      setCurrentPage('admin');
      setProfileOpen(false);
    } else if (['admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-analytics'].includes(menu)) {
      navigate('/admin');
      setCurrentPage(menu);
      setSelectedMenu(menu);
      setProfileOpen(false);
      if (menu === 'admin-packages') setAdminPackagesNetwork('mtn');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result;
        setProfileImage(base64String);
        localStorage.setItem('profileImage', base64String);
        try {
          await api.uploadProfileImage(base64String);
        } catch (_) {
          // keep local state and localStorage; user still sees the pic
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const isDark = theme === 'dark';
  const profileUserId = (() => {
    const n = Number(user?.id);
    if (Number.isFinite(n) && n > 0) return `USR-${String(Math.trunc(n)).padStart(6, '0')}`;
    const seed = String(user?.email || 'guest').toLowerCase();
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    const code = Math.abs(hash) % 1000000;
    return `USR-${String(code).padStart(6, '0')}`;
  })();

  const defaultBundles = {
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
  const bundlesByNetwork = bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData : defaultBundles;
  const bundles = bundlesByNetwork.mtn || defaultBundles.mtn;
  const telecelBundles = bundlesByNetwork.telecel || defaultBundles.telecel;
  const bigtimeBundles = bundlesByNetwork.bigtime || defaultBundles.bigtime;
  const ishareBundles = bundlesByNetwork.ishare || defaultBundles.ishare;
  const displayBundles = activeTab === 'telecel' ? telecelBundles : activeTab === 'bigtime' ? bigtimeBundles : activeTab === 'ishare' ? ishareBundles : bundles;
  const isTelecel = activeTab === 'telecel';
  const isBigTime = activeTab === 'bigtime';
  const isIshare = activeTab === 'ishare';

  const MenuItem = ({ id, icon, label, hasSubmenu = false }) => {
    const isSelected = selectedMenu === id;
    return (
      <div
        className={`rounded-xl transition-all ${isSelected ? 'p-[2px]' : ''}`}
        style={
          isSelected
            ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)' }
            : {}
        }
      >
        <button
          onClick={() => handleMenuSelect(id)}
                className={`flex items-center gap-3 p-3 w-full rounded-xl transition-all duration-200 text-base border ${
            isSelected
              ? isDark
                ? 'bg-white/10 text-white border-white/20 shadow-[0_0_16px_rgba(255,255,255,0.08)]'
                : 'bg-slate-200 text-slate-900 border-slate-300'
              : isDark
                ? 'bg-white/5 hover:bg-white/10 text-white border-white/10 hover:border-white/20'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
                }`}
              >
                <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
              isSelected
                ? isDark
                  ? 'bg-white/15 border-white/20'
                  : 'bg-slate-300 border-slate-300'
                : isDark
                  ? 'bg-white/10 border-white/10'
                  : 'bg-slate-200 border-slate-200'
            }`}
          >
            {icon}
          </div>
          <span className="flex-1 text-left">{label}</span>
          {hasSubmenu && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={isDark ? '#ffffff' : '#000000'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${ordersExpanded ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </button>
      </div>
    );
  };

  const Svg = {
    Menu: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M15 21V9" />
      </svg>
    ),
    User: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    Sun: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
    Moon: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
    Close: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    ),
    Trash: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    ),
    Grid: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    Phone: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
    ChevronDown: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className} {...props}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    ),
    Clock: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    Message: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    WhatsApp: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={props.stroke || 'currentColor'} {...props}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.885-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    Wallet: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    Cart: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
    Shield: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    Home: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={props.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    Plus: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
    File: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" {...props}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
    Dollar: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" {...props}>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    Card: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" {...props}>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    LogOut: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
    Edit: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    Link: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
    Chart: (props) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  };

  const stroke = isDark ? '#ffffff' : '#000000';

  return (
    <div className={`h-full min-h-0 flex flex-col overflow-hidden transition-colors duration-300 ${isDark ? 'bg-black text-white' : 'bg-slate-50 text-slate-900'}`} style={{ minHeight: '100dvh' }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes pulse-ray {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
          50% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        .status-dot { animation: pulse-ray 2s infinite; }
        @keyframes gradient-flow {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .balance-card-live {
          background: linear-gradient(90deg, #8b5cf6, #d946ef, #06b6d4, #8b5cf6);
          background-size: 200% 100%;
          animation: gradient-flow 2.5s ease infinite;
        }
      `}</style>

      {adminRoute && !adminPinVerified && !(isSignedIn && user?.role === 'admin') ? (
        <div className="flex-1 flex flex-col w-full min-h-full items-center justify-center p-6" style={{ minHeight: '100dvh' }}>
          <AdminPinPage
            isDark={isDark}
            onVerified={(adminToken) => {
              if (adminToken) {
                api.setToken(adminToken);
                setToken(adminToken);
              }
              setAdminPinVerified(true);
              setCurrentPage('admin-analytics');
              setSelectedMenu('admin-analytics');
            }}
            appSettings={appSettings}
          />
        </div>
      ) : !isSignedIn && !adminPinVerified ? (
        <div className="flex-1 flex flex-col w-full min-h-full">
          <SignInPage
            isDark={isDark}
            appSettings={appSettings}
            onSignIn={(result) => {
              api.setToken(result.token);
              setToken(result.token);
              setUser(result.user);
              setIsSignedIn(true);
              localStorage.setItem('dataplus_signed_in', 'true');
              fetchWallet();
            }}
          />
        </div>
      ) : (
        <>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

      {(sidebarOpen || profileOpen) && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:hidden flex items-start justify-start p-4"
            onClick={() => {
              setSidebarOpen(false);
              setProfileOpen(false);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSidebarOpen(false); setProfileOpen(false); } }}
            aria-label="Close menu"
          >
            <span className="rounded-full bg-white/20 p-2 text-white pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
              </svg>
            </span>
          </div>
      )}

      {/* Layout: on mobile = full-width main + overlay sidebar; on md+ = sidebar | main (flex row, main fills rest) */}
      <div className="flex-1 flex min-h-0 flex-col md:flex-row">
      <aside
        className={`fixed md:relative top-0 left-0 h-full w-72 flex-shrink-0 z-[60] md:z-50 transition-transform duration-300 rounded-r-3xl md:rounded-r-none shadow-xl md:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${isDark ? 'bg-black border-r border-white/10' : 'bg-white border-r border-slate-200'}`}
      >
        <div className="p-4 pt-5 h-full overflow-y-auto no-scrollbar flex flex-col items-stretch">
          {/* Datafy Hub: circle + details in line with close button, no card */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="relative flex-shrink-0">
                <img
                  src={appSettings?.sidebarLogoUrl || 'https://files.catbox.moe/l3islw.jpg'}
                  alt="DataPlus"
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border ${isDark ? 'border-white/10' : 'border-slate-200'}`}
                />
                {showAdminNav && (
                  <>
                    <input
                      ref={adminLogoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const dataUrl = await new Promise((res, rej) => {
                          const r = new FileReader();
                          r.onload = () => res(r.result);
                          r.onerror = rej;
                          r.readAsDataURL(f);
                        });
                        e.target.value = '';
                        setAdminSettingsSaving(true);
                        setAdminSettingsMessage(null);
                        try {
                          await api.updateAdminSettings({ sidebarLogoUrl: dataUrl });
                          const s = await api.getSettings();
                          setAppSettings((prev) => ({ ...prev, ...s }));
                          setAdminSettingsMessage({ type: 'success', text: 'Logo updated' });
                        } catch (err) {
                          setAdminSettingsMessage({ type: 'error', text: err?.message || 'Failed to save' });
                        } finally {
                          setAdminSettingsSaving(false);
                          setTimeout(() => setAdminSettingsMessage(null), 2500);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => adminLogoInputRef.current?.click()}
                      disabled={adminSettingsSaving}
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center border-2 shadow-md transition-transform hover:scale-110 active:scale-95 bg-white text-black border-slate-300 disabled:opacity-60"
                      aria-label="Edit logo"
                      title="Edit logo"
                    >
                      {adminSettingsSaving ? <span className="text-sm">…</span> : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      )}
                    </button>
                  </>
                )}
              </div>
              <div className="min-w-0">
                <h2 className={`text-lg font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈</h2>
                <p className={`text-sm truncate ${isDark ? 'text-white/70' : 'text-slate-500'}`}>{showAdminNav ? 'Admin Console' : 'User Console'}</p>
              </div>
            </div>
            <button
              onClick={toggleSidebar}
              className={`flex items-center justify-center w-12 h-12 rounded-xl border transition-all duration-200 hover:scale-105 active:scale-95 flex-shrink-0 ${isDark ? 'bg-white/10 border-white/10 hover:border-white/20' : 'bg-slate-100 border-slate-200 hover:border-slate-300'}`}
              aria-label="Close menu"
            >
              <Svg.Close stroke={stroke} />
            </button>
          </div>
          {adminSettingsMessage && (
            <p className={`text-xs mb-3 ${adminSettingsMessage.type === 'success' ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
              {adminSettingsMessage.text}
            </p>
          )}
          <div className={`w-10 h-px mx-auto mb-4 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

          <p className={`text-xs uppercase tracking-wider mb-2 font-medium ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Menu</p>
          <nav className="space-y-1.5">
            <MenuItem id="dashboard" icon={<Svg.Grid stroke={stroke} />} label="Dashboard" />
            {!showAdminNav && <MenuItem id="bulk-orders" icon={<Svg.Phone stroke={stroke} />} label="Bulk Orders (MTN)" />}
            {!showAdminNav && <MenuItem id="afa-registration" icon={<Svg.Phone stroke={stroke} />} label="AFA Registration" />}
            {!showAdminNav && (
              <div
                className={`rounded-xl transition-all ${selectedMenu === 'orders' ? 'p-[2px]' : ''}`}
                style={selectedMenu === 'orders' ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)' } : {}}
              >
                <button
                  onClick={() => {
                    handleMenuSelect('orders');
                    toggleOrders();
                  }}
                  className={`flex items-center gap-3 p-3 w-full rounded-xl transition-all duration-200 border ${
                    selectedMenu === 'orders'
                      ? isDark ? 'bg-white/10 text-white border-white/20 shadow-[0_0_16px_rgba(255,255,255,0.08)]' : 'bg-slate-200 text-slate-900 border-slate-300'
                      : isDark ? 'bg-white/5 hover:bg-white/10 text-white border-white/10 hover:border-white/20' : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${selectedMenu === 'orders' ? (isDark ? 'bg-white/15 border-white/20' : 'bg-slate-300 border-slate-300') : isDark ? 'bg-white/10 border-white/10' : 'bg-slate-200 border-slate-200'}`}>
                    <Svg.Clock stroke={stroke} />
                  </div>
                  <span className="flex-1 text-left">Orders</span>
                  <Svg.ChevronDown stroke={stroke} className={`transition-transform ${ordersExpanded ? 'rotate-180' : ''}`} />
                </button>
                {ordersExpanded && (
                  <div className={`px-3 pb-3 space-y-1 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('pending-orders'); }} className={`block py-2.5 px-3 rounded-lg text-base ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'} ${selectedMenu === 'pending-orders' ? (isDark ? 'bg-white/10' : 'bg-slate-200') : ''}`}>Pending Orders</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('completed-orders'); }} className={`block py-2.5 px-3 rounded-lg text-base ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'} ${selectedMenu === 'completed-orders' ? (isDark ? 'bg-white/10' : 'bg-slate-200') : ''}`}>Completed Orders</a>
                  </div>
                )}
              </div>
            )}
            <MenuItem id="transactions" icon={<Svg.Clock stroke={stroke} />} label="Transactions" />
            {!showAdminNav && <MenuItem id="join-us" icon={<Svg.WhatsApp stroke={stroke} />} label="Join Us" />}
            {showAdminNav && (
              <>
                <MenuItem id="admin-users" icon={<Svg.User stroke={stroke} />} label="User Management" />
                <MenuItem id="admin-orders" icon={<Svg.Cart stroke={stroke} />} label="Order Management" />
                <MenuItem id="admin-packages" icon={<Svg.Grid stroke={stroke} />} label="Data Packages" />
                <MenuItem id="admin-all-transactions" icon={<Svg.Card stroke={stroke} />} label="All Transactions" />
                <MenuItem id="admin-wallet" icon={<Svg.Wallet stroke={stroke} />} label="Wallet Management" />
                <MenuItem id="admin-analytics" icon={<Svg.Chart stroke={stroke} />} label="Analytics" />
                <MenuItem id="admin" icon={<Svg.Shield stroke={stroke} />} label="ULTRAXAS MODE" />
              </>
            )}
          </nav>

          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <button
              onClick={toggleTheme}
              className={`flex items-center justify-center w-12 h-12 rounded-xl border transition-all duration-200 hover:scale-105 active:scale-95 ${isDark ? 'bg-white/10 border-white/10 hover:border-white/20' : 'bg-slate-100 border-slate-200 hover:border-slate-300'}`}
              aria-label="Toggle theme"
            >
              {isDark ? <Svg.Sun /> : <Svg.Moon />}
            </button>
          </div>
        </div>
      </aside>

      <main className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full min-w-0 pb-20 sm:pb-24 px-3 sm:px-4 md:px-6 lg:px-8`}>
        <header
          className={`fixed top-0 left-0 right-0 z-50 h-14 sm:h-16 transition-all duration-300 flex items-center justify-between px-3 sm:px-4 md:px-6 backdrop-blur-xl md:left-72 ${isDark ? 'bg-black/90' : 'bg-white/40'} ${scrolled ? 'shadow-lg' : ''}`}
          style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
        >
          <button
            onClick={toggleSidebar}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
            aria-label="Toggle sidebar"
          >
            <Svg.Menu stroke={stroke} width={24} height={24} />
          </button>
          <h1 className={`flex-1 text-center text-xl sm:text-2xl md:text-3xl font-semibold truncate px-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {headerShowWelcome
              ? (hasAdminRole && adminRoute ? `Welcome, ${adminDisplayName(user?.full_name).trim().split(/\s+/)[0]}` : (user?.full_name || user?.email) ? `Welcome, ${(user?.full_name || '').trim().split(/\s+/)[0] || (user?.email || '').split('@')[0]}` : 'Welcome')
              : '𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈'}
          </h1>
          <button
            onClick={toggleProfile}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center overflow-hidden transition-colors flex-shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
            aria-label="Toggle profile"
          >
            {adminAvatarSrc ? (
              <img src={adminAvatarSrc} alt="" className="w-full h-full object-cover rounded-full" />
            ) : (
              <Svg.User stroke={stroke} width={24} height={24} />
            )}
          </button>
        </header>

      {buyBundle && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setBuyBundle(null); setRecipientNumber(''); }} aria-hidden="true" />
          <div className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? 'bg-black' : 'bg-slate-50'}`}>
            {/* Top card: purchase summary - matches selected network */}
            <div className="rounded-xl sm:rounded-2xl mx-3 mt-3 sm:mx-4 sm:mt-4 p-5 sm:p-6 text-white relative overflow-hidden bg-cover bg-center" style={{ backgroundImage: networkBg(buyBundle.network) }}>
              <div className="absolute inset-0 bg-black/50 rounded-xl sm:rounded-2xl" aria-hidden="true" />
              {adminStoreTools && bundlesData && bundlesData[buyBundle.network] && (() => {
                const arr = bundlesData[buyBundle.network];
                const idx = Array.isArray(arr) ? arr.findIndex((b) => String(b.size) === String(buyBundle.size)) : -1;
                return idx >= 0 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const b = arr[idx];
                      setEditingBundle({ network: buyBundle.network, index: idx });
                      setEditBundleForm({ size: b.size, price: typeof b.price === 'number' ? b.price : parseFloat(b.price) || 0 });
                      setAdminBundlesMessage(null);
                      setBuyBundle(null);
                    }}
                    className="absolute top-3 right-3 z-20 w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 hover:bg-white/40 text-white border border-white/40 shadow-lg"
                    aria-label="Edit package"
                    title="Edit package (updates for everyone)"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                ) : null;
              })()}
              <div className="relative z-10 flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium opacity-90">{networkLabel(buyBundle.network)}</p>
                  <h3 className="text-xl sm:text-2xl font-bold">{buyBundle.size}</h3>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium opacity-90">Price</p>
                  <p className="text-lg sm:text-xl font-bold">¢ {buyBundle.price}</p>
                </div>
              </div>
              <button type="button" className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base transition-colors shadow-lg ${isDark ? 'bg-white/95 hover:bg-white text-black' : 'bg-white hover:bg-slate-50 text-slate-900'}`}>
                Buy
              </button>
            </div>
            {/* Bottom card: recipient details - 10 digits only, no country code/symbols/emojis */}
            <div className={`mx-3 mb-3 sm:mx-4 sm:mb-4 mt-3 rounded-xl sm:rounded-2xl p-5 sm:p-6 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white' : 'text-slate-700'}`}>Recipient number</label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={recipientNumber}
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setRecipientNumber(digitsOnly);
                  setRecipientError(null);
                }}
                placeholder="e.g. 0241234567"
                maxLength={10}
                className={`w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${recipientError ? 'border-red-500 focus:border-red-500' : isDark ? 'border-white/10' : 'border-slate-200'} ${isDark ? 'bg-black text-white placeholder:text-white/50' : 'bg-white text-slate-900 placeholder:text-slate-400'}`}
              />
              <p className={`text-xs mt-1.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>10 digits, valid Ghana mobile (e.g. 024, 020, 054, 055, 059, 026, 027). No country code or symbols.</p>
              {recipientError && <p className="text-sm text-red-500 mt-1.5">{recipientError}</p>}
              <div className="flex gap-3 mt-5 justify-end">
                <button
                  type="button"
                  onClick={() => { setBuyBundle(null); setRecipientNumber(''); setRecipientError(null); }}
                  className={`px-5 py-2.5 rounded-xl font-medium text-base transition-colors ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addToCart}
                  className={`px-5 py-2.5 rounded-xl font-medium text-base transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
                >
                  Add to cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        {currentPage === 'bulk-orders' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="page-title text-2xl sm:text-3xl truncate">Bulk Orders</h1>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-600'}`} aria-hidden />
                <span className={`text-sm font-medium hidden sm:inline ${isDark ? 'text-white/90' : 'text-slate-700'}`}>Open now</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage('dashboard')}
                  className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                  aria-label="Back to dashboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                  </svg>
                </button>
              </div>
            </div>

            <p className={`mb-4 sm:mb-5 text-sm border-l-2 pl-3 ${isDark ? 'border-red-500/60 text-red-200/90' : 'border-red-500 text-red-700'}`}>
              <span className="font-medium">MTN Network Only.</span>{' '}
              Currently supporting MTN bundles. Additional networks will be available soon.
            </p>

            <div className={`rounded-xl sm:rounded-2xl overflow-hidden mb-4 sm:mb-5 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
              <div className="p-4 sm:p-6">
                <h2 className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>Order Input</h2>
                <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Enter your orders in the format: <code className={`px-1.5 py-0.5 rounded font-mono text-sm ${isDark ? 'bg-white/10 text-white/90' : 'bg-slate-200 text-slate-800'}`}>phone_number capacity</code>
                </p>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Examples:</span>
                  <span className={`text-xs font-medium ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{bulkOrderInput.split(/\r?\n/).filter((s) => s.trim()).length} lines</span>
                </div>
                <div className={`rounded-lg p-3 mb-4 font-mono text-sm ${isDark ? 'bg-black/30 text-white/80' : 'bg-slate-100 text-slate-700'}`}>
                  <div>0241234567 5</div>
                  <div>0247654321 10</div>
                  <div>0241111111 2</div>
                </div>
                <textarea
                  value={bulkOrderInput}
                  onChange={(e) => { setBulkOrderInput(e.target.value); setBulkOrderError(null); setBulkOrderSuccess(null); }}
                  placeholder={'0241234567 5\n0247654321 10\n0241111111 2'}
                  rows={6}
                  className={`w-full px-4 py-3 rounded-xl border text-base font-mono placeholder:opacity-60 resize-y ${isDark ? 'bg-black/30 border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                />
                {bulkOrderError && <p className={`text-sm mt-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>{bulkOrderError}</p>}
                {bulkOrderSuccess && <p className={`text-sm mt-2 ${isDark ? 'text-white/90' : 'text-slate-700'}`}>{bulkOrderSuccess}</p>}
              </div>
            </div>

            <button
              type="button"
              onClick={processBulkOrders}
              className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 mb-4 sm:mb-5 transition-all shadow-lg ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Process Orders
            </button>
            <button
              type="button"
              disabled={bulkSubmitting}
              onClick={submitBulkOrdersNow}
              className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 mb-4 transition-all border ${
                isDark
                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50'
              }`}
            >
              {bulkSubmitting ? 'Submitting…' : 'Submit Bulk Orders Now'}
            </button>

            <div className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 mb-4 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
              <h3 className={`font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>System Status</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className={isDark ? 'text-white/90' : 'text-slate-700'}>Text Input: Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-white' : 'bg-slate-600'}`} />
                  <span className={isDark ? 'text-white/90' : 'text-slate-700'}>Ordering: Enabled</span>
                </div>
              </div>
            </div>

            <div className={`rounded-xl sm:rounded-2xl overflow-hidden mb-5 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-slate-200 shadow-sm'}`}>
              <div className="p-4 sm:p-5">
                <h3 className={`font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>Format Guide</h3>
                <div className={`rounded-lg p-3 mb-3 ${isDark ? 'bg-black/30 text-white/90' : 'bg-slate-100 text-slate-800'}`}>
                  <p className="text-sm font-medium mb-2">Valid Format:</p>
                  <div className="font-mono text-sm space-y-1">0241234567 5<br />0247654321 10</div>
                </div>
                <ul className={`text-sm space-y-1 list-disc list-inside ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  <li>Phone numbers must be 10 digits (valid Ghana mobile, e.g. 024, 020, 054, 055, 059, 026, 027).</li>
                  <li>Capacity must be a valid MTN bundle size (1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50).</li>
                </ul>
              </div>
            </div>
          </>
        ) : currentPage === 'afa-registration' ? (
          (() => {
            const fee = 14;
            const statusChip = (status) => {
              const s = (status || 'pending').toLowerCase();
              if (s === 'approved') return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-800'}`}>approved</span>;
              if (s === 'rejected') return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-800'}`}>rejected</span>;
              return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-100 text-sky-800'}`}>pending</span>;
            };
            const fmtDate = (iso) => {
              if (!iso) return '—';
              const t = Date.parse(iso);
              if (Number.isNaN(t)) return '—';
              return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            };
            const pendingCount = afaApplications.filter((x) => (x.status || 'pending').toLowerCase() === 'pending').length;
            const approvedCount = afaApplications.filter((x) => (x.status || '').toLowerCase() === 'approved').length;
            return (
              <>
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <h1 className="page-title text-2xl sm:text-3xl truncate">AFA Registration</h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage('dashboard')}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                    aria-label="Back to dashboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                    </svg>
                  </button>
                </div>
                <div className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 border mb-5 ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>AFA Registration Fee</p>
                      <p className={`text-sm mt-1 ${isDark ? 'text-white/65' : 'text-slate-600'}`}>Available balance: ₵{walletBalance.toFixed(2)}</p>
                    </div>
                    <p className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>₵{fee.toFixed(2)}</p>
                  </div>
                  {walletBalance < fee && (
                    <div className={`mt-4 px-3 py-2.5 rounded-lg text-sm ${isDark ? 'bg-red-500/15 border border-red-500/30 text-red-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                      Insufficient balance. Please top up your wallet.
                    </div>
                  )}
                </div>
                {afaSuccess && <p className={`text-sm mb-4 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{afaSuccess}</p>}
                {afaError && <p className={`text-sm mb-4 ${isDark ? 'text-red-300' : 'text-red-700'}`}>{afaError}</p>}
                <button
                  type="button"
                  onClick={() => { setAfaError(null); setAfaSuccess(null); setAfaModalOpen(true); }}
                  className={`w-auto px-6 py-3.5 rounded-xl font-semibold inline-flex items-center justify-center gap-2 mb-5 transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
                >
                  <Svg.Plus />
                  Register New AFA
                </button>
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}><p className={`text-xs ${isDark ? 'text-white/55' : 'text-slate-500'}`}>Total</p><p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{afaApplications.length}</p></div>
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}><p className={`text-xs ${isDark ? 'text-white/55' : 'text-slate-500'}`}>Pending</p><p className={`text-2xl font-bold ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>{pendingCount}</p></div>
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}><p className={`text-xs ${isDark ? 'text-white/55' : 'text-slate-500'}`}>Approved</p><p className={`text-2xl font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>{approvedCount}</p></div>
                </div>
                <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  <div className={`px-4 py-3 text-sm font-semibold ${isDark ? 'border-b border-white/10 text-white/80' : 'border-b border-slate-200 text-slate-700'}`}>My AFA applications</div>
                  {afaApplicationsLoading ? (
                    <div className={`px-4 py-10 text-sm text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading…</div>
                  ) : afaApplications.length === 0 ? (
                    <div className={`px-4 py-10 text-sm text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>No applications yet.</div>
                  ) : (
                    <div className={`divide-y ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                      {afaApplications.map((row) => (
                        <div key={row.id} className="px-4 py-3 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.full_name || '—'}</p>
                            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.phone || '—'} · {fmtDate(row.applied_at)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>₵{Number(row.payment_amount || 0).toFixed(2)}</span>
                            {statusChip(row.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {afaModalOpen && (
                  <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!afaSubmitting) setAfaModalOpen(false); }} />
                    <div className={`relative w-full max-w-lg rounded-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Register New AFA Application</h3>
                        <button type="button" onClick={() => { if (!afaSubmitting) setAfaModalOpen(false); }} className={`text-sm ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Close</button>
                      </div>
                      <div className="space-y-4">
                        {[
                          ['full_name', 'Full Name', 'Enter full name', 'text'],
                          ['phone', 'Phone Number', 'Enter phone number', 'tel'],
                          ['ghana_card_number', 'Ghana Card Number', 'GHA-XXXXXXXXX-X', 'text'],
                          ['occupation', 'Occupation', 'Enter occupation', 'text'],
                          ['date_of_birth', 'Date of Birth', '', 'date'],
                        ].map(([key, label, placeholder, type]) => (
                          <div key={key}>
                            <label className={`block text-sm font-medium mb-1.5 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>{label}</label>
                            <input
                              type={type}
                              value={afaForm[key]}
                              onChange={(e) => setAfaForm((prev) => ({ ...prev, [key]: e.target.value }))}
                              placeholder={placeholder}
                              className={`w-full px-4 py-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/40' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 flex gap-3">
                        <button type="button" disabled={afaSubmitting} onClick={() => setAfaModalOpen(false)} className={`flex-1 py-3 rounded-xl font-semibold ${isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'}`}>Cancel</button>
                        <button
                          type="button"
                          disabled={afaSubmitting}
                          onClick={async () => {
                            setAfaError(null);
                            setAfaSuccess(null);
                            setAfaSubmitting(true);
                            try {
                              const data = await api.createAfaApplication(afaForm);
                              setWalletBalance(Number(data?.balance ?? walletBalance));
                              setAfaApplications((prev) => [data.application, ...prev]);
                              setAfaModalOpen(false);
                              setAfaForm({ full_name: '', phone: '', ghana_card_number: '', occupation: '', date_of_birth: '' });
                              setAfaSuccess('Application submitted successfully and sent to admin.');
                              fetchWallet();
                            } catch (err) {
                              setAfaError(err?.message || 'Failed to submit application');
                            } finally {
                              setAfaSubmitting(false);
                            }
                          }}
                          className={`flex-1 py-3 rounded-xl font-semibold text-white ${walletBalance < fee ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                          {afaSubmitting ? 'Submitting…' : 'Register AFA'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()
        ) : currentPage === 'join-us' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="page-title text-2xl sm:text-3xl truncate">Join Us</h1>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage('dashboard')}
                className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                aria-label="Back to dashboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                </svg>
              </button>
            </div>

            {hasAdminRole && adminRoute ? (
              <div className={`rounded-[1.75rem] overflow-hidden border max-w-sm mx-auto ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white border-slate-200/80 shadow-sm'}`}>
                <div className="px-5 py-12 flex flex-col items-center text-center min-h-[200px]" />
              </div>
            ) : (
              <div className={`rounded-[1.75rem] overflow-hidden border max-w-sm mx-auto ${isDark ? 'bg-white/[0.06] border-white/10' : 'bg-white border-slate-200/80 shadow-sm'}`}>
                <div className="px-5 py-6 flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0 mb-4 bg-slate-200">
                    <img src="/join-us-profile.png" alt="LOVE MUTE" className="w-full h-full object-cover" />
                  </div>
                  <h2 className={`text-lg font-semibold tracking-tight mb-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>LOVE MUTE</h2>
                  <p className={`text-xs mb-4 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Channel · 5.5K followers</p>
                  <a
                    href="https://whatsapp.com/channel/0029VbCDPkSCMY0KfEF3LC2T"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-medium bg-[#25D366] hover:bg-[#20bd5a] text-[#0a3d1e] transition-colors"
                  >
                    View in WhatsApp
                  </a>
                  <p className={`text-xs mt-3 max-w-[220px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                    You will be redirected to WhatsApp.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : currentPage === 'dashboard' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className={`page-title dashboard-animated-title text-2xl sm:text-3xl transition-all duration-300 ${dashboardHeadlineVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
                    {DASHBOARD_HEADLINES[dashboardHeadlineIndex]}
                  </h1>
                </div>
                <div className="relative w-4 h-4 flex items-center justify-center">
                  <div className="absolute w-4 h-4 rounded-full bg-green-500 status-dot" />
                  <div className="relative w-3 h-3 rounded-full bg-green-400" />
                </div>
              </div>
            </div>

            <div
              className={`rounded-xl sm:rounded-2xl p-5 sm:p-7 mb-5 sm:mb-6 text-white balance-card-live ${isDark ? 'border border-white/10' : ''}`}
            >
              <div className="flex justify-between mb-5 sm:mb-6 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-neutral-800'}`}>
                    <Svg.Wallet stroke="#ffffff" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm ${isDark ? 'text-white/70' : 'text-neutral-400'}`}>Balance</p>
                    <p className="text-xl sm:text-3xl font-bold truncate">¢ {dashboardBalance.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-neutral-800'}`}>
                    <Svg.Cart stroke="#ffffff" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm ${isDark ? 'text-white/70' : 'text-neutral-400'}`}>Today's Spent</p>
                    <p className="text-xl sm:text-3xl font-bold truncate">¢ {dashboardTodaySpent.toFixed(2)}</p>
                  </div>
                </div>
              </div>
              {isPinOnlyAdminSession && (
                <p className={`mb-3 text-xs ${isDark ? 'text-white/75' : 'text-neutral-500'}`}>
                  Admin PIN mode active. Personal wallet figures are hidden unless signed in with an admin account.
                </p>
              )}
              <button
                type="button"
                onClick={() => setCurrentPage(isPinOnlyAdminSession ? 'admin-analytics' : 'topup')}
                className={`w-full py-3 sm:py-4 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium text-base ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-neutral-800 hover:bg-neutral-700'}`}
              >
                <Svg.Plus /> {isPinOnlyAdminSession ? 'Open Admin Analytics' : 'Top Up Wallet'}
              </button>
            </div>

            <div className="rounded-xl sm:rounded-2xl p-5 sm:p-7 mb-5 sm:mb-6 bg-black text-white">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {[
                  { label: 'Wallet Balance', value: `¢ ${dashboardBalance.toFixed(2)}` },
                  { label: "Today's Orders", value: String(dashboardTodayOrders) },
                  { label: "Today's Amount", value: `¢ ${dashboardTodayAmount.toFixed(2)}` },
                  { label: "Today's Bundle", value: `${dashboardTodayBundles} GB` },
                ].map((item, i) => (
                  <div key={item.label} className={`text-center ${i < 2 ? 'pb-4 sm:pb-6 border-b md:border-b-0 md:pb-0' : 'pt-4 sm:pt-6'} ${i < 3 ? 'md:border-r' : ''} border-white/10`}>
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mx-auto mb-3 bg-white/10">
                      <Svg.Wallet stroke="#ffffff" />
                    </div>
                    <p className="text-sm font-medium opacity-80">{item.label}</p>
                    <p className="text-lg sm:text-xl font-bold">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`relative flex gap-1 p-1.5 rounded-2xl mb-5 sm:mb-6 overflow-x-auto overflow-y-hidden scrollbar-hide ${isDark ? 'bg-white/[0.07] backdrop-blur-xl border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]' : 'bg-white/40 backdrop-blur-xl border border-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.5)]'}`}
              role="tablist"
              aria-label="Network providers"
            >
              {[
                { id: 'mtn', label: 'MTN' },
                { id: 'telecel', label: 'Telecel' },
                { id: 'bigtime', label: 'AT BigTime' },
                { id: 'ishare', label: 'AT iShare' },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      relative flex-1 min-w-0 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-sm sm:text-base font-semibold
                      transition-all duration-300 ease-out
                      ${isActive
                        ? isDark
                          ? 'bg-white text-black shadow-lg shadow-white/10'
                          : 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                        : isDark
                          ? 'text-white/50 hover:text-white/80 hover:bg-white/5'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                      }
                    `}
                  >
                    {isActive && (
                      <span
                        className={`absolute inset-0 rounded-xl ring-2 pointer-events-none ${isDark ? 'ring-white/20' : 'ring-slate-300/50'}`}
                        aria-hidden
                      />
                    )}
                    <span className="relative truncate block text-center tracking-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 pb-16 sm:pb-20">
              {displayBundles.map((bundle, index) => (
                <div
                  key={index}
                  className="rounded-xl sm:rounded-2xl p-5 sm:p-6 text-white relative overflow-hidden group hover:scale-[1.01] sm:hover:scale-[1.02] transition-transform bg-cover bg-center"
                  style={{ backgroundImage: (isBigTime || isIshare) ? 'url(https://files.catbox.moe/riugtj.png)' : isTelecel ? 'url(https://files.catbox.moe/yzcokj.jpg)' : 'url(https://files.catbox.moe/r1m0uh.png)' }}
                >
                  <div className="absolute inset-0 bg-black/50 rounded-xl sm:rounded-2xl" aria-hidden="true" />
                  {adminStoreTools && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBundle({ network: activeTab, index });
                        setEditBundleForm({ size: bundle.size, price: typeof bundle.price === 'number' ? bundle.price : parseFloat(bundle.price) || 0 });
                        setAdminBundlesMessage(null);
                      }}
                      className="absolute top-3 right-3 z-20 w-9 h-9 rounded-lg flex items-center justify-center bg-white/20 hover:bg-white/40 text-white border border-white/40 shadow-lg"
                      title="Edit package"
                      aria-label="Edit package"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                  )}
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium opacity-90 drop-shadow-sm">{isBigTime ? 'AT BigTime' : isIshare ? 'AT iShare' : isTelecel ? 'Telecel' : 'MTN'}</p>
                        <h3 className="text-xl sm:text-2xl font-bold drop-shadow-md">{bundle.size}</h3>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium opacity-90 drop-shadow-sm">Price</p>
                        <p className="text-lg sm:text-xl font-bold drop-shadow-md">¢ {bundle.price}</p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-col gap-2">
                      <button type="button" onClick={() => setBuyBundle({ ...bundle, network: activeTab })} className={`w-full py-3 sm:py-4 rounded-xl font-semibold text-base transition-colors shadow-lg ${(isBigTime || isIshare) ? 'bg-white/95 hover:bg-white text-blue-600' : isTelecel ? 'bg-white/95 hover:bg-white text-red-700' : 'bg-white/95 hover:bg-white text-slate-800'}`}>
                        Buy
                      </button>
                      {adminStoreTools && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBundle({ network: activeTab, index });
                            setEditBundleForm({ size: bundle.size, price: typeof bundle.price === 'number' ? bundle.price : parseFloat(bundle.price) || 0 });
                            setAdminBundlesMessage(null);
                          }}
                          className="w-full py-2 rounded-xl font-medium text-sm bg-white/20 hover:bg-white/30 text-white border border-white/30"
                        >
                          Edit price
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : currentPage === 'transactions' ? (
          (() => {
            const now = new Date();
            const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const getRange = () => {
              if (transactionDateFilter === 'Today') {
                const s = startOfDay(now);
                return { start: s.getTime(), end: now.getTime() + 86400000 };
              }
              if (transactionDateFilter === 'Yesterday') {
                const s = startOfDay(now);
                return { start: s.getTime() - 86400000, end: s.getTime() };
              }
              if (transactionDateFilter === 'Last 7 Days') {
                return { start: now.getTime() - 7 * 86400000, end: now.getTime() + 86400000 };
              }
              if (transactionDateFilter === 'This Month') {
                const s = new Date(now.getFullYear(), now.getMonth(), 1);
                return { start: s.getTime(), end: now.getTime() + 86400000 };
              }
              if (transactionDateFilter === 'Custom' && transactionCustomStart && transactionCustomEnd) {
                const start = new Date(transactionCustomStart).getTime();
                const end = new Date(transactionCustomEnd).getTime() + 86400000;
                return { start, end };
              }
              return { start: 0, end: Infinity };
            };
            const { start, end } = getRange();
            const searchLower = transactionSearch.trim().toLowerCase();
            const normalizeStatus = (raw) => {
              const s = String(raw || '').trim().toLowerCase();
              if (!s) return 'completed';
              if (['success', 'successful', 'completed', 'complete', 'done', 'paid'].includes(s)) return 'completed';
              if (['pending', 'processing', 'in-progress', 'queued'].includes(s)) return 'pending';
              if (['failed', 'error', 'rejected', 'cancelled', 'canceled'].includes(s)) return 'failed';
              return s;
            };
            const typeLabel = (t) => {
              const typ = String(t.type || '').toLowerCase();
              if (typ === 'topup') return 'Credit';
              if (typ === 'payment') return 'Order payment';
              return t.type || '—';
            };
            const modeLabel = (t) => {
              if (t.mode) return String(t.mode);
              const ref = String(t.reference || '').toUpperCase();
              if (ref.startsWith('WT-') || ref.startsWith('PAYSTACK') || ref.startsWith('PS-')) return 'Paystack';
              if (ref.startsWith('TOPUP-') || ref.startsWith('ADMIN-') || ref.startsWith('DP-')) return 'Wallet';
              if (String(t.type || '').toLowerCase() === 'topup') return 'Wallet';
              return 'Wallet';
            };
            const narrationLabel = (t) =>
              (t.description || t.narration || t.note || (String(t.type || '').toLowerCase() === 'topup' ? 'Wallet top-up' : 'Order payment')).toString();
            const txStatusLabel = (t) => {
              const s = normalizeStatus(t.status);
              return s.charAt(0).toUpperCase() + s.slice(1);
            };

            const filtered = transactions.filter((t) => {
              const tTime = t.created_at ? new Date(t.created_at).getTime() : 0;
              if (tTime < start || tTime >= end) return false;
              if (transactionTypeFilter !== 'All Types' && typeLabel(t) !== transactionTypeFilter) return false;
              if (transactionStatusFilter !== 'All Status' && txStatusLabel(t) !== transactionStatusFilter) return false;
              if (!searchLower) return true;
              const type = typeLabel(t).toLowerCase();
              const mode = modeLabel(t).toLowerCase();
              const narration = narrationLabel(t).toLowerCase();
              const status = txStatusLabel(t).toLowerCase();
              const ref = (t.reference || '').toLowerCase();
              const amt = String(t.amount || '');
              return (
                type.includes(searchLower) ||
                mode.includes(searchLower) ||
                narration.includes(searchLower) ||
                status.includes(searchLower) ||
                ref.includes(searchLower) ||
                amt.includes(searchLower)
              );
            });
            const creditsTotal = filtered.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const debitsTotal = filtered.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
            const creditsCount = filtered.filter((t) => Number(t.amount) > 0).length;
            const debitsCount = filtered.filter((t) => Number(t.amount) < 0).length;
            const net = creditsTotal - debitsTotal;

            const openPrintView = () => {
              const win = window.open('', '_blank', 'width=800,height=600');
              if (!win) return;
              win.document.write(`
                <!DOCTYPE html><html><head><title>Transactions</title>
                <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}.meta{margin-bottom:16px;color:#666}.table{width:100%;border-collapse:collapse}.table th,.table td{border:1px solid #ddd;padding:10px 12px;text-align:left}.table th{background:#f5f5f5}.table tr:nth-child(even){background:#fafafa}.amount--pos{color:#059669}.amount--neg{color:#dc2626}</style></head><body>
                <div class="meta">Generated ${new Date().toLocaleString()} · ${filtered.length} transaction(s)</div>
                <table class="table"><thead><tr><th>Date</th><th>Type</th><th>Narration</th><th>Mode</th><th>Amount</th><th>Status</th></tr></thead><tbody>
                ${filtered.map((t) => {
                  const d = t.created_at ? new Date(t.created_at).toLocaleString() : '—';
                  const amt = t.amount >= 0 ? `+¢ ${t.amount.toFixed(2)}` : `−¢ ${Math.abs(t.amount).toFixed(2)}`;
                  const amtClass = t.amount >= 0 ? 'amount--pos' : 'amount--neg';
                  return `<tr><td>${d}</td><td>${typeLabel(t)}</td><td>${narrationLabel(t)}</td><td>${modeLabel(t)}</td><td class="${amtClass}">${amt}</td><td>${txStatusLabel(t)}</td></tr>`;
                }).join('')}
                </tbody></table></body></html>`);
              win.document.close();
              win.focus();
              setTimeout(() => { win.print(); }, 300);
            };

            return (
              <>
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <h1 className="page-title text-2xl sm:text-3xl truncate">Transactions</h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage('dashboard')}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                    aria-label="Back to dashboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                    </svg>
                  </button>
                </div>

                <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>Search and filter your transaction history. Download as PDF to save a copy.</p>

                <div className={`flex flex-wrap gap-2 mb-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                  {['Today', 'Yesterday', 'Last 7 Days', 'This Month', 'Custom'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setTransactionDateFilter(label)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${transactionDateFilter === label ? (isDark ? 'bg-white text-black' : 'bg-black text-white') : isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {transactionDateFilter === 'Custom' && (
                  <div className={`flex flex-wrap items-center gap-3 mb-4 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                    <label className="flex items-center gap-2 text-sm">
                      From
                      <input type="date" value={transactionCustomStart} onChange={(e) => setTransactionCustomStart(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-black border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      To
                      <input type="date" value={transactionCustomEnd} onChange={(e) => setTransactionCustomEnd(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-black border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
                    </label>
                  </div>
                )}

                <div className="mb-4">
                  <input
                    type="search"
                    value={transactionSearch}
                    onChange={(e) => setTransactionSearch(e.target.value)}
                    placeholder="Search by type, reference, or amount..."
                    className={`w-full px-4 py-3 rounded-xl border text-sm placeholder:opacity-60 ${isDark ? 'bg-black/30 border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    aria-label="Search transactions"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <select
                    value={transactionTypeFilter}
                    onChange={(e) => setTransactionTypeFilter(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                    aria-label="Filter transaction type"
                  >
                    <option>All Types</option>
                    <option>Credit</option>
                    <option>Order payment</option>
                  </select>
                  <select
                    value={transactionStatusFilter}
                    onChange={(e) => setTransactionStatusFilter(e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-black/30 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                    aria-label="Filter transaction status"
                  >
                    <option>All Status</option>
                    <option>Completed</option>
                    <option>Pending</option>
                    <option>Failed</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-emerald-200/80' : 'text-emerald-700'}`}>Credits</p>
                    <p className={`text-2xl font-bold ${isDark ? 'text-emerald-200' : 'text-emerald-700'}`}>¢ {creditsTotal.toFixed(2)}</p>
                    <p className={`text-xs ${isDark ? 'text-emerald-200/70' : 'text-emerald-700/80'}`}>Count: {creditsCount}</p>
                  </div>
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                    <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-amber-200/80' : 'text-amber-700'}`}>Debits</p>
                    <p className={`text-2xl font-bold ${isDark ? 'text-amber-200' : 'text-amber-700'}`}>¢ {debitsTotal.toFixed(2)}</p>
                    <p className={`text-xs ${isDark ? 'text-amber-200/70' : 'text-amber-700/80'}`}>Count: {debitsCount}</p>
                  </div>
                  <div className={`rounded-xl p-4 border ${isDark ? 'bg-violet-500/10 border-violet-500/20' : 'bg-violet-50 border-violet-200'}`}>
                    <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-violet-200/80' : 'text-violet-700'}`}>Net</p>
                    <p className={`text-2xl font-bold ${net >= 0 ? (isDark ? 'text-violet-200' : 'text-violet-700') : (isDark ? 'text-red-300' : 'text-red-600')}`}>¢ {net.toFixed(2)}</p>
                    <p className={`text-xs ${isDark ? 'text-violet-200/70' : 'text-violet-700/80'}`}>{transactionDateFilter}</p>
                  </div>
                </div>

                <div className="flex justify-end mb-4">
                  <button
                    type="button"
                    onClick={openPrintView}
                    disabled={filtered.length === 0}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${filtered.length === 0 ? 'opacity-50 cursor-not-allowed ' : ''}${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}
                  >
                    Download as PDF
                  </button>
                </div>

                <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <div className={`overflow-x-auto ${isDark ? 'bg-white/[0.02]' : 'bg-slate-50'}`}>
                    {filtered.length === 0 ? (
                      <div className={`py-12 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                        {transactions.length === 0 ? 'No transactions yet. Your top-ups and payments will appear here.' : 'No transactions match your filter or search.'}
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Date</th>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Type</th>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Narration</th>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Mode</th>
                            <th className={`text-right py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Amount</th>
                            <th className={`text-left py-3 px-4 font-semibold ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((t) => (
                            <tr key={t.id} className={`border-b last:border-b-0 ${isDark ? 'border-white/10 hover:bg-white/[0.04]' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <td className={`py-3 px-4 ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                              <td className={`py-3 px-4 ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{typeLabel(t)}</td>
                              <td className={`py-3 px-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{narrationLabel(t)}</td>
                              <td className={`py-3 px-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{modeLabel(t)}</td>
                              <td className={`py-3 px-4 text-right font-medium ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>{t.amount >= 0 ? '+' : ''}¢ {Math.abs(t.amount).toFixed(2)}</td>
                              <td className={`py-3 px-4 ${txStatusLabel(t) === 'Completed' ? 'text-emerald-500' : txStatusLabel(t) === 'Pending' ? 'text-amber-500' : 'text-red-500'}`}>{txStatusLabel(t)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            );
          })()
        ) : currentPage === 'topup' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="page-title text-2xl sm:text-3xl truncate">Top Up Wallet</h1>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage('dashboard')}
                className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                aria-label="Back to dashboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                </svg>
              </button>
            </div>

            <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 mb-5 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <h2 className={`text-lg font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Top Up Wallet</h2>
              <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
                {paystackPublicKey
                  ? 'Enter an amount, then continue — you will be taken to Paystack to pay. After payment you return here and your balance updates automatically.'
                  : 'Enter an amount and continue to complete your payment (instant balance only when the server has no Paystack keys).'}
              </p>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Amount (GHS)</label>
              <input
                type="number"
                min={MIN_WALLET_TOPUP_GHS}
                step="0.01"
                placeholder="1.00"
                value={topUpAmount}
                onChange={(e) => { setTopUpAmount(e.target.value); setTopUpError(null); setTopUpSuccess(null); }}
                className={`w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
              />
              <p className={`text-xs mt-1.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Minimum amount: GHS {MIN_WALLET_TOPUP_GHS}</p>
              {topUpSuccess && (
                <p className="text-sm text-emerald-500 mt-2" role="status">
                  {topUpSuccess}
                </p>
              )}
              {topUpError && <p className="text-sm text-red-500 mt-2">{topUpError}</p>}
              <button
                type="button"
                disabled={topUpBusy || paystackConfigLoading}
                onClick={async () => {
                  const amt = parseFloat(topUpAmount);
                  if (!Number.isFinite(amt) || amt < MIN_WALLET_TOPUP_GHS) {
                    setTopUpError(`Minimum amount is GHS ${MIN_WALLET_TOPUP_GHS}`);
                    return;
                  }
                  setTopUpError(null);
                  setTopUpSuccess(null);
                  setTopUpBusy(true);
                  const pk = paystackPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
                  try {
                    if (pk) {
                      const init = await api.initPaystackWalletTopUp(amt);
                      const url = init.authorization_url && String(init.authorization_url).trim();
                      if (!url) {
                        throw new Error('Paystack did not return a checkout URL');
                      }
                      setTopUpBusy(false);
                      window.location.assign(url);
                    } else {
                      const data = await api.topUp(amt);
                      setWalletBalance(data.balance);
                      setTopUpAmount('');
                      const list = await api.getTransactions();
                      setTransactions(list);
                      setTopUpBusy(false);
                    }
                  } catch (err) {
                    if (/unauthorized|expired|401/i.test(String(err?.message || ''))) {
                      clearSession();
                    }
                    setTopUpError(err.message || 'Top-up failed');
                    setTopUpBusy(false);
                  }
                }}
                className={`w-full mt-4 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
              >
                {topUpBusy
                  ? paystackPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
                    ? 'Contacting server…'
                    : 'Please wait…'
                  : paystackPublicKey || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY
                    ? 'Continue to Paystack'
                    : 'Top Up'}
              </button>
            </div>

            <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 mb-5 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Current Balance</span>
                <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>¢ {walletBalance.toFixed(2)}</span>
              </div>
            </div>

            <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 border ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-base font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>Recent transactions</h3>
              {transactions.length > 0 ? (
                <ul className="space-y-2">
                  {transactions.map((t) => (
                    <li key={t.id} className={`flex justify-between items-center gap-2 py-2 border-b last:border-b-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                      <div className="min-w-0">
                        <span className={`text-sm font-medium ${t.amount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {t.amount >= 0 ? '+' : ''}¢ {Math.abs(t.amount).toFixed(2)}
                        </span>
                        <span className={`text-xs block ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{t.type}{t.reference ? ` · ${t.reference}` : ''}</span>
                      </div>
                      <span className={`text-xs flex-shrink-0 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={`py-8 text-center rounded-xl border border-dashed ${isDark ? 'border-white/10 text-white/40' : 'border-slate-200 text-slate-400'}`}>
                  <p className="text-sm">No transactions yet</p>
                  <p className="text-xs mt-1">Your top-ups and payments will appear here</p>
                </div>
              )}
            </div>
          </>
        ) : currentPage === 'orders' ? (
          (() => {
            const now = new Date();
            const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const getOrderRange = () => {
              if (orderDateFilter === 'Today') {
                const s = startOfDay(now);
                return { start: s.getTime(), end: now.getTime() + 86400000 };
              }
              if (orderDateFilter === 'Yesterday') {
                const s = startOfDay(now);
                return { start: s.getTime() - 86400000, end: s.getTime() };
              }
              if (orderDateFilter === 'Last 7 Days') {
                return { start: now.getTime() - 7 * 86400000, end: now.getTime() + 86400000 };
              }
              if (orderDateFilter === 'This Month') {
                const s = new Date(now.getFullYear(), now.getMonth(), 1);
                return { start: s.getTime(), end: now.getTime() + 86400000 };
              }
              if (orderDateFilter === 'Custom' && orderCustomStart && orderCustomEnd) {
                const start = new Date(orderCustomStart).getTime();
                const end = new Date(orderCustomEnd).getTime() + 86400000;
                return { start, end };
              }
              return { start: 0, end: Infinity };
            };
            const { start, end } = getOrderRange();
            const inRange = (iso) => {
              if (!iso) return true;
              const t = Date.parse(iso);
              if (!Number.isFinite(t)) return true;
              return t >= start && t < end;
            };
            const formatOrderDate = (iso) => {
              if (!iso) return { date: '—', time: '—' };
              const d = new Date(iso);
              if (Number.isNaN(d.getTime())) return { date: '—', time: '—' };
              return {
                date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              };
            };
            const normalized = orders.map((o) => {
              const dateIso = getOrderCreatedAtIso(o);
              const orderDisplayId = formatOrderDisplayId(o, dateIso);
              return {
                id: String(o.id),
                orderDisplayId,
                recipientNumber: o.recipient_number || '',
                network: o.network ? (typeof o.network === 'string' && o.network.length > 3 ? o.network : networkLabel(o.network)) : networkLabel('mtn'),
                bundleSize: o.bundle_size || '',
                amount: typeof o.bundle_price === 'number' ? o.bundle_price.toFixed(2) : String(o.bundle_price || '0'),
                dateIso,
                status: (() => {
                  const s = (o.status || '').toString().toLowerCase();
                  if (s === 'completed' || s === 'success') return 'Completed';
                  if (s === 'failed' || s === 'cancelled' || s === 'reversed') return 'Failed';
                  return 'Processing';
                })(),
              };
            });
            const byStatus = (o) => orderStatusFilter === 'all' || o.status.toLowerCase() === orderStatusFilter;
            const searchLower = orderHistorySearch.trim().toLowerCase();
            const bySearch = (o) => {
              if (!searchLower) return true;
              const ord = (o.orderDisplayId || '').toLowerCase();
              return (o.recipientNumber && o.recipientNumber.includes(searchLower)) ||
                (o.network && o.network.toLowerCase().includes(searchLower)) ||
                (o.bundleSize && o.bundleSize.toLowerCase().includes(searchLower)) ||
                ord.includes(searchLower);
            };
            const rangedOrders = normalized.filter((o) => inRange(o.dateIso));
            const completedOrders = rangedOrders.filter((o) => o.status === 'Completed');
            const filteredHistory = completedOrders.filter(bySearch);
            const ordersToShow = rangedOrders.filter(byStatus).filter(bySearch);

            return (
              <>
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <h1 className="page-title text-2xl sm:text-3xl truncate">Orders</h1>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage('dashboard')}
                    className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                    aria-label="Back to dashboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                    </svg>
                  </button>
                </div>

                <p className={`text-sm mb-4 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>View order status and your completed order history.</p>

                <div className={`flex flex-wrap gap-2 mb-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                  {['Today', 'Yesterday', 'Last 7 Days', 'This Month', 'Custom'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setOrderDateFilter(label)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${orderDateFilter === label ? (isDark ? 'bg-white text-black' : 'bg-black text-white') : isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {orderDateFilter === 'Custom' && (
                  <div className={`flex flex-wrap items-center gap-3 mb-4 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                    <label className="flex items-center gap-2 text-sm">
                      From
                      <input type="date" value={orderCustomStart} onChange={(e) => setOrderCustomStart(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-black border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      To
                      <input type="date" value={orderCustomEnd} onChange={(e) => setOrderCustomEnd(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-black border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
                    </label>
                  </div>
                )}

                <div className={`relative flex gap-0.5 p-0.5 rounded-2xl mb-5 sm:mb-6 overflow-hidden ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`} role="tablist" aria-label="Order status filter">
                  {['all', 'processing', 'completed', 'failed'].map((status) => {
                    const label = status === 'all' ? 'All' : status === 'processing' ? 'Processing' : status === 'completed' ? 'Completed' : 'Failed';
                    const active = orderStatusFilter === status;
                    return (
                      <button
                        key={status}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setOrderStatusFilter(status)}
                        className={`flex-1 min-w-0 py-3 px-4 rounded-xl text-sm font-medium transition-all ${active ? (isDark ? 'bg-white text-black shadow-sm' : 'bg-white text-slate-900 shadow-sm border border-slate-200') : isDark ? 'text-white/70 hover:text-white hover:bg-white/5' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="mb-6">
                  <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Order status</h2>
                  <div className="space-y-3">
                    {ordersLoading ? (
                      <div className={`rounded-xl py-8 text-center text-sm ${isDark ? 'text-white/50 bg-white/5 border border-white/10' : 'text-slate-500 bg-slate-100 border border-slate-200'}`}>
                        Loading orders…
                      </div>
                    ) : ordersToShow.length === 0 ? (
                      <div className={`rounded-xl py-8 text-center text-sm ${isDark ? 'text-white/50 bg-white/5 border border-white/10' : 'text-slate-500 bg-slate-100 border border-slate-200'}`}>
                        {normalized.length === 0 ? 'No orders yet. Your orders will appear here after you checkout.' : orderHistorySearch.trim() ? 'No orders match your search.' : 'No orders in this filter.'}
                      </div>
                    ) : (
                      ordersToShow.map((order) => {
                        const { date, time } = formatOrderDate(order.dateIso);
                        const isCompleted = order.status === 'Completed';
                        const isFailed = order.status === 'Failed';
                        const processingSteps = ['Submitted', 'Confirming', 'Completing'];
                        return (
                          <div
                            key={order.id}
                            className={`rounded-xl border p-4 sm:p-5 transition-colors ${
                              isFailed
                                ? (isDark ? 'bg-red-500/10 border-red-500/40 hover:bg-red-500/15' : 'bg-red-50 border-red-200 hover:border-red-300')
                                : isCompleted
                                  ? (isDark ? 'bg-emerald-500/10 border-emerald-500/35 hover:bg-emerald-500/15' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300')
                                : isDark
                                  ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.06]'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
                                  isFailed ? (isDark ? 'text-red-300/90' : 'text-red-700') : (isDark ? 'text-indigo-300/90' : 'text-indigo-700')
                                }`}>{order.orderDisplayId}</p>
                                <p className={`font-mono text-base font-medium ${
                                  isFailed ? (isDark ? 'text-red-200' : 'text-red-900') : (isDark ? 'text-white' : 'text-slate-900')
                                }`}>{order.recipientNumber}</p>
                                <p className={`text-sm mt-0.5 ${
                                  isFailed ? (isDark ? 'text-red-200/80' : 'text-red-700') : (isDark ? 'text-white/60' : 'text-slate-500')
                                }`}>{order.network} · {order.bundleSize}</p>
                                <p className={`text-xs mt-2 ${
                                  isFailed ? (isDark ? 'text-red-300/70' : 'text-red-600/80') : (isDark ? 'text-white/40' : 'text-slate-400')
                                }`}>{date} · {time}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isCompleted ? (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    Completed
                                  </span>
                                ) : isFailed ? (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800'}`}>
                                    Failed
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-green-600 dark:text-green-400">Processing</span>
                                )}
                                <span className={`font-semibold ${
                                  isFailed
                                    ? (isDark ? 'text-red-200' : 'text-red-700')
                                    : isCompleted
                                      ? (isDark ? 'text-emerald-300' : 'text-emerald-700')
                                      : (isDark ? 'text-white' : 'text-slate-900')
                                }`}>¢ {order.amount}</span>
                              </div>
                            </div>
                            {!isCompleted && !isFailed && (
                              <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  {processingSteps.map((step, i) => (
                                    <span key={step} className={`text-xs font-medium ${i < 2 ? (isDark ? 'text-white/80' : 'text-slate-700') : (isDark ? 'text-white/40' : 'text-slate-400')}`}>
                                      {step}
                                    </span>
                                  ))}
                                </div>
                                <div className="relative h-2 rounded-full overflow-hidden bg-green-500/20">
                                  <div
                                    className="h-full rounded-full bg-green-500"
                                    style={{ width: '66%' }}
                                  />
                                  <div
                                    className="absolute inset-0 opacity-40"
                                    style={{
                                      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                                      backgroundSize: '200% 100%',
                                      backgroundPosition: '200% 0',
                                      animation: 'shimmer 1.8s ease-in-out infinite',
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between mt-1.5">
                                  <span className={`text-[10px] uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-slate-400'}`}>Confirming with network</span>
                                  <span className={`text-[10px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Step 2 of 3</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {completedOrders.length > 0 ? (
                  <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <div className={`px-4 py-3 border-b ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}>
                      <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>Completed orders · History</h2>
                      <input
                        type="search"
                        value={orderHistorySearch}
                        onChange={(e) => setOrderHistorySearch(e.target.value)}
                        placeholder="Search by order number, phone, network, or bundle..."
                        className={`w-full px-4 py-2.5 rounded-xl border text-sm placeholder:opacity-60 ${isDark ? 'bg-black/30 border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                        aria-label="Search completed orders"
                      />
                    </div>
                    <div className={`divide-y max-h-[280px] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-200'}`}>
                      {filteredHistory.length === 0 ? (
                        <div className={`py-8 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                          No matching completed orders.
                        </div>
                      ) : (
                        filteredHistory.map((order) => {
                          const { date, time } = formatOrderDate(order.dateIso);
                          return (
                            <div key={order.id} className={`px-4 py-3.5 flex flex-wrap items-center justify-between gap-2 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50'}`}>
                              <div className="min-w-0">
                                <p className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${isDark ? 'text-indigo-300/90' : 'text-indigo-700'}`}>{order.orderDisplayId}</p>
                                <p className={`font-mono text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{order.recipientNumber}</p>
                                <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{date} at {time}</p>
                              </div>
                              <div className={`text-sm ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                                {order.network} {order.bundleSize} · <span className="font-semibold">¢ {order.amount}</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            );
          })()
        ) : (['admin', 'admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications', 'admin-analytics'].includes(currentPage) && ((adminRoute && adminPinVerified) || (isSignedIn && user?.role === 'admin'))) ? (
          <>
            {(() => {
              const adminPageTitles = {
                admin: 'ULTRAXAS MODE',
                'admin-users': 'User Management',
                'admin-orders': 'Order Management',
                'admin-packages': 'Data Packages',
                'admin-all-transactions': 'All Transactions',
                'admin-wallet': 'Wallet Management',
                'admin-applications': 'Agent Applications',
                'admin-analytics': 'Analytics',
              };
              const adminPageSubtitles = {
                admin: null,
                'admin-users': 'Manage users and roles',
                'admin-orders': 'Manage and approve customer orders.',
                'admin-packages': 'Manage data packages',
                'admin-all-transactions': 'View all transactions',
                'admin-wallet': 'Manage user wallet balances',
                'admin-applications': 'Manage agent membership applications',
                'admin-analytics': 'Dashboard overview, metrics, and recent users',
              };
              const title = adminPageTitles[currentPage] || 'Admin';
              const subtitle = adminPageSubtitles[currentPage];
              return (
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5">
                  {currentPage === 'admin-applications' ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <h1 className="page-title text-2xl sm:text-3xl truncate">{title}</h1>
                        {subtitle ? (
                          <p className={`text-sm mt-1 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>{subtitle}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentPage('admin');
                          setSelectedMenu('admin');
                        }}
                        className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${isDark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                      >
                        ← Back to Admin
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { navigate('/'); setCurrentPage('dashboard'); setSelectedMenu('dashboard'); }}
                        className={`inline-flex items-center gap-2 text-sm font-medium mb-3 transition-colors ${isDark ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                        </svg>
                        Back to Dashboard
                      </button>
                      <h1 className="page-title text-2xl sm:text-3xl truncate">{title}</h1>
                      {subtitle ? (
                        <p className={`text-sm mt-1 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>{subtitle}</p>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })()}

            {currentPage === 'admin-analytics' && adminStatsError && (
              <div className={`mb-4 p-4 rounded-xl ${isDark ? 'bg-red-500/10 border border-red-500/30 text-red-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {adminStatsError}
              </div>
            )}

            {currentPage === 'admin-users' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <input
                    type="search"
                    placeholder="Search by name, email or phone..."
                    value={adminUsersSearch}
                    onChange={(e) => setAdminUsersSearch(e.target.value)}
                    className={`flex-1 min-w-0 px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-white/5 border-white/20 text-white placeholder-white/40' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'}`}
                    aria-label="Search users"
                  />
                  <p className={`text-sm font-medium shrink-0 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                    {(() => {
                      const q = (adminUsersSearch || '').trim().toLowerCase();
                      const filtered = q
                        ? adminUsers.filter((u) => {
                            const name = (u.full_name || '').toLowerCase();
                            const email = (u.email || '').toLowerCase();
                            const phone = (u.phone || '').replace(/\D/g, '');
                            const searchNum = q.replace(/\D/g, '');
                            return name.includes(q) || email.includes(q) || (u.phone || '').toLowerCase().includes(q) || (searchNum && phone.includes(searchNum));
                          })
                        : adminUsers;
                      return `${filtered.length} user${filtered.length !== 1 ? 's' : ''}`;
                    })()}
                  </p>
                </div>
                <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  {adminUsersLoading ? (
                    <div className={`px-4 py-8 text-center ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Loading users…</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Name</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Email</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Phone</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Role</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Date joined</th>
                            <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const q = (adminUsersSearch || '').trim().toLowerCase();
                            const filtered = q
                              ? adminUsers.filter((u) => {
                                  const name = (u.full_name || '').toLowerCase();
                                  const email = (u.email || '').toLowerCase();
                                  const phone = (u.phone || '').replace(/\D/g, '');
                                  const searchNum = q.replace(/\D/g, '');
                                  return name.includes(q) || email.includes(q) || (u.phone || '').toLowerCase().includes(q) || (searchNum && phone.includes(searchNum));
                                })
                              : adminUsers;
                            if (filtered.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={6} className={`px-4 py-8 text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                                    No users found
                                  </td>
                                </tr>
                              );
                            }
                            return filtered.map((u) => (
                              <tr key={u.id} className={`border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                <td className={`px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.full_name || '—'}</td>
                                <td className={`px-4 py-3 ${isDark ? 'text-white/90' : 'text-slate-700'}`}>{u.email || '—'}</td>
                                <td className={`px-4 py-3 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{u.phone || '—'}</td>
                                <td className={`px-4 py-3 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{u.role || 'user'}</td>
                                <td className={`px-4 py-3 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }) : '—'}</td>
                                <td className="px-4 py-3">
                                  {(u.role || 'user').toLowerCase() !== 'admin' ? (
                                    <button
                                      type="button"
                                      disabled={adminRoleUpdating === u.id}
                                      onClick={async () => {
                                        setAdminRoleUpdating(u.id);
                                        try {
                                          await api.updateUserRole(u.id, 'admin');
                                          setAdminUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: 'admin' } : x)));
                                        } catch (err) {
                                          alert(err?.message || 'Failed to update role');
                                        } finally {
                                          setAdminRoleUpdating(null);
                                        }
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50' : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50'}`}
                                    >
                                      {adminRoleUpdating === u.id ? '…' : 'Make admin'}
                                    </button>
                                  ) : (
                                    <span className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-400'}`}>Admin</span>
                                  )}
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentPage === 'admin-orders' && (
              <div className="space-y-4">
                <div className="relative">
                  <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-white/40' : 'text-slate-400'}`} aria-hidden>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    value={adminOrdersSearch}
                    onChange={(e) => setAdminOrdersSearch(e.target.value)}
                    placeholder="Search orders by order number, phone, reference, or customer…"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm placeholder:opacity-70 ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/45' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    aria-label="Search orders"
                  />
                </div>

                {adminOrdersError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {adminOrdersError}
                  </div>
                )}
                {agentApplicationsError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {agentApplicationsError}
                  </div>
                )}

                <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200'}`}>
                  <div className={`px-4 py-3 border-b flex items-center gap-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}>
                    <span className={isDark ? 'text-white/90' : 'text-slate-800'} aria-hidden>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1" />
                        <circle cx="20" cy="21" r="1" />
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                      </svg>
                    </span>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      Orders ({(() => {
                        const q = (adminOrdersSearch || '').trim().toLowerCase();
                        const rows = (adminOrders || []).map(normalizeAdminOrderRow);
                        const filtered = !q ? rows : rows.filter((r) => {
                          const blob = [r.orderIdDisplay, r.reference, r.recipient, r.customer, r.customerSub, r.packageTitle, r.packageSub, r.packageFull, r.amount, r.statusLabel].join(' ').toLowerCase();
                          return blob.includes(q);
                        });
                        return filtered.length;
                      })()})
                    </h2>
                  </div>

                  {adminOrdersLoading ? (
                    <div className={`px-4 py-12 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading orders…</div>
                  ) : (() => {
                    const q = (adminOrdersSearch || '').trim().toLowerCase();
                    const rows = (adminOrders || []).map(normalizeAdminOrderRow);
                    const filtered = !q ? rows : rows.filter((r) => {
                      const blob = [r.orderIdDisplay, r.reference, r.recipient, r.customer, r.customerSub, r.packageTitle, r.packageSub, r.packageFull, r.amount, r.statusLabel].join(' ').toLowerCase();
                      return blob.includes(q);
                    });
                    if (filtered.length === 0) {
                      return (
                        <div className={`px-4 py-14 text-center text-sm max-w-md mx-auto ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                          <p className={`font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
                            {adminOrders.length === 0 && !adminOrdersError ? 'No orders yet' : 'No matching orders'}
                          </p>
                          <p className="text-xs leading-relaxed">
                            {adminOrders.length === 0 && !adminOrdersError
                              ? 'After customers pay from wallet checkout, each order will list here with order ID, reference, name, package, phone, amount, and status.'
                              : 'Try another search term.'}
                          </p>
                        </div>
                      );
                    }
                    const statusPill = (row) => (
                      row.statusLabel === 'Completed' ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}>Completed</span>
                      ) : row.statusLabel === 'Failed' ? (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800'}`}>Failed</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-800'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                          Processing
                        </span>
                      )
                    );
                    return (
                      <>
                        <div className="hidden md:block overflow-x-auto max-h-[min(85vh,1200px)] overflow-y-auto">
                          <table className="w-full text-left text-sm min-w-[920px]">
                            <thead className={`sticky top-0 z-[1] ${isDark ? 'bg-zinc-900/95 border-b border-white/10' : 'bg-slate-100 border-b border-slate-200'}`}>
                              <tr>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Order ID</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Reference</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Customer</th>
                                <th className={`px-4 py-3 font-semibold min-w-[180px] ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Package</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Phone</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Amount</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Status</th>
                                <th className={`px-4 py-3 font-semibold whitespace-nowrap text-right ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Action</th>
                              </tr>
                            </thead>
                            <tbody className={isDark ? 'divide-y divide-white/10' : 'divide-y divide-slate-200'}>
                              {filtered.map((row) => (
                                <tr key={row.key} className={isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}>
                                  <td className={`px-4 py-3.5 font-semibold align-top ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.orderIdDisplay}</td>
                                  <td className={`px-4 py-3.5 font-mono text-xs align-top break-all max-w-[140px] ${isDark ? 'text-white/70' : 'text-slate-700'}`}>{row.reference}</td>
                                  <td className={`px-4 py-3.5 align-top ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    <span className="font-medium block">{row.customer}</span>
                                    <span className={`text-xs block mt-0.5 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>{row.customerSub}</span>
                                  </td>
                                  <td className={`px-4 py-3.5 align-top ${isDark ? 'text-white/90' : 'text-slate-800'}`}>
                                    <span className="font-medium block">{row.packageTitle}</span>
                                    <span className={`text-xs block mt-0.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.packageSub}</span>
                                  </td>
                                  <td className={`px-4 py-3.5 font-mono align-top ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{row.recipient || '—'}</td>
                                  <td className={`px-4 py-3.5 font-semibold align-top ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>₵{row.amount}</td>
                                  <td className="px-4 py-3.5 align-top">{statusPill(row)}</td>
                                  <td className="px-4 py-3.5 align-top text-right">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Processing'}
                                        onClick={async () => {
                                          setAdminOrderStatusUpdating(row.id);
                                          try {
                                            await api.updateAdminOrderStatus(row.id, 'processing');
                                            setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'processing' } : o));
                                          } catch (err) {
                                            setAdminOrdersError(err?.message || 'Failed to update order');
                                          } finally {
                                            setAdminOrderStatusUpdating(null);
                                          }
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${isDark ? 'bg-sky-500/20 text-sky-300 disabled:opacity-40' : 'bg-sky-100 text-sky-800 disabled:opacity-40'}`}
                                      >
                                        Processing
                                      </button>
                                      <button
                                        type="button"
                                        disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Completed'}
                                        onClick={async () => {
                                          setAdminOrderStatusUpdating(row.id);
                                          try {
                                            await api.updateAdminOrderStatus(row.id, 'completed');
                                            setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'completed' } : o));
                                          } catch (err) {
                                            setAdminOrdersError(err?.message || 'Failed to update order');
                                          } finally {
                                            setAdminOrderStatusUpdating(null);
                                          }
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300 disabled:opacity-40' : 'bg-emerald-100 text-emerald-800 disabled:opacity-40'}`}
                                      >
                                        Completed
                                      </button>
                                      <button
                                        type="button"
                                        disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Failed'}
                                        onClick={async () => {
                                          setAdminOrderStatusUpdating(row.id);
                                          try {
                                            await api.updateAdminOrderStatus(row.id, 'failed');
                                            setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'failed' } : o));
                                          } catch (err) {
                                            setAdminOrdersError(err?.message || 'Failed to update order');
                                          } finally {
                                            setAdminOrderStatusUpdating(null);
                                          }
                                        }}
                                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${isDark ? 'bg-red-500/20 text-red-300 disabled:opacity-40' : 'bg-red-100 text-red-800 disabled:opacity-40'}`}
                                      >
                                        Failed
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className={`md:hidden divide-y max-h-[min(85vh,1200px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-200'}`}>
                          {filtered.map((row) => (
                            <div key={row.key} className={`p-4 space-y-3 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50/90'}`}>
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Order ID</p>
                                  <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.orderIdDisplay}</p>
                                </div>
                                {statusPill(row)}
                              </div>
                              <div>
                                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Reference</p>
                                <p className={`text-xs font-mono break-all ${isDark ? 'text-white/75' : 'text-slate-700'}`}>{row.reference}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Customer name</p>
                                <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.customer}</p>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>{row.customerSub}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Package</p>
                                <p className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.packageTitle}</p>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-white/55' : 'text-slate-600'}`}>{row.packageSub}</p>
                              </div>
                              <div className="flex flex-wrap gap-4 justify-between">
                                <div>
                                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Phone number</p>
                                  <p className={`font-mono text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.recipient || '—'}</p>
                                </div>
                                <div>
                                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-white/45' : 'text-slate-500'}`}>Amount (GHS)</p>
                                  <p className={`text-lg font-bold ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>₵{row.amount}</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Processing'}
                                  onClick={async () => {
                                    setAdminOrderStatusUpdating(row.id);
                                    try {
                                      await api.updateAdminOrderStatus(row.id, 'processing');
                                      setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'processing' } : o));
                                    } catch (err) {
                                      setAdminOrdersError(err?.message || 'Failed to update order');
                                    } finally {
                                      setAdminOrderStatusUpdating(null);
                                    }
                                  }}
                                  className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-300 disabled:opacity-40' : 'bg-sky-100 text-sky-800 disabled:opacity-40'}`}
                                >
                                  Processing
                                </button>
                                <button
                                  type="button"
                                  disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Completed'}
                                  onClick={async () => {
                                    setAdminOrderStatusUpdating(row.id);
                                    try {
                                      await api.updateAdminOrderStatus(row.id, 'completed');
                                      setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'completed' } : o));
                                    } catch (err) {
                                      setAdminOrdersError(err?.message || 'Failed to update order');
                                    } finally {
                                      setAdminOrderStatusUpdating(null);
                                    }
                                  }}
                                  className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300 disabled:opacity-40' : 'bg-emerald-100 text-emerald-800 disabled:opacity-40'}`}
                                >
                                  Completed
                                </button>
                                <button
                                  type="button"
                                  disabled={adminOrderStatusUpdating === row.id || row.statusLabel === 'Failed'}
                                  onClick={async () => {
                                    setAdminOrderStatusUpdating(row.id);
                                    try {
                                      await api.updateAdminOrderStatus(row.id, 'failed');
                                      setAdminOrders((prev) => prev.map((o) => String(o.id) === String(row.id) ? { ...o, status: 'failed' } : o));
                                    } catch (err) {
                                      setAdminOrdersError(err?.message || 'Failed to update order');
                                    } finally {
                                      setAdminOrderStatusUpdating(null);
                                    }
                                  }}
                                  className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-300 disabled:opacity-40' : 'bg-red-100 text-red-800 disabled:opacity-40'}`}
                                >
                                  Failed
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200'}`}>
                  <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>AFA Registrations ({agentApplications.length})</h2>
                  </div>
                  {agentApplicationsLoading ? (
                    <div className={`px-4 py-10 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading AFA registrations…</div>
                  ) : agentApplications.length === 0 ? (
                    <div className={`px-4 py-10 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>No AFA registrations yet.</div>
                  ) : (
                    <div className={`divide-y max-h-[480px] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                      {agentApplications.map((row) => (
                        <div key={row.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.full_name || '—'}</p>
                              <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.phone || '—'} · {row.ghana_card_number || '—'}</p>
                              <p className={`text-xs ${isDark ? 'text-white/40' : 'text-slate-500'}`}>{row.occupation || '—'} · DOB: {row.date_of_birth || '—'}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>₵{Number(row.payment_amount ?? 0).toFixed(2)}</p>
                              <p className={`text-xs capitalize ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{row.status || 'pending'}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await api.patchAgentApplication(row.id, { status: 'pending' });
                                  setAgentApplications((prev) => prev.map((x) => String(x.id) === String(row.id) ? updated : x));
                                } catch (err) {
                                  setAgentApplicationsError(err?.message || 'Failed to update AFA registration');
                                }
                              }}
                              className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-800'}`}
                            >
                              Pending
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await api.patchAgentApplication(row.id, { status: 'approved' });
                                  setAgentApplications((prev) => prev.map((x) => String(x.id) === String(row.id) ? updated : x));
                                } catch (err) {
                                  setAgentApplicationsError(err?.message || 'Failed to update AFA registration');
                                }
                              }}
                              className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await api.patchAgentApplication(row.id, { status: 'rejected' });
                                  setAgentApplications((prev) => prev.map((x) => String(x.id) === String(row.id) ? updated : x));
                                } catch (err) {
                                  setAgentApplicationsError(err?.message || 'Failed to update AFA registration');
                                }
                              }}
                              className={`px-2 py-2 rounded-lg text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800'}`}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentPage === 'admin-packages' && (
              <div className="space-y-4 pb-8">
                <p className={`text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Packages are stored on the server. Add, edit, or remove rows here — the dashboard and cart update for all users.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div
                    className={`relative flex gap-1 p-1.5 rounded-2xl overflow-x-auto overflow-y-hidden scrollbar-hide ${isDark ? 'bg-white/[0.07] backdrop-blur-xl border border-white/10' : 'bg-white/40 backdrop-blur-xl border border-white/20'}`}
                    role="tablist"
                    aria-label="Network for packages"
                  >
                    {[
                      { id: 'mtn', label: 'MTN' },
                      { id: 'telecel', label: 'Telecel' },
                      { id: 'bigtime', label: 'AT BigTime' },
                      { id: 'ishare', label: 'AT iShare' },
                    ].map((tab) => {
                      const isActive = adminPackagesNetwork === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setAdminPackagesNetwork(tab.id)}
                          className={`
                            relative flex-1 min-w-0 py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl text-sm sm:text-base font-semibold
                            transition-all duration-300 ease-out
                            ${isActive
                              ? isDark
                                ? 'bg-white text-black shadow-lg shadow-white/10'
                                : 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                              : isDark
                                ? 'text-white/50 hover:text-white/80 hover:bg-white/5'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                            }
                          `}
                        >
                          <span className="relative truncate block text-center tracking-tight">{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBundle({ network: adminPackagesNetwork, index: -1 });
                      setEditBundleForm({ size: '', price: 0 });
                      setAdminBundlesMessage(null);
                    }}
                    className={`shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
                  >
                    <Svg.Plus stroke="currentColor" />
                    Add package
                  </button>
                </div>
                <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm min-w-[320px]">
                      <thead>
                        <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                          <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Size</th>
                          <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Price (¢)</th>
                          <th className={`px-4 py-3 font-medium text-right ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const list = (bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData : defaultBundles)[adminPackagesNetwork] || [];
                          if (list.length === 0) {
                            return (
                              <tr>
                                <td colSpan={3} className={`px-4 py-8 text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                                  No packages for {networkLabel(adminPackagesNetwork)}. Add one above.
                                </td>
                              </tr>
                            );
                          }
                          return list.map((bundle, index) => (
                            <tr key={`${adminPackagesNetwork}-${index}-${bundle.size}`} className={`border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                              <td className={`px-4 py-3 font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{bundle.size}</td>
                              <td className={`px-4 py-3 ${isDark ? 'text-white/90' : 'text-slate-700'}`}>¢ {bundle.price}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingBundle({ network: adminPackagesNetwork, index });
                                    setEditBundleForm({
                                      size: bundle.size,
                                      price: typeof bundle.price === 'number' ? bundle.price : parseFloat(bundle.price) || 0,
                                    });
                                    setAdminBundlesMessage(null);
                                  }}
                                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {currentPage === 'admin-all-transactions' && (
              <div className="space-y-4 pb-8">
                <p className={`text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  All customer wallet activity: top-ups (credits) and bundle payments (debits), with dates and users when the API provides them.
                </p>
                <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 ${isDark ? 'bg-sky-500/10 border-sky-500/30 text-sky-100' : 'bg-sky-50 border-sky-200 text-sky-900'}`}>
                  <p className="text-xs sm:text-sm">
                    This page is only for wallet transaction history. To approve order delivery, open <span className="font-semibold">Order Management</span> and use the Processing/Completed/Failed action buttons.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage('admin-orders');
                      setSelectedMenu('admin-orders');
                    }}
                    className={`shrink-0 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold ${isDark ? 'bg-sky-400/25 text-sky-100 hover:bg-sky-400/35' : 'bg-sky-100 text-sky-900 hover:bg-sky-200'}`}
                  >
                    Go to Order Management
                  </button>
                </div>

                {adminAllTxError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {adminAllTxError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <input
                    type="search"
                    value={adminAllTxSearch}
                    onChange={(e) => setAdminAllTxSearch(e.target.value)}
                    placeholder="Search by user, reference, type, amount…"
                    className={`flex-1 min-w-0 px-4 py-3 rounded-xl border text-sm placeholder:opacity-70 ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/45' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    aria-label="Search all transactions"
                  />
                  <button
                    type="button"
                    disabled={adminAllTxLoading}
                    onClick={() => {
                      setAdminAllTxLoading(true);
                      setAdminAllTxError(null);
                      api.getAdminTransactions()
                        .then((list) => setAdminAllTransactions(Array.isArray(list) ? list : []))
                        .catch((err) => {
                          setAdminAllTxError(err?.message || 'Failed to load transactions');
                          setAdminAllTransactions([]);
                        })
                        .finally(() => setAdminAllTxLoading(false));
                    }}
                    className={`shrink-0 px-4 py-3 rounded-xl text-sm font-semibold ${isDark ? 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50'}`}
                  >
                    {adminAllTxLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {(() => {
                  const rows = (adminAllTransactions || []).map(normalizeAdminTxRow);
                  const sorted = [...rows].sort((a, b) => b.time - a.time);
                  const q = (adminAllTxSearch || '').trim().toLowerCase();
                  const filtered = !q
                    ? sorted
                    : sorted.filter((r) => {
                        const blob = [r.userLine, r.reference, r.narration, r.type, r.statusLabel, String(r.amount)].join(' ').toLowerCase();
                        return blob.includes(q);
                      });
                  const totalCredits = sorted.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
                  const totalDebts = sorted.reduce((s, r) => s + (r.amount < 0 ? Math.abs(r.amount) : 0), 0);
                  const net = sorted.reduce((s, r) => s + r.amount, 0);
                  const typeLabel = (r) => (r.type === 'topup' ? 'Top-up' : r.type === 'payment' ? 'Payment' : r.type || '—');
                  const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
                  const statusPill = (row) =>
                    row.statusLabel === 'Completed' ? (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}>Completed</span>
                    ) : row.statusLabel === 'Failed' ? (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800'}`}>Failed</span>
                    ) : (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-100 text-sky-800'}`}>{row.statusLabel}</span>
                    );

                  return (
                    <>
                      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4`}>
                        {[
                          { label: 'Total transactions', value: String(sorted.length), key: 'count' },
                          { label: 'Total credits (¢)', value: fmt(totalCredits), key: 'cred', accent: 'text-emerald-500' },
                          { label: 'Total debits (¢)', value: fmt(totalDebts), key: 'deb', accent: 'text-red-500' },
                          { label: 'Net (¢)', value: `${net >= 0 ? '+' : ''}${fmt(net)}`, key: 'net', accent: net >= 0 ? 'text-emerald-400' : 'text-red-400' },
                        ].map(({ label, value, key, accent }) => (
                          <div key={key} className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                            <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{label}</p>
                            <p className={`text-xl sm:text-2xl font-bold ${accent || ''} ${isDark && !accent ? 'text-white' : !accent ? 'text-slate-900' : ''}`}>{value}</p>
                          </div>
                        ))}
                      </div>

                      <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200'}`}>
                        <div className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}>
                          <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            Activity ({filtered.length}{q ? ` of ${sorted.length}` : ''})
                          </h2>
                        </div>
                        {adminAllTxLoading && sorted.length === 0 ? (
                          <div className={`px-4 py-12 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading transactions…</div>
                        ) : filtered.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm max-w-md mx-auto ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                            <p className={`font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-700'}`}>
                              {sorted.length === 0 && !adminAllTxError ? 'No transactions yet' : 'No matching rows'}
                            </p>
                            <p className="text-xs leading-relaxed">
                              {sorted.length === 0 && !adminAllTxError
                                ? 'Customer top-ups and wallet payments will appear here once your backend records them.'
                                : 'Try another search term.'}
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="hidden lg:block overflow-x-auto max-h-[min(75vh,900px)] overflow-y-auto">
                              <table className="w-full text-left text-sm min-w-[880px]">
                                <thead className={`sticky top-0 z-[1] ${isDark ? 'bg-zinc-900/95 border-b border-white/10' : 'bg-slate-100 border-b border-slate-200'}`}>
                                  <tr>
                                    <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Date</th>
                                    <th className={`px-4 py-3 font-semibold ${isDark ? 'text-white/90' : 'text-slate-800'}`}>User</th>
                                    <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Type</th>
                                    <th className={`px-4 py-3 font-semibold min-w-[160px] ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Narration</th>
                                    <th className={`px-4 py-3 font-semibold ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Reference</th>
                                    <th className={`px-4 py-3 font-semibold text-right whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Amount (¢)</th>
                                    <th className={`px-4 py-3 font-semibold whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>Status</th>
                                  </tr>
                                </thead>
                                <tbody className={isDark ? 'divide-y divide-white/10' : 'divide-y divide-slate-200'}>
                                  {filtered.map((row) => (
                                    <tr key={row.key} className={isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}>
                                      <td className={`px-4 py-3.5 align-top whitespace-nowrap ${isDark ? 'text-white/90' : 'text-slate-800'}`}>
                                        {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                                      </td>
                                      <td className={`px-4 py-3.5 align-top text-sm ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{row.userLine}</td>
                                      <td className={`px-4 py-3.5 align-top ${isDark ? 'text-white/90' : 'text-slate-800'}`}>{typeLabel(row)}</td>
                                      <td className={`px-4 py-3.5 align-top ${isDark ? 'text-white/75' : 'text-slate-600'}`}>{row.narration}</td>
                                      <td className={`px-4 py-3.5 align-top font-mono text-xs break-all max-w-[140px] ${isDark ? 'text-white/60' : 'text-slate-600'}`}>{row.reference || '—'}</td>
                                      <td className={`px-4 py-3.5 align-top text-right font-semibold ${row.amount >= 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                                        {row.amount >= 0 ? '+' : '−'}¢ {Math.abs(row.amount).toFixed(2)}
                                      </td>
                                      <td className="px-4 py-3.5 align-top">{statusPill(row)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className={`lg:hidden divide-y max-h-[min(75vh,900px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-200'}`}>
                              {filtered.map((row) => (
                                <div key={row.key} className={`p-4 space-y-2 ${isDark ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50/90'}`}>
                                  <div className="flex flex-wrap justify-between gap-2">
                                    <span className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</span>
                                    {statusPill(row)}
                                  </div>
                                  <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.userLine}</p>
                                  <p className={`text-xs ${isDark ? 'text-white/55' : 'text-slate-600'}`}>
                                    {typeLabel(row)} · {row.narration}
                                  </p>
                                  {row.reference ? (
                                    <p className={`text-xs font-mono break-all ${isDark ? 'text-white/45' : 'text-slate-500'}`}>{row.reference}</p>
                                  ) : null}
                                  <p className={`text-lg font-bold ${row.amount >= 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                                    {row.amount >= 0 ? '+' : '−'}¢ {Math.abs(row.amount).toFixed(2)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {currentPage === 'admin-wallet' && (
              <div className="space-y-4 pb-8">
                {adminWalletsError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {adminWalletsError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                  <input
                    type="search"
                    value={adminWalletsSearch}
                    onChange={(e) => setAdminWalletsSearch(e.target.value)}
                    placeholder="Search by name, email, or user ID…"
                    className={`flex-1 min-w-0 px-4 py-3 rounded-xl border text-sm placeholder:opacity-70 ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/45' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                    aria-label="Search wallets"
                  />
                  <button
                    type="button"
                    disabled={adminWalletsLoading}
                    onClick={() => {
                      setAdminWalletsLoading(true);
                      setAdminWalletsError(null);
                      api.getAdminWallets()
                        .then((list) => setAdminWallets(Array.isArray(list) ? list : []))
                        .catch((err) => {
                          setAdminWalletsError(err?.message || 'Failed to load wallets');
                          setAdminWallets([]);
                        })
                        .finally(() => setAdminWalletsLoading(false));
                    }}
                    className={`shrink-0 px-4 py-3 rounded-xl text-sm font-semibold ${isDark ? 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50'}`}
                  >
                    {adminWalletsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {(() => {
                  const fmtWalletDate = (iso) => {
                    if (!iso) return '—';
                    const t = Date.parse(iso);
                    if (Number.isNaN(t)) return '—';
                    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  };
                  const q = (adminWalletsSearch || '').trim().toLowerCase();
                  const base = Array.isArray(adminWallets) ? adminWallets : [];
                  const filtered = !q
                    ? base
                    : base.filter((w) => {
                        const blob = [w.full_name, w.email, String(w.id ?? '')].join(' ').toLowerCase();
                        return blob.includes(q);
                      });
                  const count = filtered.length;
                  const balNum = (b) => (typeof b === 'number' ? b : parseFloat(b)) || 0;

                  return (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'}`}>
                          <Svg.Wallet stroke="currentColor" />
                        </div>
                        <div className="min-w-0">
                          <h2 className={`text-lg sm:text-xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            User Wallets ({count})
                          </h2>
                          <p className={`text-xs sm:text-sm ${isDark ? 'text-white/55' : 'text-slate-500'}`}>
                            Balances in ₵ (same units as the app). Credit and debit are recorded for All Transactions.
                          </p>
                        </div>
                      </div>

                      <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className={`hidden md:grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide border-b ${isDark ? 'border-white/10 bg-white/[0.06] text-white/50' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                          <div className="col-span-4">User details</div>
                          <div className="col-span-2 text-center">Balance</div>
                          <div className="col-span-2">Created</div>
                          <div className="col-span-2">Last updated</div>
                          <div className="col-span-2 text-right">Actions</div>
                        </div>

                        {adminWalletsLoading && base.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading wallets…</div>
                        ) : filtered.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                            {base.length === 0 ? 'No users yet.' : 'No matching users.'}
                          </div>
                        ) : (
                          <div className={`divide-y max-h-[min(78vh,920px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                            {filtered.map((w) => {
                              const name = (w.full_name || '').trim() || 'Unknown User';
                              const email = (w.email || '').trim() || 'Unknown';
                              const created = fmtWalletDate(w.created_at);
                              const updated = fmtWalletDate(w.wallet_updated_at);
                              const bal = balNum(w.balance);
                              return (
                                <div key={w.id}>
                                  <div className={`hidden md:grid grid-cols-12 gap-2 items-center px-4 py-4 ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}`}>
                                    <div className="col-span-4 min-w-0">
                                      <p className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{name}</p>
                                      <p className={`text-xs mt-0.5 flex items-center gap-1 truncate ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                                        <span aria-hidden>✉</span>
                                        <span className="truncate">{email}</span>
                                      </p>
                                      <p className={`text-[11px] mt-0.5 font-mono ${isDark ? 'text-white/35' : 'text-slate-400'}`}>User ID: {w.id}</p>
                                    </div>
                                    <div className="col-span-2 flex justify-center">
                                      <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white bg-violet-600 shadow-sm">
                                        ₵{bal.toFixed(2)}
                                      </span>
                                    </div>
                                    <div className={`col-span-2 text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>{created}</div>
                                    <div className={`col-span-2 text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>{updated}</div>
                                    <div className="col-span-2 flex justify-end gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWalletAdjust({ row: w, mode: 'credit' });
                                          setWalletAdjustAmount('');
                                          setWalletAdjustError(null);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors"
                                      >
                                        <Svg.Plus stroke="currentColor" className="w-3.5 h-3.5" /> Credit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWalletAdjust({ row: w, mode: 'debit' });
                                          setWalletAdjustAmount('');
                                          setWalletAdjustError(null);
                                        }}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                                      >
                                        − Debit
                                      </button>
                                    </div>
                                  </div>
                                  <div className={`md:hidden p-4 space-y-3 ${isDark ? 'border-b border-white/10' : 'border-b border-slate-100'}`}>
                                    <div className="flex justify-between items-start gap-3">
                                      <div className="min-w-0 flex-1">
                                        <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{name}</p>
                                        <p className={`text-xs mt-1 flex items-center gap-1 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>
                                          <span aria-hidden>✉</span>
                                          <span className="break-all">{email}</span>
                                        </p>
                                        <p className={`text-[11px] mt-0.5 font-mono ${isDark ? 'text-white/35' : 'text-slate-400'}`}>User ID: {w.id}</p>
                                      </div>
                                      <span className="inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold text-white bg-violet-600 shadow-sm">
                                        ₵{bal.toFixed(2)}
                                      </span>
                                    </div>
                                    <div className={`grid grid-cols-2 gap-2 text-xs ${isDark ? 'text-white/55' : 'text-slate-500'}`}>
                                      <div>
                                        <span className="font-medium opacity-80">Created</span>
                                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}>{created}</p>
                                      </div>
                                      <div>
                                        <span className="font-medium opacity-80">Last updated</span>
                                        <p className={isDark ? 'text-white/80' : 'text-slate-700'}>{updated}</p>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWalletAdjust({ row: w, mode: 'credit' });
                                          setWalletAdjustAmount('');
                                          setWalletAdjustError(null);
                                        }}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500"
                                      >
                                        <Svg.Plus stroke="currentColor" className="w-4 h-4" /> Credit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWalletAdjust({ row: w, mode: 'debit' });
                                          setWalletAdjustAmount('');
                                          setWalletAdjustError(null);
                                        }}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600"
                                      >
                                        − Debit
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {walletAdjust != null && (
                  <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!walletAdjustSaving) setWalletAdjust(null); }} aria-hidden="true" />
                    <div className={`relative w-full max-w-sm rounded-2xl p-5 sm:p-6 shadow-2xl ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
                      <h3 className={`text-lg font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {walletAdjust.mode === 'credit' ? 'Credit wallet' : 'Debit wallet'}
                      </h3>
                      <p className={`text-sm mb-4 ${isDark ? 'text-white/65' : 'text-slate-600'}`}>
                        {(walletAdjust.row.full_name || 'User').trim() || 'User'} · {(walletAdjust.row.email || '').trim() || '—'}
                      </p>
                      <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/90' : 'text-slate-700'}`}>Amount (₵)</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={walletAdjustAmount}
                        onChange={(e) => setWalletAdjustAmount(e.target.value)}
                        className={`w-full px-4 py-2.5 rounded-xl border text-base mb-3 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                        placeholder="0.00"
                        autoFocus
                      />
                      {walletAdjustError && (
                        <p className={`text-sm mb-3 ${isDark ? 'text-red-400' : 'text-red-600'}`}>{walletAdjustError}</p>
                      )}
                      <div className="flex gap-3 mt-2">
                        <button
                          type="button"
                          disabled={walletAdjustSaving}
                          onClick={() => { if (!walletAdjustSaving) setWalletAdjust(null); }}
                          className={`flex-1 py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={walletAdjustSaving}
                          onClick={async () => {
                            const amt = parseFloat(walletAdjustAmount);
                            if (!Number.isFinite(amt) || amt <= 0) {
                              setWalletAdjustError('Enter a valid amount greater than 0.');
                              return;
                            }
                            setWalletAdjustSaving(true);
                            setWalletAdjustError(null);
                            try {
                              const uid = walletAdjust.row.id;
                              const data =
                                walletAdjust.mode === 'credit'
                                  ? await api.adminWalletCredit(uid, amt)
                                  : await api.adminWalletDebit(uid, amt);
                              setAdminWallets((prev) =>
                                prev.map((x) =>
                                  x.id === uid
                                    ? { ...x, balance: data.balance, wallet_updated_at: data.updated_at || x.wallet_updated_at }
                                    : x
                                )
                              );
                              setWalletAdjust(null);
                            } catch (err) {
                              setWalletAdjustError(err?.message || 'Request failed');
                            } finally {
                              setWalletAdjustSaving(false);
                            }
                          }}
                          className={`flex-1 py-2.5 rounded-xl font-semibold text-white ${walletAdjust.mode === 'credit' ? 'bg-violet-600 hover:bg-violet-500' : 'bg-red-500 hover:bg-red-600'} disabled:opacity-50`}
                        >
                          {walletAdjustSaving ? 'Saving…' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentPage === 'admin-applications' && (
              <div className="space-y-4 pb-8">
                {agentApplicationsError && (
                  <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-amber-500/15 border border-amber-500/30 text-amber-100' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                    {agentApplicationsError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="relative flex-1 min-w-0">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-white/40' : 'text-slate-400'}`} aria-hidden>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      value={agentApplicationsSearch}
                      onChange={(e) => setAgentApplicationsSearch(e.target.value)}
                      placeholder="Search by name, phone, status, or pay"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm placeholder:opacity-70 ${isDark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/45' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                      aria-label="Search applications"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={agentApplicationsLoading}
                    onClick={() => {
                      setAgentApplicationsLoading(true);
                      setAgentApplicationsError(null);
                      api
                        .getAgentApplications()
                        .then((list) => setAgentApplications(Array.isArray(list) ? list : []))
                        .catch((err) => {
                          setAgentApplicationsError(err?.message || 'Failed to load applications');
                          setAgentApplications([]);
                        })
                        .finally(() => setAgentApplicationsLoading(false));
                    }}
                    className={`shrink-0 px-4 py-3 rounded-xl text-sm font-semibold ${isDark ? 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50'}`}
                  >
                    {agentApplicationsLoading ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                {(() => {
                  const shortId = (id) => {
                    const s = String(id || '').replace(/-/g, '');
                    if (s.length <= 8) return s || '—';
                    return `${s.slice(0, 8)}…`;
                  };
                  const fmtApplied = (iso) => {
                    if (!iso) return '—';
                    const t = Date.parse(iso);
                    if (Number.isNaN(t)) return '—';
                    return new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  };
                  const q = (agentApplicationsSearch || '').trim().toLowerCase();
                  const base = Array.isArray(agentApplications) ? agentApplications : [];
                  const filtered = !q
                    ? base
                    : base.filter((row) => {
                        const name = (row.full_name || '').toLowerCase();
                        const phone = (row.phone || '').toLowerCase().replace(/\s/g, '');
                        const st = (row.status || '').toLowerCase();
                        const pay = String(row.payment_amount ?? '');
                        const qDigits = q.replace(/\D/g, '');
                        return (
                          name.includes(q) ||
                          phone.includes(q.replace(/\s/g, '')) ||
                          st.includes(q) ||
                          pay.includes(q) ||
                          (qDigits && phone.replace(/\D/g, '').includes(qDigits))
                        );
                      });
                  const statusBadge = (st) => {
                    const s = (st || 'pending').toLowerCase();
                    if (s === 'approved') {
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isDark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-800'}`}>
                          approved
                        </span>
                      );
                    }
                    if (s === 'rejected') {
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isDark ? 'bg-red-500/20 text-red-200' : 'bg-red-100 text-red-800'}`}>
                          rejected
                        </span>
                      );
                    }
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isDark ? 'bg-sky-500/20 text-sky-200' : 'bg-sky-100 text-sky-800'}`}>
                        <Svg.Clock stroke="currentColor" className="w-3 h-3 shrink-0" />
                        pending
                      </span>
                    );
                  };

                  return (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex items-center justify-center w-11 h-11 rounded-xl shrink-0 ${isDark ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'}`}>
                          <Svg.User stroke="currentColor" />
                        </div>
                        <div className="min-w-0">
                          <h2 className={`text-lg sm:text-xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            Applications ({base.length})
                          </h2>
                        </div>
                      </div>

                      <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className={`hidden md:grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold border-b ${isDark ? 'border-white/10 bg-white/[0.06] text-white/50' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                          <div className="col-span-4">Applicant</div>
                          <div className="col-span-2">Contact</div>
                          <div className="col-span-2">Payment</div>
                          <div className="col-span-2">Applied</div>
                          <div className="col-span-2 text-right">Actions</div>
                        </div>

                        {agentApplicationsLoading && base.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Loading applications…</div>
                        ) : filtered.length === 0 ? (
                          <div className={`px-4 py-14 text-center text-sm ${isDark ? 'text-white/50' : 'text-slate-500'}`}>
                            {base.length === 0 ? 'No applications yet.' : 'No matching applications.'}
                          </div>
                        ) : (
                          <div className={`divide-y max-h-[min(78vh,920px)] overflow-y-auto ${isDark ? 'divide-white/10' : 'divide-slate-100'}`}>
                            {filtered.map((row) => (
                              <div key={row.id}>
                                <div className={`hidden md:grid grid-cols-12 gap-2 items-center px-4 py-4 ${isDark ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'}`}>
                                  <div className="col-span-4 min-w-0">
                                    <p className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{(row.full_name || '').trim() || '—'}</p>
                                    <p className={`text-xs mt-0.5 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>ID: {shortId(row.id)}</p>
                                  </div>
                                  <div className={`col-span-2 text-sm font-mono ${isDark ? 'text-white/85' : 'text-slate-800'}`}>{row.phone || '—'}</div>
                                  <div className="col-span-2">
                                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>₵{Number(row.payment_amount ?? 0).toFixed(0)}</p>
                                    <div className="mt-1">{statusBadge(row.status)}</div>
                                  </div>
                                  <div className={`col-span-2 text-sm ${isDark ? 'text-white/70' : 'text-slate-600'}`}>{fmtApplied(row.applied_at)}</div>
                                  <div className="col-span-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAgentAppReview(row);
                                        setAgentAppReviewError(null);
                                      }}
                                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${isDark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                        <circle cx="12" cy="12" r="3" />
                                      </svg>
                                      Review
                                    </button>
                                  </div>
                                </div>
                                <div className={`md:hidden p-4 space-y-3 ${isDark ? 'border-b border-white/10' : 'border-b border-slate-100'}`}>
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <p className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{(row.full_name || '').trim() || '—'}</p>
                                      <p className={`text-xs mt-0.5 ${isDark ? 'text-white/45' : 'text-slate-500'}`}>ID: {shortId(row.id)}</p>
                                    </div>
                                    {statusBadge(row.status)}
                                  </div>
                                  <p className={`text-sm font-mono ${isDark ? 'text-white/80' : 'text-slate-700'}`}>{row.phone || '—'}</p>
                                  <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>₵{Number(row.payment_amount ?? 0).toFixed(0)}</p>
                                  <p className={`text-xs ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Applied {fmtApplied(row.applied_at)}</p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAgentAppReview(row);
                                      setAgentAppReviewError(null);
                                    }}
                                    className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border ${isDark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                    Review
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {agentAppReview != null && (
                  <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!agentAppReviewSaving) setAgentAppReview(null); }} aria-hidden="true" />
                    <div className={`relative w-full max-w-md rounded-2xl p-5 sm:p-6 shadow-2xl ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
                      <h3 className={`text-lg font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Review application</h3>
                      <p className={`text-sm mb-4 ${isDark ? 'text-white/65' : 'text-slate-600'}`}>
                        {(agentAppReview.full_name || '').trim() || 'Applicant'} · {agentAppReview.phone || '—'}
                      </p>
                      <dl className={`space-y-2 text-sm mb-4 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Ghana card</dt>
                          <dd className="font-medium">{agentAppReview.ghana_card_number || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Occupation</dt>
                          <dd className="font-medium">{agentAppReview.occupation || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Date of birth</dt>
                          <dd className="font-medium">{agentAppReview.date_of_birth || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Payment</dt>
                          <dd className="font-semibold">₵{Number(agentAppReview.payment_amount ?? 0).toFixed(0)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Applied</dt>
                          <dd>{agentAppReview.applied_at ? new Date(agentAppReview.applied_at).toLocaleString() : '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className={isDark ? 'text-white/50' : 'text-slate-500'}>Status</dt>
                          <dd className="capitalize">{agentAppReview.status || 'pending'}</dd>
                        </div>
                      </dl>
                      {agentAppReviewError && (
                        <p className={`text-sm mb-3 ${isDark ? 'text-red-400' : 'text-red-600'}`}>{agentAppReviewError}</p>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <button
                          type="button"
                          disabled={agentAppReviewSaving}
                          onClick={() => { if (!agentAppReviewSaving) setAgentAppReview(null); }}
                          className={`flex-1 py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                        >
                          Close
                        </button>
                        <button
                          type="button"
                          disabled={agentAppReviewSaving || (agentAppReview.status || '').toLowerCase() === 'approved'}
                          onClick={async () => {
                            setAgentAppReviewSaving(true);
                            setAgentAppReviewError(null);
                            try {
                              const updated = await api.patchAgentApplication(agentAppReview.id, { status: 'approved' });
                              setAgentApplications((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? { ...x, ...updated } : x)));
                              setAgentAppReview(null);
                            } catch (err) {
                              setAgentAppReviewError(err?.message || 'Request failed');
                            } finally {
                              setAgentAppReviewSaving(false);
                            }
                          }}
                          className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {agentAppReviewSaving ? 'Saving…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          disabled={agentAppReviewSaving || (agentAppReview.status || '').toLowerCase() === 'rejected'}
                          onClick={async () => {
                            setAgentAppReviewSaving(true);
                            setAgentAppReviewError(null);
                            try {
                              const updated = await api.patchAgentApplication(agentAppReview.id, { status: 'rejected' });
                              setAgentApplications((prev) => prev.map((x) => (String(x.id) === String(updated.id) ? { ...x, ...updated } : x)));
                              setAgentAppReview(null);
                            } catch (err) {
                              setAgentAppReviewError(err?.message || 'Request failed');
                            } finally {
                              setAgentAppReviewSaving(false);
                            }
                          }}
                          className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!['admin', 'admin-analytics', 'admin-users', 'admin-orders', 'admin-packages', 'admin-all-transactions', 'admin-wallet', 'admin-applications'].includes(currentPage) && (
              <div className={`rounded-xl sm:rounded-2xl p-8 text-center border ${isDark ? 'bg-white/5 border-white/10 text-white/70' : 'bg-white border-slate-200 text-slate-500'}`}>
                <p className="text-base">Details for this section will be added here.</p>
              </div>
            )}

            {currentPage === 'admin-analytics' && adminStatsLoading ? (
              <div className={`rounded-xl p-8 text-center ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Loading admin stats…</div>
            ) : currentPage === 'admin-analytics' && adminStats ? (
              <>
                <section className="mb-8">
                  <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>Today&apos;s overview</h2>
                  <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4 mb-4`}>
                    {[
                      { label: 'Daily orders', value: adminStats.dailyOrders ?? 0, key: 'dailyOrders' },
                      { label: 'Processing (today)', value: adminStats.dailyProcessing ?? 0, key: 'dailyProcessing' },
                      { label: 'Completed (today)', value: adminStats.dailyCompleted ?? 0, key: 'dailyCompleted' },
                      { label: 'Daily revenue (¢)', value: Number(adminStats.dailyRevenue ?? 0).toFixed(2), key: 'dailyRevenue' },
                      { label: 'Daily transactions', value: adminStats.dailyTransactionCount ?? 0, key: 'dailyTx' },
                      { label: 'Net flow (¢)', value: Number(adminStats.dailyNetFlow ?? 0).toFixed(2), key: 'dailyNetFlow' },
                      { label: 'Credits in (¢)', value: Number(adminStats.dailyTopUps ?? 0).toFixed(2), key: 'dailyCredits' },
                    ].map(({ label, value, key }) => (
                      <div key={key} className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{label}</p>
                        <p className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="mb-8">
                  <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>All-time analysis</h2>
                  <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4 mb-4`}>
                    {[
                      { label: 'Total users', value: adminStats.userCount ?? 0, key: 'users' },
                      { label: 'Total orders', value: adminStats.orderCount ?? 0, key: 'orders' },
                      { label: 'Processing', value: adminStats.processingOrders ?? 0, key: 'processing' },
                      { label: 'Completed', value: adminStats.completedOrders ?? 0, key: 'completed' },
                      { label: 'Revenue (¢)', value: Number(adminStats.totalRevenue ?? 0).toFixed(2), key: 'revenue' },
                      { label: 'Top-ups / credits (¢)', value: Number(adminStats.totalTopUps ?? 0).toFixed(2), key: 'topups' },
                      { label: 'Total wallet balance (¢)', value: Number(adminTotalWalletBalance ?? 0).toFixed(2), key: 'walletBal' },
                      { label: 'Data packages sold', value: adminStats.orderCount ?? 0, key: 'packages' },
                      { label: 'Admins', value: adminStats.adminCount ?? 0, key: 'admins' },
                    ].map(({ label, value, key }) => (
                      <div key={key} className={`rounded-xl sm:rounded-2xl p-4 sm:p-5 border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <p className={`text-xs font-medium uppercase tracking-wider mb-1 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{label}</p>
                        <p className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <h2 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>Recent users</h2>
                <div className={`rounded-xl sm:rounded-2xl overflow-hidden border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                  {!recentUsersExpanded ? (
                    <div className={`px-4 py-4 flex items-center justify-between gap-4 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                      <span className="text-sm">
                        {adminUsers.length === 0 ? 'No users' : `${adminUsers.length} user${adminUsers.length === 1 ? '' : 's'}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRecentUsersExpanded(true)}
                        className={`text-sm font-medium underline underline-offset-2 ${isDark ? 'text-white hover:text-white/90' : 'text-slate-700 hover:text-slate-900'}`}
                      >
                        See all
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={`overflow-x-auto`}>
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className={`border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Email</th>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Name</th>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Role</th>
                              <th className={`px-4 py-3 font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Joined</th>
                            </tr>
                          </thead>
                          <tbody>
                            {adminUsers.length === 0 ? (
                              <tr><td colSpan={4} className={`px-4 py-6 text-center ${isDark ? 'text-white/50' : 'text-slate-500'}`}>No users</td></tr>
                            ) : (
                              adminUsers.map((u) => (
                                <tr key={u.id} className={`border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                  <td className={`px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.email}</td>
                                  <td className={`px-4 py-3 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{u.full_name || '—'}</td>
                                  <td className={`px-4 py-3 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>{u.role || 'user'}</td>
                                  <td className={`px-4 py-3 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className={`px-4 py-2 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <button
                          type="button"
                          onClick={() => setRecentUsersExpanded(false)}
                          className={`text-sm font-medium underline underline-offset-2 ${isDark ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                          Show less
                        </button>
                      </div>
                    </>
                  )}
                </div>

              </>
            ) : null}

            {currentPage === 'admin' && (
              <div className={`rounded-xl sm:rounded-2xl border overflow-hidden ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                <div className={`px-4 sm:px-5 py-3 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <h3 className={`text-base sm:text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>X2S2 Chatbox</h3>
                  <p className={`text-sm ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Same chat-style control panel inside ULTRAXAS MODE.</p>
                </div>
                <div className={`h-[340px] sm:h-[420px] overflow-y-auto px-4 py-3 space-y-2 ${isDark ? 'bg-black/20' : 'bg-slate-50/70'}`}>
                  {ultraxasChatMessages.map((m) => (
                    <div key={m.id} className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'ml-auto bg-blue-600 text-white' : (isDark ? 'bg-white/10 text-white' : 'bg-white border border-slate-200 text-slate-800')}`}>
                      {m.text}
                    </div>
                  ))}
                  {ultraxasChatSending && (
                    <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${isDark ? 'bg-white/10 text-white/80' : 'bg-white border border-slate-200 text-slate-600'}`}>
                      Typing...
                    </div>
                  )}
                </div>
                <div className={`p-3 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <div className="telesopy-chat-row">
                    <div className="telesopy-grid-btn-wrap">
                      <input
                        ref={ultraxasFileInputRef}
                        type="file"
                        accept="image/*"
                        className="telesopy-file-input"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setUltraxasChatMessages((prev) => [...prev, { id: `u-file-${Date.now()}`, role: 'user', text: `Uploaded: ${f.name}` }]);
                          e.target.value = '';
                        }}
                      />
                      <button type="button" className="telesopy-sidebar-btn" aria-label="Upload image" onClick={handleUltraxasUploadClick}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                    </div>
                    <div className="telesopy-chat-bar-wrap">
                      <UltraxasChatBar
                        value={ultraxasChatInput}
                        onChange={setUltraxasChatInput}
                        onSubmit={sendUltraxasChatMessage}
                        placeholder="Ask anything"
                        disabled={ultraxasChatSending}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="pt-14 sm:pt-20 pb-5 sm:pb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="page-title text-2xl sm:text-3xl truncate">Profile</h1>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage('dashboard')}
                className={`flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
                aria-label="Back to dashboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3" />
                </svg>
              </button>
            </div>

            <div className="mb-5 sm:mb-6">
              <h2 className={`text-2xl sm:text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>My Profile</h2>
              <p className={`text-base ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Manage your account settings and preferences</p>
            </div>

            <div className={`rounded-xl sm:rounded-2xl overflow-hidden mb-5 sm:mb-6 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
              <div className={`p-5 sm:p-6 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <h3 className={`text-xl font-semibold mb-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>Profile Information</h3>
                <p className={`text-sm ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Update your account's profile information and email address.</p>
              </div>
              <div className="p-5 sm:p-6 flex flex-col items-center">
                <div className="relative mb-4">
                  <div
                    className={`w-40 h-40 sm:w-48 sm:h-48 rounded-full flex items-center justify-center text-white text-4xl sm:text-5xl font-bold shadow-lg overflow-hidden cursor-pointer ${adminAvatarSrc ? 'bg-gradient-to-br from-blue-500 to-purple-600' : (isDark ? 'bg-white/5 border-2 border-dashed border-white/25' : 'bg-slate-100 border-2 border-dashed border-slate-300')}`}
                    onClick={triggerFileInput}
                  >
                    {adminAvatarSrc ? (
                      <img src={adminAvatarSrc} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className={`text-sm font-semibold ${isDark ? 'text-white/80' : 'text-slate-500'}`}>No photo</span>
                        <span className={`text-xs ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Tap + to upload</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="absolute bottom-0 right-0 w-10 h-10 rounded-full flex items-center justify-center border-2 border-white shadow cursor-pointer bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    onClick={(e) => { e.stopPropagation(); triggerFileInput(); }}
                    aria-label="Add or change photo"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>
                </div>
                <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{hasAdminRole && adminRoute ? adminDisplayName(user?.full_name) : (user?.full_name || user?.email || 'User')}</h3>
                <p className={`text-base ${isDark ? 'text-white/70' : 'text-slate-500'}`}>{hasAdminRole && adminRoute ? 'Administrator' : 'Account'}</p>
              </div>
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">
                {[
                  ['Full Name', hasAdminRole && adminRoute ? adminDisplayName(user?.full_name) : (user?.full_name || '—')],
                  ['Email Address', user?.email || '—'],
                  ['Phone Number', user?.phone || '—'],
                  ['User ID', profileUserId],
                  ['Account Status', 'Active'],
                  ['Member Since', (() => {
                    if (!user?.created_at) return '—';
                    const d = new Date(user.created_at);
                    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
                  })()],
                ].map(([label, value], i) => (
                  <div key={i}>
                    <p className={`text-sm font-medium mb-1.5 ${isDark ? 'text-white/70' : 'text-slate-500'}`}>{label}</p>
                    <p className={`text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</p>
                  </div>
                ))}
                <div className="pt-5 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileEditFullName(hasAdminRole && adminRoute ? adminDisplayName(user?.full_name) : (user?.full_name || ''));
                      setProfileEditEmail(user?.email || '');
                      setProfileEditPhone(user?.phone || '');
                      setProfileEditError(null);
                      setEditProfileOpen(true);
                    }}
                    className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base transition-colors flex items-center justify-center gap-2"
                  >
                    <Svg.Edit stroke="currentColor" /> EDIT PROFILE
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordCurrent('');
                      setPasswordNew('');
                      setPasswordConfirm('');
                      setPasswordError(null);
                      setChangePasswordOpen(true);
                    }}
                    className={`w-full py-3.5 rounded-xl font-semibold text-base transition-colors flex items-center justify-center gap-2 ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                  >
                    <Svg.Link /> CHANGE PASSWORD
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4 pb-16 sm:pb-20">
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 flex items-center gap-4 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <Svg.Chart />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Total Orders</p>
                  <p className={`text-xl sm:text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>0</p>
                </div>
              </div>
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 flex items-center gap-4 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                  <Svg.Dollar stroke="currentColor" />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Wallet Balance</p>
                  <p className={`text-xl sm:text-2xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>¢{walletBalance.toFixed(2)}</p>
                </div>
              </div>
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 flex items-center gap-4 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                  <Svg.Chart />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Total Spent</p>
                  <p className={`text-xl sm:text-2xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>¢0.00</p>
                </div>
              </div>
            </div>
          </>
        )}

        </main>
      </div>

      {/* Profile dropdown - fixed overlay */}
      <div
        className={`fixed top-12 right-3 sm:top-16 sm:right-6 z-50 w-56 sm:w-60 rounded-xl transition-all duration-300 overflow-hidden ${profileOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-95 pointer-events-none'} ${isDark ? 'bg-black/40 border border-white/20' : 'bg-white/50 border border-slate-200/60'} backdrop-blur-xl shadow-2xl`}
        style={{ top: 'max(3rem, calc(env(safe-area-inset-top) + 2.5rem))', right: 'max(0.75rem, env(safe-area-inset-right))' }}
      >
        <div className="p-4">
          <div className={`flex items-center gap-3 mb-4 pb-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-base font-bold shadow-lg flex-shrink-0 overflow-hidden">
              {adminAvatarSrc ? <img src={adminAvatarSrc} alt="Profile" className="w-full h-full object-cover" /> : ((hasAdminRole && adminRoute ? adminDisplayName(user?.full_name) : (user?.full_name || 'User')).trim()[0] || 'U').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold text-base truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{hasAdminRole && adminRoute ? adminDisplayName(user?.full_name) : (user?.full_name || user?.email || 'User')}</h3>
              <p className={`text-sm truncate ${isDark ? 'text-white/70' : 'text-slate-500'}`}>{hasAdminRole ? 'Admin' : 'User'}</p>
            </div>
          </div>
          <nav className="space-y-0.5">
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('profile-page'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.User stroke="currentColor" /> <span>Profile</span>
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('my-orders'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.File /> <span>My Orders</span>
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('wallet'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.Dollar /> <span>Transactions</span>
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); handleMenuSelect('wallet'); }} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors ${isDark ? 'text-white/80 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <Svg.Card /> <span>My Wallet</span>
            </a>
          </nav>
          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <button
              type="button"
              onClick={() => {
                clearSession();
              }}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors text-red-500 hover:bg-red-500/10 font-medium"
            >
              <Svg.LogOut /> Sign Out
            </button>
          </div>
        </div>
      </div>

      {editingBundle != null && adminStoreTools && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setEditingBundle(null); setAdminBundlesMessage(null); }} aria-hidden="true" />
          <div className={`relative w-full max-w-sm rounded-2xl p-5 sm:p-6 shadow-2xl ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`} onClick={(e) => e.stopPropagation()}>
            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {editingBundle.index === -1 ? 'Add package' : 'Edit package'}
            </h3>
            <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
              {networkLabel(editingBundle.network)} · changes apply for everyone.
            </p>
            <div className="space-y-3">
              <label className={`block text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-700'}`}>Size</label>
              <input
                type="text"
                value={editBundleForm.size}
                onChange={(e) => setEditBundleForm((f) => ({ ...f, size: e.target.value }))}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                placeholder="e.g. 10 GB"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-700'}`}>Price (¢)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editBundleForm.price}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setEditBundleForm((f) => ({ ...f, price: Number.isFinite(v) ? v : 0 }));
                }}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                placeholder="0"
              />
            </div>
            {adminBundlesMessage && (
              <p className={`text-sm mt-3 ${adminBundlesMessage.type === 'success' ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
                {adminBundlesMessage.text}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap mt-5">
              <button
                type="button"
                onClick={() => { setEditingBundle(null); setAdminBundlesMessage(null); }}
                className={`flex-1 min-w-[6rem] py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
              >
                Cancel
              </button>
              {editingBundle.index >= 0 && (
                <button
                  type="button"
                  disabled={adminBundlesSaving}
                  onClick={async () => {
                    if (!window.confirm('Remove this package for everyone?')) return;
                    setAdminBundlesSaving(true);
                    setAdminBundlesMessage(null);
                    try {
                      const source = bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData : defaultBundles;
                      const next = JSON.parse(JSON.stringify(source));
                      const arr = [...(next[editingBundle.network] || [])];
                      if (editingBundle.index < 0 || editingBundle.index >= arr.length) {
                        setAdminBundlesMessage({ type: 'error', text: 'Invalid row' });
                        return;
                      }
                      arr.splice(editingBundle.index, 1);
                      next[editingBundle.network] = arr;
                      await api.updateBundles(next);
                      try {
                        const b = await api.getBundles();
                        setBundlesData(b && typeof b === 'object' ? b : next);
                      } catch {
                        setBundlesData(next);
                      }
                      setEditingBundle(null);
                    } catch (err) {
                      setAdminBundlesMessage({ type: 'error', text: err?.message || 'Failed to delete' });
                    } finally {
                      setAdminBundlesSaving(false);
                    }
                  }}
                  className={`flex-1 min-w-[6rem] py-2.5 rounded-xl font-semibold ${isDark ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-red-100 text-red-800 hover:bg-red-200'} disabled:opacity-50`}
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                disabled={adminBundlesSaving}
                onClick={async () => {
                  setAdminBundlesSaving(true);
                  setAdminBundlesMessage(null);
                  try {
                    const source = bundlesData && Array.isArray(bundlesData.mtn) ? bundlesData : defaultBundles;
                    const next = JSON.parse(JSON.stringify(source));
                    const arr = [...(next[editingBundle.network] || [])];
                    if (editingBundle.index === -1) {
                      arr.push({
                        size: editBundleForm.size.trim() || '1 GB',
                        price: editBundleForm.price,
                      });
                    } else if (arr[editingBundle.index]) {
                      arr[editingBundle.index] = {
                        ...arr[editingBundle.index],
                        size: editBundleForm.size.trim() || arr[editingBundle.index].size,
                        price: editBundleForm.price,
                      };
                    } else {
                      setAdminBundlesMessage({ type: 'error', text: 'Invalid row' });
                      return;
                    }
                    next[editingBundle.network] = arr;
                    await api.updateBundles(next);
                    try {
                      const b = await api.getBundles();
                      setBundlesData(b && typeof b === 'object' ? b : next);
                    } catch {
                      setBundlesData(next);
                    }
                    setEditingBundle(null);
                  } catch (err) {
                    setAdminBundlesMessage({ type: 'error', text: err?.message || 'Failed to save' });
                  } finally {
                    setAdminBundlesSaving(false);
                  }
                }}
                className={`flex-1 min-w-[6rem] py-2.5 rounded-xl font-semibold ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'} disabled:opacity-50`}
              >
                {adminBundlesSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart FAB - portaled so it can be dragged anywhere on the viewport */}
      {typeof document !== 'undefined' && createPortal(
        <button
          ref={cartButtonRef}
          onClick={handleCartButtonClick}
          onMouseDown={handleCartButtonDragStart}
          onTouchStart={handleCartButtonDragStart}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white text-slate-900 shadow-xl flex items-center justify-center hover:scale-110 transition-transform relative cursor-grab active:cursor-grabbing"
          style={{
            position: 'fixed',
            zIndex: 99998,
            ...(cartButtonPosition
              ? { left: cartButtonPosition.x, top: cartButtonPosition.y, right: 'auto', bottom: 'auto' }
              : { bottom: 'max(4rem, calc(env(safe-area-inset-bottom) + 3rem))', right: 'max(0.75rem, env(safe-area-inset-right))', left: 'auto', top: 'auto' }
            ),
          }}
          aria-label="Cart"
        >
          <Svg.Cart stroke="currentColor" className="pointer-events-none" />
          {cart.length > 0 && (
            <span className={`absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold flex items-center justify-center pointer-events-none ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}>
              {cart.length > 9 ? '9+' : cart.length}
            </span>
          )}
        </button>,
        document.body
      )}

      {/* Cart dialog - centered modal like the buy dialog */}
      {cartOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCartOpen(false)} aria-hidden="true" />
          <div className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col ${isDark ? 'bg-black' : 'bg-slate-50'}`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Cart ({cart.length})</h2>
              <button type="button" onClick={() => setCartOpen(false)} className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close cart">
                <Svg.Close stroke={stroke} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {cart.length === 0 ? (
                <p className={`text-center py-8 text-sm ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Your cart is empty</p>
              ) : (
                <ul className="space-y-3">
                  {cart.map((item) => {
                    const arr = bundlesData && bundlesData[item.bundle.network];
                    const bundleIdx = Array.isArray(arr) ? arr.findIndex((b) => String(b.size) === String(item.bundle.size)) : -1;
                    return (
                      <li key={item.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-200'}`}>
                        <div className="min-w-0">
                          <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{networkLabel(item.bundle.network)} {item.bundle.size}</p>
                          <p className={`text-sm truncate ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{item.recipientNumber}</p>
                          <p className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-700'}`}>¢ {item.bundle.price}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {adminStoreTools && bundleIdx >= 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const b = arr[bundleIdx];
                                setEditingBundle({ network: item.bundle.network, index: bundleIdx });
                                setEditBundleForm({ size: b.size, price: typeof b.price === 'number' ? b.price : parseFloat(b.price) || 0 });
                                setAdminBundlesMessage(null);
                              }}
                              className={`p-2 rounded-lg ${isDark ? 'text-white/80 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200'}`}
                              aria-label="Edit package"
                              title="Edit package (updates for everyone)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </button>
                          )}
                          <button type="button" onClick={() => removeFromCart(item.id)} className={`p-2 rounded-lg shrink-0 ${isDark ? 'text-red-400 hover:bg-white/10' : 'text-red-600 hover:bg-slate-200'}`} aria-label="Remove">
                            <Svg.Trash stroke="currentColor" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {cart.length > 0 && (
              <div className={`p-4 border-t shrink-0 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <p className={`text-sm mb-3 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                  Total: <span className="font-bold">¢ {cart.reduce((sum, i) => sum + parseFloat(i.bundle.price), 0).toFixed(2)}</span>
                </p>
                <button type="button" onClick={() => { setConfirmCheckoutOpen(true); setConfirmError(null); }} className={`w-full py-3 rounded-xl font-semibold transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}>
                  Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Order dialog - shown after clicking Checkout */}
      {confirmCheckoutOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setConfirmCheckoutOpen(false); setConfirmError(null); }} aria-hidden="true" />
          <div className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
            <h3 className={`text-lg font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>Confirm Order</h3>
            <p className={`text-base mb-2 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
              You are about to pay ¢ {cart.reduce((sum, i) => sum + parseFloat(i.bundle.price), 0).toFixed(2)} with your wallet.
            </p>
            {confirmError && (
              <p className="text-sm text-red-500 dark:text-red-400 mb-4 font-medium">{confirmError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setConfirmCheckoutOpen(false); setConfirmError(null); }}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${isDark ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10' : 'bg-slate-200 text-slate-800 hover:bg-slate-300 border border-slate-200'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const total = cart.reduce((sum, i) => sum + parseFloat(i.bundle.price), 0);
                  if (walletBalance < total) {
                    setConfirmError(`Insufficient balance. You have ¢ ${walletBalance.toFixed(2)} but the total is ¢ ${total.toFixed(2)}. Top up your wallet or remove items from the cart.`);
                    return;
                  }
                  setConfirmError(null);
                  try {
                    const data = await api.createOrders(cart);
                    setWalletBalance(data.balance);
                    setConfirmCheckoutOpen(false);
                    setCartOpen(false);
                    setCart([]);
                    fetchWallet();
                    api.getOrders().then((list) => setOrders(stabilizeOrdersList(list))).catch(() => {});
                    if (adminPinVerified || user?.role === 'admin') {
                      api.getAdminOrders()
                        .then((list) => setAdminOrders(Array.isArray(list) ? list : []))
                        .catch(() => {});
                    }
                  } catch (err) {
                    setConfirmError(err.message || 'Payment failed. Try again.');
                  }
                }}
                className={`flex-1 py-2.5 rounded-xl font-medium transition-colors border border-transparent ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
              >
                Confirm & Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile modal */}
      {editProfileOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setEditProfileOpen(false); setProfileEditError(null); }} aria-hidden="true" />
          <div className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Edit Profile</h3>
              <button type="button" onClick={() => { setEditProfileOpen(false); setProfileEditError(null); }} className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close">
                <Svg.Close stroke={stroke} />
              </button>
            </div>
            {profileEditError && <p className="text-sm text-red-500 mb-3">{profileEditError}</p>}
            <div className="space-y-3">
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Full Name</label>
              <input
                type="text"
                value={profileEditFullName}
                onChange={(e) => setProfileEditFullName(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Full name"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Email</label>
              <input
                type="email"
                value={profileEditEmail}
                onChange={(e) => setProfileEditEmail(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Email"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Phone Number</label>
              <input
                type="tel"
                value={profileEditPhone}
                onChange={(e) => setProfileEditPhone(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Phone number"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => { setEditProfileOpen(false); setProfileEditError(null); }}
                className={`flex-1 py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setProfileEditError(null);
                  const fullName = profileEditFullName.trim();
                  const email = profileEditEmail.trim();
                  if (!email) {
                    setProfileEditError('Email is required');
                    return;
                  }
                  try {
                    const updated = await api.updateProfile({ fullName: fullName || undefined, email, phone: profileEditPhone.trim() || undefined });
                    setUser(updated);
                    setEditProfileOpen(false);
                  } catch (err) {
                    setProfileEditError(err.message || 'Failed to update profile');
                  }
                }}
                className="flex-1 py-2.5 rounded-xl font-medium bg-blue-600 hover:bg-blue-700 text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password modal - new password must be different from current */}
      {changePasswordOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setChangePasswordOpen(false); setPasswordError(null); }} aria-hidden="true" />
          <div className={`relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl p-5 sm:p-6 ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Change Password</h3>
              <button type="button" onClick={() => { setChangePasswordOpen(false); setPasswordError(null); }} className={`p-2 rounded-lg shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`} aria-label="Close">
                <Svg.Close stroke={stroke} />
              </button>
            </div>
            {passwordError && <p className="text-sm text-red-500 mb-3">{passwordError}</p>}
            <p className={`text-sm mb-3 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>Enter your current password and choose a new one. The new password must be different from your current password.</p>
            <div className="space-y-3">
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Current password</label>
              <input
                type="password"
                value={passwordCurrent}
                onChange={(e) => setPasswordCurrent(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Current password"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>New password</label>
              <input
                type="password"
                value={passwordNew}
                onChange={(e) => setPasswordNew(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="New password (min 6 characters)"
              />
              <label className={`block text-sm font-medium ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Confirm new password</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className={`w-full px-4 py-2.5 rounded-xl border text-base ${isDark ? 'bg-black border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                placeholder="Confirm new password"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => { setChangePasswordOpen(false); setPasswordError(null); }}
                className={`flex-1 py-2.5 rounded-xl font-medium ${isDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setPasswordError(null);
                  if (!passwordCurrent.trim()) {
                    setPasswordError('Enter your current password');
                    return;
                  }
                  if (!passwordNew.trim()) {
                    setPasswordError('Enter a new password');
                    return;
                  }
                  if (passwordNew.length < 6) {
                    setPasswordError('New password must be at least 6 characters');
                    return;
                  }
                  if (passwordNew !== passwordConfirm) {
                    setPasswordError('New password and confirm do not match');
                    return;
                  }
                  try {
                    await api.changePassword({ currentPassword: passwordCurrent, newPassword: passwordNew });
                    setChangePasswordOpen(false);
                    setPasswordCurrent('');
                    setPasswordNew('');
                    setPasswordConfirm('');
                  } catch (err) {
                    setPasswordError(err.message || 'Failed to change password');
                  }
                }}
                className="flex-1 py-2.5 rounded-xl font-medium bg-blue-600 hover:bg-blue-700 text-white"
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

const EyeIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

function AdminPinPage({ isDark, onVerified, appSettings }) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputClass = `w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`;
  const logoUrl = appSettings?.sidebarLogoUrl || 'https://files.catbox.moe/l3islw.jpg';

  const handleSubmit = async () => {
    setError('');
    if (!pin.trim()) {
      setError('Please enter your PIN.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.verifyAdminPin(pin);
      api.setAdminToken(data.token);
      onVerified(data.token);
    } catch (err) {
      setError(err?.message || 'Invalid PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full w-full p-6">
      <img
        src={logoUrl}
        alt="DataPlus"
        className={`w-20 h-20 rounded-full object-cover border mb-6 ${isDark ? 'border-white/10' : 'border-slate-200'}`}
      />
      <h1 className={`text-2xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈</h1>
      <p className={`text-sm mb-8 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
        Admin — enter your PIN to continue
      </p>
      <div className="w-full max-w-sm space-y-4">
        <div className="relative">
          <input
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            autoComplete="off"
            placeholder="PIN"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setError(''); }}
            maxLength={8}
            className={`${inputClass} pr-11 text-center tracking-[0.4em] placeholder:tracking-normal`}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPin((p) => !p)}
            aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${isDark ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {showPin ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {error && (
          <p className="text-sm text-red-500 text-center" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-60 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
        >
          {loading ? 'Checking…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function SignInPage({ isDark, onSignIn, appSettings }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const inputClass = `w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`;
  const linkClass = `text-sm font-medium transition-colors ${isDark ? 'text-white/80 hover:text-white' : 'text-slate-700 hover:text-slate-900'}`;
  const isRegister = mode === 'register';

  const clearError = () => { setError(''); setSuccess(''); };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (isRegister) {
      const trimmedName = fullName.trim();
      if (!trimmedName) {
        setError('Please enter your full name.');
        return;
      }
      const trimmedPhone = phone.trim();
      if (!trimmedPhone) {
        setError('Please enter your phone number.');
        return;
      }
      if (String(trimmedPhone).replace(/\D/g, '').length < 8) {
        setError('Please enter a valid phone number (at least 8 digits).');
        return;
      }
      if (!trimmedEmail) {
        setError('Please enter your email.');
        return;
      }
      if (!trimmedPassword) {
        setError('Please enter a password.');
        return;
      }
      if (trimmedPassword.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (trimmedPassword !== confirmPassword.trim()) {
        setError('Passwords do not match. Please try again.');
        return;
      }
      setLoading(true);
      try {
        await api.register({
          email: trimmedEmail,
          password: trimmedPassword,
          fullName: trimmedName,
          phone: trimmedPhone,
        });
        setSuccess('Account created. Please sign in.');
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
      } catch (err) {
        setError(err.message || 'Registration failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!trimmedEmail) {
      setError('Please enter your email or phone.');
      return;
    }
    if (!trimmedPassword) {
      setError('Please enter your password.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.login({ email: trimmedEmail, password: trimmedPassword });
      onSignIn(result);
    } catch (err) {
      setError(err.message || 'Invalid email or password. Please try again or register.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full w-full p-6">
      <img
        src={appSettings?.sidebarLogoUrl || 'https://files.catbox.moe/l3islw.jpg'}
        alt="DataPlus"
        className={`w-20 h-20 rounded-full object-cover border mb-6 ${isDark ? 'border-white/10' : 'border-slate-200'}`}
      />
      <h1 className={`text-2xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈</h1>
      <p className={`text-sm mb-8 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
        {isRegister ? 'Create an account' : 'Sign in to your account'}
      </p>
      <div className="w-full max-w-sm space-y-4">
        {isRegister && (
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => { setFullName(e.target.value); clearError(); }}
            className={inputClass}
          />
        )}
        {isRegister && (
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); clearError(); }}
            className={inputClass}
          />
        )}
        <input
          type="email"
          placeholder={isRegister ? 'Email' : 'Email or phone'}
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearError(); }}
          className={inputClass}
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearError(); }}
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${isDark ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {isRegister && (
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); clearError(); }}
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((p) => !p)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${isDark ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        )}
        {success && (
          <p className="text-sm text-green-600 dark:text-green-400 text-center" role="status">
            {success}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-500 text-center" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-60 ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
        >
          {loading ? (isRegister ? 'Registering…' : 'Signing in…') : (isRegister ? 'Register' : 'Sign In')}
        </button>
        {isRegister && (
          <p className={`text-center text-sm pt-4 mt-2 border-t ${isDark ? 'border-white/10 text-white/60' : 'border-slate-200 text-slate-500'}`}>
            Already have an account?{' '}
            <button type="button" onClick={() => { setMode('signin'); setError(''); }} className={linkClass}>
              Login
            </button>
          </p>
        )}
        {!isRegister && (
          <p className={`text-center text-sm pt-2 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => { setMode('register'); setError(''); }} className={linkClass}>
              Register
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
