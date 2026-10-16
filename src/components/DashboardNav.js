import { useEffect, useState } from "react";
import { auth, db, signOut, onAuthStateChanged, doc, getDoc } from "../firebase";
import { useNavigate, useLocation, Link } from "react-router-dom";
import "../styles/dashboard.css";
import logo from "../assets/logo.jpg";
import UserMenu from "./UserMenu";

const DashboardNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setrole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const snapshot = await getDoc(userRef);
        if (snapshot.exists()) {
          setrole(snapshot.data().role);
        }

        const tokenResult = await user.getIdTokenResult();
        setIsAdmin(tokenResult.claims.isAdmin === true);
      } else {
        setrole(null);
        setIsAdmin(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const go = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  const isActive = (path) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(path);
  };

  const isStudent = role === "student";
  const isProfessor = role === "professor";

  const navLinks = [
    { path: "/dashboard", label: "Home", show: true },
    {
      path: "/dashboard/projects",
      label: "Projects",
      show: isStudent || isProfessor,
    },
    { path: "/admin", label: "Admin", show: isAdmin },
    { path: "/dashboard/profile", label: "Profile", show: true },
  ];

  const renderMobileMenu = () => (
    <>
      {navLinks
        .filter((link) => link.show)
        .map((link) => (
          <button
            key={link.path}
            className={isActive(link.path) ? "active" : ""}
            onClick={() => go(link.path)}
          >
            {link.label}
          </button>
        ))}
      <button onClick={handleLogout}>Log Out</button>
    </>
  );

  return (
    <nav className="app-nav dashboard-nav">
      {menuOpen && (
        <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
      )}

      <Link to="/dashboard" className="app-nav-brand logo-link">
        <img src={logo} alt="FEP IIT Kanpur" className="navbar-logo" />
        <span className="app-nav-brand-text">
          FEP<span>·</span>IITK
        </span>
      </Link>

      <div className="app-nav-links dashboard-menu">
        {navLinks
          .filter((link) => link.show)
          .map((link) => (
            <button
              key={link.path}
              type="button"
              className={`app-nav-link ${isActive(link.path) ? "active" : ""}`}
              onClick={() => go(link.path)}
            >
              {link.label}
            </button>
          ))}
      </div>

      <div className="app-nav-actions">
        <UserMenu />
        <div className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
          <svg
            className={`menu-icon ${menuOpen ? "open" : ""}`}
            width="24"
            height="24"
            viewBox="0 0 24 24"
          >
            <line className="line1" x1="4" y1="6" x2="20" y2="6" />
            <line className="line2" x1="4" y1="12" x2="20" y2="12" />
            <line className="line3" x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </div>
      </div>

      {menuOpen && <div className="mobile-menu">{renderMobileMenu()}</div>}
    </nav>
  );
};

export default DashboardNav;
