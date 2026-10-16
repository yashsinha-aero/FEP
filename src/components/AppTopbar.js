import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db, onAuthStateChanged, collection, doc, getDoc, onSnapshot, query, where } from "../firebase";
import UserMenu from "./UserMenu";

const AppTopbar = ({ searchValue, onSearchChange, searchPlaceholder, showSearch = true, onMobileMenuOpen }) => {
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const projectCacheRef = useRef({});

  const [userProfile, setUserProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [unreadApps, setUnreadApps] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserProfile(null);
        setRole(null);
        return;
      }
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          setUserProfile({ id: user.uid, ...userData });
          setRole(userData?.role);
        }
      } catch (err) {
        console.warn("Topbar user profile error:", err);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userProfile || !role) {
      setUnreadApps([]);
      return;
    }

    let q;
    if (role === "professor") {
      q = query(
        collection(db, "applications"),
        where("professorId", "==", userProfile.id),
        where("unreadForProfessor", "==", true)
      );
    } else {
      q = query(
        collection(db, "applications"),
        where("studentId", "==", userProfile.id),
        where("unreadForStudent", "==", true)
      );
    }

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rawApps = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      const enriched = await Promise.all(
        rawApps.map(async (app) => {
          if (projectCacheRef.current[app.projectId]) {
            return { ...app, projectTitle: projectCacheRef.current[app.projectId] };
          }
          try {
            const projSnap = await getDoc(doc(db, "projects", app.projectId));
            if (projSnap.exists()) {
              const title = projSnap.data().title;
              projectCacheRef.current[app.projectId] = title;
              return { ...app, projectTitle: title };
            }
          } catch (err) {
            console.error("Error fetching project title:", err);
          }
          return { ...app, projectTitle: "Untitled Project" };
        })
      );

      // Sort by lastMessageAt descending
      const sorted = enriched.sort((a, b) => {
        const timeA = a.lastMessageAt?.toDate?.()?.getTime() || 0;
        const timeB = b.lastMessageAt?.toDate?.()?.getTime() || 0;
        return timeB - timeA;
      });

      setUnreadApps(sorted);
    });

    return () => unsubscribe();
  }, [userProfile, role]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatTime = (createdAt) => {
    if (!createdAt) return "";
    return new Date(createdAt.toDate?.() || createdAt).toLocaleString();
  };

  return (
    <header className="app-topbar">
      {/* Mobile hamburger — only visible on small screens */}
      <button
        type="button"
        className="app-topbar-hamburger"
        aria-label="Open navigation"
        onClick={onMobileMenuOpen}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {showSearch ? (
        <div className="app-topbar-search">
          <svg className="app-topbar-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" />
          </svg>
          <input
            type="search"
            className="app-topbar-input"
            placeholder={searchPlaceholder || "Search projects, universities, or students..."}
            value={searchValue || ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
        </div>
      ) : (
        <div className="app-topbar-search app-topbar-search-hidden" />
      )}

      <div className="app-topbar-actions">
        <div className="app-topbar-bell-container" ref={dropdownRef}>
          <button
            type="button"
            className="app-topbar-bell"
            aria-label="Notifications"
            onClick={() => setDropdownOpen((prev) => !prev)}
            style={{ position: 'relative' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadApps.length > 0 && (
              <span className="app-topbar-bell-badge">
                {unreadApps.length}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="notifications-dropdown">
              <div className="notifications-dropdown-header">
                <h4>Notifications</h4>
              </div>
              <div className="notifications-list">
                {unreadApps.length === 0 ? (
                  <div className="notifications-empty-state">
                    No new notifications
                  </div>
                ) : (
                  unreadApps.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className="notification-item"
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate(`/dashboard/applications/${app.id}`);
                      }}
                    >
                      <div className="notification-title">
                        {role === "professor" ? (
                          <>
                            New message from <strong>{app.studentName || "Student"}</strong> on <strong>{app.projectTitle}</strong>
                          </>
                        ) : (
                          <>
                            New message from <strong>Professor</strong> on <strong>{app.projectTitle}</strong>
                          </>
                        )}
                      </div>
                      <div className="notification-meta">
                        {formatTime(app.lastMessageAt)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <UserMenu />
      </div>
    </header>
  );
};

export default AppTopbar;

