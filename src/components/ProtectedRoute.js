import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "../firebase";
import { Navigate, useLocation } from "react-router-dom";

// ─── Module-level auth cache ────────────────────────────────────────────────
// Persists across React Router navigations (component unmounts/remounts) so
// the very first render of ProtectedRoute already knows the auth state,
// eliminating the blank-page flash on every tab switch.
let _cachedUser = undefined; // undefined = not yet resolved, null = signed out

const ProtectedRoute = ({ children }) => {
  const auth = getAuth();
  const location = useLocation();

  // Start from the module-level cache but synchronize with synchronous auth.currentUser
  // state on mount. This prevents stale cached 'null' (logged out) states from
  // immediately redirecting newly signed-in users back to the login page.
  const [user, setUser] = useState(() => {
    const current = auth.currentUser;
    if (current) {
      _cachedUser = current;
      return current;
    }
    if (current === null && _cachedUser !== null && _cachedUser !== undefined) {
      _cachedUser = null;
    }
    return _cachedUser;
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      _cachedUser = currentUser ?? null; // cache the resolved value
      setUser(_cachedUser);
    });

    return () => unsubscribe();
  }, [auth]);

  // Still resolving — show nothing only on the very first cold load
  // (after that _cachedUser is set and we never hit this branch again)
  if (user === undefined) return null;

  if (!user) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirectUrl}`} state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
