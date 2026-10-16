import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth, db, onAuthStateChanged, doc, getDoc } from "../firebase";
import logo from "../assets/fep-logo.png";

const IconHome = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z" />
  </svg>
);

const IconProjects = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const IconInfo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10v6M12 7h.01" />
  </svg>
);

// ─── Persistent cache ────────────────────────────────────────────────────────
let _memRole = null;
let _memIsAdmin = false;

const readCache = () => {
  if (_memRole !== null) return { role: _memRole, isAdmin: _memIsAdmin };
  try {
    const role = sessionStorage.getItem("fep_role") || null;
    const isAdmin = sessionStorage.getItem("fep_isAdmin") === "true";
    if (role) { _memRole = role; _memIsAdmin = isAdmin; }
    return { role, isAdmin };
  } catch {
    return { role: null, isAdmin: false };
  }
};

const writeCache = (role, isAdmin) => {
  _memRole = role;
  _memIsAdmin = isAdmin;
  try {
    if (role) sessionStorage.setItem("fep_role", role);
    else sessionStorage.removeItem("fep_role");
    sessionStorage.setItem("fep_isAdmin", String(isAdmin));
  } catch { /* ignore */ }
};

const clearCache = () => {
  _memRole = null;
  _memIsAdmin = false;
  try {
    sessionStorage.removeItem("fep_role");
    sessionStorage.removeItem("fep_isAdmin");
  } catch { /* ignore */ }
};
// ─────────────────────────────────────────────────────────────────────────────

const AppSidebar = ({ mobileOpen = false, onMobileClose }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const initial = readCache();
  const [role, setRole] = useState(initial.role);
  const [isAdmin, setIsAdmin] = useState(initial.isAdmin);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        clearCache();
        setRole(null);
        setIsAdmin(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        let newRole = _memRole;
        if (snapshot.exists()) {
          newRole = snapshot.data().role;
          setRole(newRole);
        }

        const token = await user.getIdTokenResult();
        const admin = token.claims.isAdmin === true;
        setIsAdmin(admin);
        writeCache(newRole, admin);
      } catch (err) {
        console.warn("Sidebar auth sync warning:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  // Close drawer on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const isActive = (path) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  const showProjects = role === "student" || role === "professor";

  const links = [
    { path: "/dashboard", label: "Home", icon: IconHome, show: true },
    { path: "/dashboard/projects", label: "Projects", icon: IconProjects, show: showProjects },
    { path: "/admin", label: "Admin", icon: IconInfo, show: isAdmin },
  ];

  const handleNav = (link) => {
    navigate(link.path);
    if (onMobileClose) onMobileClose();
  };

  const SidebarInner = ({ isDrawer }) => (
    <>
      <div className="app-sidebar-brand-row">
        <Link to="/dashboard" className="app-sidebar-brand" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img
            src={logo}
            alt="FEP IIT Kanpur"
            style={{ width: "50px", height: "50px", objectFit: "contain", borderRadius: "4px" }}
          />
          <span className="app-sidebar-title" style={{ display: "flex", alignItems: "center" }}>
            FEP<span style={{ color: "var(--app-primary)", margin: "0 2px" }}>·</span>IITK
          </span>
        </Link>
        {isDrawer && (
          <button
            type="button"
            className="app-sidebar-close-btn"
            onClick={onMobileClose}
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <nav className="app-sidebar-nav">
        {links
          .filter((l) => l.show)
          .map((link) => {
            const active = link.hash ? false : isActive(link.path);
            return (
              <button
                key={link.label}
                type="button"
                className={`app-sidebar-link ${active ? "active" : ""}`}
                onClick={() => handleNav(link)}
              >
                <link.icon />
                {link.label}
              </button>
            );
          })}
      </nav>

    </>
  );

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="app-sidebar">
        <SidebarInner isDrawer={false} />
      </aside>

      {/* ── Mobile drawer + backdrop ── */}
      {mobileOpen && (
        <>
          <div
            className="app-sidebar-backdrop"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="app-sidebar app-sidebar-drawer">
            <SidebarInner isDrawer={true} />
          </aside>
        </>
      )}
    </>
  );
};

export default AppSidebar;