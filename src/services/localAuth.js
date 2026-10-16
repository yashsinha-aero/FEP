import API, { getMe } from "./api";

const TOKEN_KEY = "fep_token";
const USER_KEY = "fep_user";

const listeners = new Set();

const notifyListeners = (user) => {
  listeners.forEach((listener) => {
    try {
      listener(user);
    } catch (e) {
      console.error("Auth listener error:", e);
    }
  });
};

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed) return null;
    return {
      ...parsed,
      uid: parsed.id || parsed.uid,
      getIdToken: async () => getToken() || "",
      getIdTokenResult: async () => ({
        claims: {
          isAdmin: Boolean(parsed.isAdmin || parsed.role === "admin"),
        },
      }),
    };
  } catch {
    return null;
  }
};

export const setSession = (token, user) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) {
    const cleanUser = {
      ...user,
      uid: user.id || user.uid,
    };
    localStorage.setItem(USER_KEY, JSON.stringify(cleanUser));
    notifyListeners(getCurrentUser());
  }
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notifyListeners(null);
};

export const login = async (email, password) => {
  const res = await API.post("/login", { email, password });
  const { token, user } = res.data;
  setSession(token, user);
  return getCurrentUser();
};

export const adminLogin = async (email, password) => {
  const res = await API.post("/admin-login", { email, password });
  const { token, user } = res.data;
  setSession(token, user);
  return getCurrentUser();
};

export const logout = async () => {
  clearSession();
};

export const onAuthStateChanged = (authOrCallback, maybeCallback) => {
  // Support both Firebase-style (auth, callback) and simple (callback) signatures
  const callback = typeof maybeCallback === "function" ? maybeCallback : authOrCallback;
  if (typeof callback !== "function") {
    console.warn("onAuthStateChanged: no valid callback provided");
    return () => {};
  }
  listeners.add(callback);
  // Synchronously call with initial state
  callback(getCurrentUser());

  // Optionally verify token in background
  if (getToken()) {
    getMe()
      .then((res) => {
        if (res.data?.user) {
          setSession(getToken(), res.data.user);
        }
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          clearSession();
        }
      });
  }

  return () => {
    listeners.delete(callback);
  };
};

export const auth = {
  get currentUser() {
    return getCurrentUser();
  },
  signOut: logout,
};

const localAuth = {
  getToken,
  getCurrentUser,
  setSession,
  clearSession,
  login,
  adminLogin,
  logout,
  onAuthStateChanged,
  auth,
};

export default localAuth;
