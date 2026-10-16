import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db, signOut, onAuthStateChanged, doc, getDoc } from "../firebase";

const getInitials = (name, email) => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return (email || "U").slice(0, 2).toUpperCase();
};

const UserMenu = () => {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setName("");
        setEmail("");
        setRole("");
        return;
      }

      setEmail(user.email || "");
      try {
        const snapshot = await getDoc(doc(db, "users", user.uid));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setName(data.fullName || "");
          setRole(data.role || "");
        }
      } catch (err) {
        console.warn("UserMenu load warning:", err);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  if (!email) return null;

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="user-avatar">{getInitials(name, email)}</span>
        <span className="user-menu-name">{name || email.split("@")[0]}</span>
        <span className="user-menu-chevron">▾</span>
      </button>

      {open && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <span className="user-avatar user-avatar-lg">
              {getInitials(name, email)}
            </span>
            <div>
              <strong>{name || "User"}</strong>
              <span>{email}</span>
              {role && <em className="user-role-tag">{role}</em>}
            </div>
          </div>
          <button type="button" onClick={() => { navigate("/dashboard/profile"); setOpen(false); }}>
            Profile
          </button>
          <button type="button" onClick={() => { navigate("/dashboard"); setOpen(false); }}>
            Dashboard
          </button>
          <button type="button" className="user-menu-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
