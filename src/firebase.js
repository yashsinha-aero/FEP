import {
  auth,
  onAuthStateChanged,
  login,
  adminLogin,
  logout,
  getCurrentUser,
  getToken,
} from "./services/localAuth";

import {
  db,
  storage,
  doc,
  collection,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  limit,
  setDoc,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "./services/localDb";

// Compatibility helpers for Firebase Auth methods
export const signInWithEmailAndPassword = async (_auth, email, password) => {
  const user = await login(email, password);
  return {
    user: {
      ...user,
      getIdToken: async () => getToken() || "",
      getIdTokenResult: async () => ({
        claims: { isAdmin: Boolean(user.isAdmin || user.role === "admin") },
      }),
    },
  };
};

export const signOut = async (_auth) => {
  return logout();
};

export const getAuth = () => auth;
export const verifyPasswordResetCode = async () => true;
export const confirmPasswordReset = async () => true;
export const applyActionCode = async () => true;

// Re-export Auth, Database, Storage and all methods
export {
  auth,
  onAuthStateChanged,
  login,
  adminLogin,
  logout,
  getCurrentUser,
  getToken,
  db,
  storage,
  doc,
  collection,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  limit,
  setDoc,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
};

const app = {
  name: "fep-local",
  options: {},
};

export default app;
