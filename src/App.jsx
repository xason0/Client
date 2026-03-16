import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';

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

export default function App() {
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && window.__INITIAL_THEME__) || getTheme());
  const [token, setToken] = useState(() => (typeof window !== 'undefined' ? api.getToken() : null));
  const [user, setUser] = useState(null);
  const [isSignedIn, setIsSignedIn] = useState(!!token);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [ordersExpanded, setOrdersExpanded] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('mtn');
  const [scrolled, setScrolled] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [profileImage, setProfileImage] = useState(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [buyBundle, setBuyBundle] = useState(null);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [recipientError, setRecipientError] = useState(null);
  const [bulkOrderInput, setBulkOrderInput] = useState('');
  const [bulkOrderError, setBulkOrderError] = useState(null);
  const [bulkOrderSuccess, setBulkOrderSuccess] = useState(null);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmCheckoutOpen, setConfirmCheckoutOpen] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [topUpError, setTopUpError] = useState(null);
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
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [transactionDateFilter, setTransactionDateFilter] = useState('Today');
  const [transactionCustomStart, setTransactionCustomStart] = useState('');
  const [transactionCustomEnd, setTransactionCustomEnd] = useState('');
  const [transactionSearch, setTransactionSearch] = useState('');

  const fetchWallet = () => {
    if (!api.getToken()) return;
    api.getWallet().then((d) => setWalletBalance(d.balance)).catch(() => {});
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
        setUser(u);
        setIsSignedIn(true);
        if (u?.profile_avatar) setProfileImage(u.profile_avatar);
        fetchWallet();
      })
      .catch(() => {
        api.setToken(null);
        setToken(null);
        setIsSignedIn(false);
        setUser(null);
        setWalletBalance(0);
        localStorage.removeItem('dataplus_signed_in');
      });
  }, [token]);

  useEffect(() => {
    if ((currentPage === 'topup' || currentPage === 'transactions') && api.getToken()) {
      api.getTransactions().then(setTransactions).catch(() => setTransactions([]));
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage === 'orders' && api.getToken()) {
      setOrdersLoading(true);
      api.getOrders()
        .then((list) => setOrders(Array.isArray(list) ? list : []))
        .catch(() => setOrders([]))
        .finally(() => setOrdersLoading(false));
    }
  }, [currentPage]);

  const networkLabel = (n) => ({ mtn: 'MTN', telecel: 'Telecel', bigtime: 'AT BigTime', ishare: 'AT iShare' }[n] || 'MTN');
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

  const validMtnCapacities = [1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50];
  const getMtnBundleByCapacity = (capacityNum) => {
    const b = bundles.find((x) => x.size === `${capacityNum} GB`);
    return b ? { ...b, network: 'mtn' } : null;
  };

  const processBulkOrders = () => {
    setBulkOrderError(null);
    setBulkOrderSuccess(null);
    const lines = bulkOrderInput
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setBulkOrderError('Enter at least one line in the format: phone_number capacity (e.g. 0241234567 5)');
      return;
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
    if (errors.length > 0) {
      const msg = errors.length > 10
        ? errors.slice(0, 10).join(' ') + ` ... and ${errors.length - 10} more.`
        : errors.join(' ');
      setBulkOrderError(msg);
      return;
    }
    setCart((prev) => [...prev, ...added]);
    setBulkOrderInput('');
    setBulkOrderSuccess(`${added.length} order(s) added to cart.`);
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

  const bundles = [
    { size: '1 GB', price: '4.20' },
    { size: '2 GB', price: '8.40' },
    { size: '3 GB', price: '12.30' },
    { size: '4 GB', price: '16.20' },
    { size: '5 GB', price: '20.50' },
    { size: '6 GB', price: '25.00' },
    { size: '7 GB', price: '28.80' },
    { size: '8 GB', price: '33.00' },
    { size: '10 GB', price: '41.00' },
    { size: '15 GB', price: '61.00' },
    { size: '20 GB', price: '80.00' },
    { size: '25 GB', price: '98.00' },
    { size: '30 GB', price: '118.00' },
    { size: '40 GB', price: '154.00' },
    { size: '50 GB', price: '193.00' },
  ];

  const telecelBundles = [
    { size: '10 GB', price: '39.00' },
    { size: '12 GB', price: '44.00' },
    { size: '15 GB', price: '56.00' },
    { size: '20 GB', price: '75.00' },
    { size: '25 GB', price: '94.00' },
    { size: '30 GB', price: '110.00' },
    { size: '35 GB', price: '129.00' },
    { size: '40 GB', price: '143.00' },
    { size: '50 GB', price: '183.00' },
    { size: '100 GB', price: '350.00' },
  ];

  const bigtimeBundles = [
    { size: '20 GB', price: '60.00' },
    { size: '25 GB', price: '65.00' },
    { size: '30 GB', price: '75.00' },
    { size: '40 GB', price: '85.00' },
    { size: '50 GB', price: '95.00' },
    { size: '60 GB', price: '135.00' },
    { size: '80 GB', price: '170.00' },
    { size: '100 GB', price: '200.00' },
    { size: '200 GB', price: '370.00' },
  ];

  const ishareBundles = [
    { size: '1 GB', price: '4.20' },
    { size: '2 GB', price: '8.20' },
    { size: '3 GB', price: '12.00' },
    { size: '4 GB', price: '16.00' },
    { size: '5 GB', price: '19.00' },
    { size: '6 GB', price: '23.00' },
    { size: '7 GB', price: '28.30' },
    { size: '8 GB', price: '32.80' },
    { size: '9 GB', price: '36.90' },
    { size: '10 GB', price: '39.00' },
    { size: '15 GB', price: '55.00' },
  ];

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

      {!isSignedIn ? (
        <div className="flex-1 flex flex-col w-full min-h-full">
          <SignInPage
            isDark={isDark}
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
              <img
                src="https://files.catbox.moe/l3islw.jpg"
                alt="DataPlus"
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover flex-shrink-0 border ${isDark ? 'border-white/10' : 'border-slate-200'}`}
              />
              <div className="min-w-0">
                <h2 className={`text-lg font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈</h2>
                <p className={`text-sm truncate ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Agent Console</p>
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
          <div className={`w-10 h-px mx-auto mb-4 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

          <p className={`text-xs uppercase tracking-wider mb-2 font-medium ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Menu</p>
          <nav className="space-y-1.5">
            <MenuItem id="dashboard" icon={<Svg.Grid stroke={stroke} />} label="Dashboard" />
            <MenuItem id="bulk-orders" icon={<Svg.Phone stroke={stroke} />} label="Bulk Orders (MTN)" />
            <MenuItem id="afa-registration" icon={<Svg.Phone stroke={stroke} />} label="AFA Registration" />
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
            <MenuItem id="transactions" icon={<Svg.Clock stroke={stroke} />} label="Transactions" />
            <MenuItem id="join-us" icon={<Svg.WhatsApp stroke={stroke} />} label="Join Us" />
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
            𝒟𝒶𝓉𝒶𝒫𝓁𝓊𝓈
          </h1>
          <button
            onClick={toggleProfile}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center overflow-hidden transition-colors flex-shrink-0 ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
            aria-label="Toggle profile"
          >
            {profileImage ? (
              <img src={profileImage} alt="" className="w-full h-full object-cover rounded-full" />
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
                <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                  <Svg.Phone stroke={stroke} />
                </div>
                <h1 className={`text-2xl sm:text-3xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>Bulk Orders</h1>
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
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                  <Svg.Phone stroke={stroke} />
                </div>
                <h1 className={`text-2xl sm:text-3xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>AFA Registration</h1>
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

            <p className={`text-lg mb-1 ${isDark ? 'text-white/90' : 'text-slate-800'}`}>AFA Registration</p>
            <p className={`text-sm mb-5 sm:mb-6 ${isDark ? 'text-white/60' : 'text-slate-600'}`}>Register new AFA applications and view your registration history.</p>

            <button
              type="button"
              className={`w-auto px-6 py-3.5 sm:py-4 rounded-xl font-semibold inline-flex items-center justify-center gap-2 mb-5 sm:mb-6 transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              REGISTER NEW AFA
            </button>

            <div className={`flex flex-wrap gap-2 mb-5 sm:mb-6 ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
              {['Today', 'Yesterday', 'Last 7 Days', 'This Month', 'Custom'].map((label) => (
                <button
                  key={label}
                  type="button"
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${label === 'Today' ? (isDark ? 'bg-white text-black border-white' : 'bg-black text-white border-black') : isDark ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Total Registrations</p>
                <p className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>0</p>
              </div>
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Completed</p>
                <p className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>0</p>
              </div>
              <div className={`rounded-xl sm:rounded-2xl p-5 sm:p-6 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white/70' : 'text-slate-600'}`}>Pending</p>
                <p className={`text-2xl sm:text-3xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>0</p>
              </div>
            </div>
          </>
        ) : currentPage === 'join-us' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                  <Svg.WhatsApp stroke={stroke} />
                </div>
                <h1 className={`text-2xl sm:text-3xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>Join Us</h1>
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
          </>
        ) : currentPage === 'dashboard' ? (
          <>
            <div className="pt-14 sm:pt-20 pb-4 sm:pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 sm:p-2.5 rounded-lg ${isDark ? 'bg-black border border-white/10' : 'bg-white'}`}>
                    <Svg.Home stroke={stroke} />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
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
                    <p className="text-xl sm:text-3xl font-bold truncate">¢ {walletBalance.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/10' : 'bg-neutral-800'}`}>
                    <Svg.Cart stroke="#ffffff" />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm ${isDark ? 'text-white/70' : 'text-neutral-400'}`}>Today's Spent</p>
                    <p className="text-xl sm:text-3xl font-bold truncate">¢ 0.00</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCurrentPage('topup')}
                className={`w-full py-3 sm:py-4 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium text-base ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-neutral-800 hover:bg-neutral-700'}`}
              >
                <Svg.Plus /> Top Up Wallet
              </button>
            </div>

            <div className="rounded-xl sm:rounded-2xl p-5 sm:p-7 mb-5 sm:mb-6 bg-black text-white">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                {['Wallet Balance', "Today's Orders", "Today's Amount", "Today's Bundle"].map((label, i) => (
                  <div key={i} className={`text-center ${i < 2 ? 'pb-4 sm:pb-6 border-b md:border-b-0 md:pb-0' : 'pt-4 sm:pt-6'} ${i < 3 ? 'md:border-r' : ''} border-white/10`}>
                    <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mx-auto mb-3 bg-white/10">
                      <Svg.Wallet stroke="#ffffff" />
                    </div>
                    <p className="text-sm font-medium opacity-80">{label}</p>
                    <p className="text-lg sm:text-xl font-bold">{i === 0 ? `¢ ${walletBalance.toFixed(2)}` : i === 1 ? '0' : i === 2 ? '¢ 0.00' : '0 GB'}</p>
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
                    <button type="button" onClick={() => setBuyBundle({ ...bundle, network: activeTab })} className={`mt-auto w-full py-3 sm:py-4 rounded-xl font-semibold text-base transition-colors shadow-lg ${(isBigTime || isIshare) ? 'bg-white/95 hover:bg-white text-blue-600' : isTelecel ? 'bg-white/95 hover:bg-white text-red-700' : 'bg-white/95 hover:bg-white text-slate-800'}`}>
                      Buy
                    </button>
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
            const filtered = transactions.filter((t) => {
              const tTime = t.created_at ? new Date(t.created_at).getTime() : 0;
              if (tTime < start || tTime >= end) return false;
              if (!searchLower) return true;
              const type = (t.type || '').toLowerCase();
              const ref = (t.reference || '').toLowerCase();
              const amt = String(t.amount || '');
              return type.includes(searchLower) || ref.includes(searchLower) || amt.includes(searchLower);
            });
            const typeLabel = (t) => (t.type === 'topup' ? 'Top-up' : t.type === 'payment' ? 'Payment' : t.type || '—');
            const modeLabel = (t) => (t.reference || (t.type === 'topup' ? 'Paystack' : 'Wallet'));
            const narrationLabel = (t) => (t.reference || (t.type === 'topup' ? 'Wallet top-up' : 'Bundle purchase'));

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
                  return `<tr><td>${d}</td><td>${typeLabel(t)}</td><td>${narrationLabel(t)}</td><td>${modeLabel(t)}</td><td class="${amtClass}">${amt}</td><td>Completed</td></tr>`;
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
                    <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                      <Svg.Clock stroke={stroke} />
                    </div>
                    <h1 className={`text-2xl sm:text-3xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>Transactions</h1>
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
                              <td className={`py-3 px-4 ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Completed</td>
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
                <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                  <Svg.Wallet stroke={stroke} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold truncate">Top Up Wallet</h1>
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
                Enter an amount and continue to Paystack to complete your payment.
              </p>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-white/80' : 'text-slate-700'}`}>Amount (GHS)</label>
              <input
                type="number"
                min="10"
                step="0.01"
                placeholder="10.00"
                value={topUpAmount}
                onChange={(e) => { setTopUpAmount(e.target.value); setTopUpError(null); }}
                className={`w-full px-4 py-3 rounded-xl border text-base placeholder:opacity-60 ${isDark ? 'bg-black border-white/10 text-white placeholder:text-white/50' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
              />
              <p className={`text-xs mt-1.5 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Minimum amount: GHS 10</p>
              {topUpError && <p className="text-sm text-red-500 mt-2">{topUpError}</p>}
              <button
                type="button"
                onClick={async () => {
                  const amt = parseFloat(topUpAmount);
                  if (!Number.isFinite(amt) || amt < 10) {
                    setTopUpError('Minimum amount is GHS 10');
                    return;
                  }
                  setTopUpError(null);
                  try {
                    const data = await api.topUp(amt);
                    setWalletBalance(data.balance);
                    setTopUpAmount('');
                    const list = await api.getTransactions();
                    setTransactions(list);
                  } catch (err) {
                    setTopUpError(err.message || 'Top-up failed');
                  }
                }}
                className={`w-full mt-4 py-3 rounded-xl font-medium transition-colors ${isDark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/90'}`}
              >
                Top Up
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
            const formatOrderDate = (iso) => {
              const d = new Date(iso);
              return { date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) };
            };
            const normalized = orders.map((o) => ({
              id: String(o.id),
              recipientNumber: o.recipient_number || '',
              network: o.network ? (typeof o.network === 'string' && o.network.length > 3 ? o.network : networkLabel(o.network)) : networkLabel('mtn'),
              bundleSize: o.bundle_size || '',
              amount: typeof o.bundle_price === 'number' ? o.bundle_price.toFixed(2) : String(o.bundle_price || '0'),
              dateIso: o.created_at || new Date().toISOString(),
              status: (o.status && o.status.toLowerCase()) === 'completed' ? 'Completed' : 'Processing',
            }));
            const byStatus = (o) => orderStatusFilter === 'all' || o.status.toLowerCase() === orderStatusFilter;
            const searchLower = orderHistorySearch.trim().toLowerCase();
            const bySearch = (o) => {
              if (!searchLower) return true;
              return (o.recipientNumber && o.recipientNumber.includes(searchLower)) ||
                (o.network && o.network.toLowerCase().includes(searchLower)) ||
                (o.bundleSize && o.bundleSize.toLowerCase().includes(searchLower));
            };
            const completedOrders = normalized.filter((o) => o.status === 'Completed');
            const filteredHistory = completedOrders.filter(bySearch);
            const ordersToShow = normalized.filter(byStatus).filter(bySearch);

            return (
              <>
                <div className="pt-14 sm:pt-20 pb-4 sm:pb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                      <Svg.Cart stroke={stroke} />
                    </div>
                    <h1 className={`text-2xl sm:text-3xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>Orders</h1>
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

                <div className={`relative flex gap-0.5 p-0.5 rounded-2xl mb-5 sm:mb-6 overflow-hidden ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`} role="tablist" aria-label="Order status filter">
                  {['all', 'processing', 'completed'].map((status) => {
                    const label = status === 'all' ? 'All' : status === 'processing' ? 'Processing' : 'Completed';
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
                        const processingSteps = ['Submitted', 'Confirming', 'Completing'];
                        return (
                          <div
                            key={order.id}
                            className={`rounded-xl border p-4 sm:p-5 transition-colors ${isDark ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.06]' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`font-mono text-base font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{order.recipientNumber}</p>
                                <p className={`text-sm mt-0.5 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{order.network} · {order.bundleSize}</p>
                                <p className={`text-xs mt-2 ${isDark ? 'text-white/40' : 'text-slate-400'}`}>{date} · {time}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {isCompleted ? (
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${isDark ? 'bg-white/15 text-white/90' : 'bg-slate-200 text-slate-800'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    Completed
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-green-600 dark:text-green-400">Processing</span>
                                )}
                                <span className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>¢ {order.amount}</span>
                              </div>
                            </div>
                            {!isCompleted && (
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
                        placeholder="Search orders by number, network, or bundle..."
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
        ) : (
          <>
            <div className="pt-14 sm:pt-20 pb-5 sm:pb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-2 sm:p-2.5 rounded-lg flex-shrink-0 ${isDark ? 'bg-black border border-white/10' : 'bg-white border border-slate-200'}`}>
                  <Svg.User stroke={stroke} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold truncate">Profile</h1>
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
                    className="w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl sm:text-5xl font-bold shadow-lg overflow-hidden cursor-pointer"
                    onClick={triggerFileInput}
                  >
                    {profileImage ? <img src={profileImage} alt="Profile" className="w-full h-full object-cover" /> : 'J'}
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
                <h3 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{user?.full_name || user?.email || 'User'}</h3>
                <p className={`text-base ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Agent</p>
              </div>
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-5">
                {[
                  ['Full Name', user?.full_name || '—'],
                  ['Email Address', user?.email || '—'],
                  ['Phone Number', user?.phone || '—'],
                  ['Agent ID', 'DF-4398'],
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
                      setProfileEditFullName(user?.full_name || '');
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
              {profileImage ? <img src={profileImage} alt="Profile" className="w-full h-full object-cover" /> : 'J'}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold text-base truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{user?.full_name || user?.email || 'User'}</h3>
              <p className={`text-sm truncate ${isDark ? 'text-white/70' : 'text-slate-500'}`}>Agent</p>
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
                api.setToken(null);
                setToken(null);
                setUser(null);
                setIsSignedIn(false);
                setProfileOpen(false);
                setWalletBalance(0);
                localStorage.removeItem('dataplus_signed_in');
              }}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-base transition-colors text-red-500 hover:bg-red-500/10 font-medium"
            >
              <Svg.LogOut /> Sign Out
            </button>
          </div>
        </div>
      </div>

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
                  {cart.map((item) => (
                    <li key={item.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-200'}`}>
                      <div className="min-w-0">
                        <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{networkLabel(item.bundle.network)} {item.bundle.size}</p>
                        <p className={`text-sm truncate ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{item.recipientNumber}</p>
                        <p className={`text-sm font-medium ${isDark ? 'text-white/90' : 'text-slate-700'}`}>¢ {item.bundle.price}</p>
                      </div>
                      <button type="button" onClick={() => removeFromCart(item.id)} className={`p-2 rounded-lg shrink-0 ${isDark ? 'text-red-400 hover:bg-white/10' : 'text-red-600 hover:bg-slate-200'}`} aria-label="Remove">
                        <Svg.Trash stroke="currentColor" />
                      </button>
                    </li>
                  ))}
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
                    api.getOrders().then((list) => setOrders(Array.isArray(list) ? list : [])).catch(() => {});
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

function SignInPage({ isDark, onSignIn }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'register'
  const [fullName, setFullName] = useState('');
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
      if (!trimmedEmail) {
        setError('Please enter your email or phone.');
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
        await api.register({ email: trimmedEmail, password: trimmedPassword, fullName: trimmedName });
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
        src="https://files.catbox.moe/l3islw.jpg"
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
        <input
          type="email"
          placeholder="Email or phone"
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
