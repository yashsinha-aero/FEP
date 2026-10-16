import { useEffect, useState, useMemo, useRef } from "react";
import { auth, db, doc, getDoc, collection, onSnapshot, query, where, onAuthStateChanged } from "../firebase";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import "../styles/admin.css";

const ICON_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899"];
const GUIDELINES_DOC_URL = process.env.REACT_APP_GUIDELINES_URL || "https://drive.google.com/file/d/1blhAR4TLoxhciZ-XuA0WFnrocJB3xmTM/view?usp=sharing";

const DEPARTMENT_NAMES = {
  // Short codes
  AE: "Aerospace Engineering",
  BSBE: "Biological Sciences & Bioengineering",
  CHE: "Chemical Engineering",
  CE: "Civil Engineering",
  CGS: "Cognitive Science",
  CSE: "Computer Science & Engineering",
  DES: "Design",
  ES: "Earth Sciences",
  ECO: "Economic Sciences",
  EE: "Electrical Engineering",
  HSS: "Humanities & Social Sciences",
  IME: "Industrial & Management Engineering",
  IS: "Intelligent Systems",
  MSE: "Materials Science & Engineering",
  ME: "Mechanical Engineering",
  MSP: "Materials Science Programme",
  NET: "Nuclear Engineering & Technology",
  PHY: "Physics",
  CHM: "Chemistry",
  MTH: "Mathematics & Statistics",
  SEE: "Sustainable Energy Engineering",
  SPASE: "Space, Planetary & Astronomical Sciences",
  SDS: "Statistics & Data Science",

  // Name variations mapping to canonical clean names
  "Computer Science and Engineering": "Computer Science & Engineering",
  "Computer Science & Engineering": "Computer Science & Engineering",
  "Biological Sciences and Bioengineering": "Biological Sciences & Bioengineering",
  "Biological Sciences & Bioengineering": "Biological Sciences & Bioengineering",
  "Materials Science and Engineering": "Materials Science & Engineering",
  "Materials Science & Engineering": "Materials Science & Engineering",
  "Mathematics and Statistics": "Mathematics & Statistics",
  "Mathematics & Statistics": "Mathematics & Statistics",
  "Industrial Management and Engineering": "Industrial & Management Engineering",
  "Industrial Management & Engineering": "Industrial & Management Engineering",
  "Humanities and Social Sciences": "Humanities & Social Sciences",
  "Humanities & Social Sciences": "Humanities & Social Sciences",
  "Economics": "Economic Sciences",
  "Economic Sciences": "Economic Sciences",
  "Statistics and Data Sciences": "Statistics & Data Science",
  "Statistics & Data Science": "Statistics & Data Science",
  "Space, Planetary & Astronomical Sciences & Engineering": "Space, Planetary & Astronomical Sciences",
};

const getProjectInitial = (project, isStudent) => {
  const source = isStudent
    ? (project.createdByInstitute || project.title || "P")
    : (project.title || "P");
  return source.charAt(0).toUpperCase();
};

const STATUS_STYLES = {
  applied: { bg: "#eff6ff", color: "#1d4ed8", label: "Applied" },
  shortlisted: { bg: "#f0fdf4", color: "#15803d", label: "Shortlisted" },
  selected: { bg: "#f0fdf4", color: "#15803d", label: "Selected" },
  rejected: { bg: "#fef2f2", color: "#b91c1c", label: "Rejected" },
  pending: { bg: "#fefce8", color: "#92400e", label: "Pending" },
};

// Helper to normalize degree values
const normalizeDegree = (deg) => {
  if (!deg) return "B.Tech";
  const d = String(deg).trim();
  if (/^b\.?tech/i.test(d)) return "B.Tech";
  if (/^bs$/i.test(d) || /^b\.s\.?$/i.test(d)) return "BS";
  if (/^m\.?tech/i.test(d)) return "M.Tech";
  if (/^dual/i.test(d)) return "Dual Degree";
  if (/^b\.?cyber/i.test(d) || /bcyber/i.test(d)) return "B.Cyber";
  if (/^m\.?sc/i.test(d)) return "M.Sc";
  if (/^ph\.?d/i.test(d)) return "Ph.D";
  return d;
};

// Extract student department from all possible Firestore paths
const getStudentDepartment = (app, studentUser) => {
  const raw =
    app.studentDepartment ||
    app.department1 ||
    app.department ||
    app.dept ||
    app.studentBranch ||
    app.branch ||
    studentUser?.department1 ||
    studentUser?.department ||
    studentUser?.dept ||
    studentUser?.branch ||
    studentUser?.studentDepartment ||
    "";

  if (!raw || !raw.trim()) return "General";
  const trimmed = raw.trim();
  return DEPARTMENT_NAMES[trimmed] || DEPARTMENT_NAMES[trimmed.toUpperCase()] || trimmed;
};

// Extract student degree/programme from all possible Firestore paths
const getStudentDegree = (app, studentUser) => {
  const raw =
    app.studentDegree ||
    app.studentProgramme ||
    app.programme ||
    app.degree ||
    app.degreeType ||
    studentUser?.programme ||
    studentUser?.degree ||
    studentUser?.degreeType ||
    studentUser?.studentProgramme ||
    "";
  if (!raw || !raw.trim()) return "B.Tech";
  return normalizeDegree(raw);
};

// Extract student CPI from application or user doc
const getStudentCpi = (app, studentUser) => {
  const raw = parseFloat(app.cpi ?? app.studentCpi ?? studentUser?.cpi ?? studentUser?.studentCpi);
  if (!isNaN(raw) && raw > 0 && raw <= 10) return raw;
  return null;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [role, setRole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Student / Professor views
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [applications, setApplications] = useState([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const projectCacheRef = useRef({});

  // Admin Portal Analytics State
  const [allProjects, setAllProjects] = useState([]);
  const [allApplications, setAllApplications] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [adminDataLoading, setAdminDataLoading] = useState(true);

  // Analytics Filter States
  const [topAppDegreeFilter, setTopAppDegreeFilter] = useState("all");
  const [topAppStatusFilter, setTopAppStatusFilter] = useState("all");

  // Auth & User Profile Listener
  useEffect(() => {
    let isMounted = true;
    let unsubUser = null;
    const fallbackTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 6000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (isMounted) {
          setLoading(false);
          navigate("/login");
        }
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        const adminClaim = token.claims.isAdmin === true;
        if (isMounted) setIsAdmin(adminClaim);
      } catch (err) {
        console.warn("Error reading admin claim:", err);
      }

      if (unsubUser) unsubUser();
      unsubUser = onSnapshot(
        doc(db, "users", user.uid),
        (snapshot) => {
          if (!isMounted) return;
          if (snapshot.exists()) {
            const data = snapshot.data();
            setName(data.fullName || user.displayName || "");
            const userRole = data.role || null;
            setRole(userRole);
            if (userRole === "admin") {
              setIsAdmin(true);
            }
          }
          setLoading(false);
        },
        (err) => {
          console.error("Dashboard user load error:", err);
          if (isMounted) setLoading(false);
        }
      );
    });

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      if (unsubUser) unsubUser();
      unsubscribeAuth();
    };
  }, [navigate]);

  // Admin Data Listeners (Loads full portal collections if Admin)
  useEffect(() => {
    if (!isAdmin && role !== "admin") return;
    setAdminDataLoading(true);

    const unsubProjects = onSnapshot(
      collection(db, "projects"),
      (snapshot) => {
        setAllProjects(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Admin projects load error:", err)
    );

    const unsubApplications = onSnapshot(
      collection(db, "applications"),
      (snapshot) => {
        setAllApplications(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.error("Admin applications load error:", err)
    );

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setAllUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAdminDataLoading(false);
      },
      (err) => {
        console.error("Admin users load error:", err);
        setAdminDataLoading(false);
      }
    );

    return () => {
      unsubProjects();
      unsubApplications();
      unsubUsers();
    };
  }, [isAdmin, role]);

  // Non-Admin: Real-time Applications Listener
  useEffect(() => {
    if (!auth.currentUser || !role || role === "admin" || isAdmin) {
      setApplications([]);
      setApplicationsLoading(false);
      return;
    }
    setApplicationsLoading(true);

    const uid = auth.currentUser.uid;
    let q;
    if (role === "professor") {
      q = query(
        collection(db, "applications"),
        where("professorId", "==", uid),
        where("adminApprovalStatus", "==", "approved")
      );
    } else {
      q = query(
        collection(db, "applications"),
        where("studentId", "==", uid)
      );
    }

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const rawApps = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        const enriched = await Promise.all(
          rawApps.map(async (app) => {
            if (projectCacheRef.current[app.projectId]) {
              const cached = projectCacheRef.current[app.projectId];
              return { ...app, projectTitle: cached.title, projectHost: cached.host };
            }
            if (app.projectId) {
              try {
                const projSnap = await getDoc(doc(db, "projects", app.projectId));
                if (projSnap.exists()) {
                  const pData = projSnap.data();
                  projectCacheRef.current[app.projectId] = {
                    title: pData.title,
                    host: pData.createdByName || pData.createdByInstitute || "",
                  };
                  return {
                    ...app,
                    projectTitle: pData.title,
                    projectHost: pData.createdByName || pData.createdByInstitute || "",
                  };
                }
              } catch (e) {
                console.warn("Could not fetch project metadata:", e);
              }
            }
            return { ...app, projectTitle: app.projectTitle || "Untitled Project", projectHost: app.projectHost || "" };
          })
        );

        setApplications(enriched);
        setApplicationsLoading(false);
      },
      (err) => {
        console.error("Dashboard applications snapshot error:", err);
        setApplicationsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [role, isAdmin]);

  // Non-Admin: Real-time Projects Listener
  useEffect(() => {
    if (!auth.currentUser || !role || role === "admin" || isAdmin) {
      setProjects([]);
      setProjectsLoading(false);
      return;
    }
    setProjectsLoading(true);

    const uid = auth.currentUser.uid;
    let q;
    if (role === "professor") {
      q = query(collection(db, "projects"), where("createdBy", "==", uid));
    } else {
      q = query(collection(db, "projects"), where("publishingStatus", "==", "approved"));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (role !== "professor") {
          list = list.filter((p) => p.status === "open");
        }
        setProjects(list.slice(0, 4));
        setProjectsLoading(false);
      },
      (err) => {
        console.error("Dashboard projects snapshot error:", err);
        setProjectsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [role, isAdmin]);

  const isStudent = role === "student";

  // Filtered projects for non-admins
  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.location?.toLowerCase().includes(q) ||
        (isStudent && p.createdByInstitute?.toLowerCase().includes(q)) ||
        (!isStudent && p.publishingStatus?.toLowerCase().includes(q))
    );
  }, [projects, search, isStudent]);

  // ─── Computations for Portal-Wide Admin Analytics ─────────────────────────
  const adminAnalytics = useMemo(() => {
    if (!isAdmin && role !== "admin") return null;

    const totalStudents = allUsers.filter((u) => u.role === "student").length;
    const totalProfessors = allUsers.filter((u) => u.role === "professor").length;
    const totalUsers = allUsers.length;

    // Projects Analytics
    const totalProjects = allProjects.length;
    const activeOpenProjects = allProjects.filter(
      (p) => (p.publishingStatus === "approved" || !p.publishingStatus) && p.publishingStatus !== "rejected" && p.status !== "closed"
    ).length;
    const pendingProjects = allProjects.filter(
      (p) => p.publishingStatus === "pending"
    ).length;
    const rejectedProjects = allProjects.filter((p) => p.publishingStatus === "rejected").length;
    const closedProjects = allProjects.filter((p) => p.status === "closed").length;

    // Applications Analytics
    const totalApplications = allApplications.length;
    const pendingAdminApps = allApplications.filter(
      (a) => !a.adminApprovalStatus || a.adminApprovalStatus === "pending"
    ).length;
    const approvedForwardedApps = allApplications.filter(
      (a) => a.adminApprovalStatus === "approved"
    ).length;
    const rejectedAdminApps = allApplications.filter(
      (a) => a.adminApprovalStatus === "rejected"
    ).length;

    const shortlistedApps = allApplications.filter((a) => a.status === "shortlisted").length;
    const selectedApps = allApplications.filter((a) => a.status === "selected").length;
    const rejectedProfApps = allApplications.filter((a) => a.status === "rejected").length;

    const selectionRate =
      totalApplications > 0
        ? ((selectedApps / totalApplications) * 100).toFixed(1)
        : "0.0";
    const forwardRate =
      totalApplications > 0
        ? ((approvedForwardedApps / totalApplications) * 100).toFixed(1)
        : "0.0";
    const shortlistRate =
      totalApplications > 0
        ? (((shortlistedApps + selectedApps) / totalApplications) * 100).toFixed(1)
        : "0.0";

    // ── CPI Analytics ──
    let totalCpiSum = 0;
    let validCpiCount = 0;
    let selectedCpiSum = 0;
    let validSelectedCpiCount = 0;
    let cpiTiers = {
      tier_9_10: 0,
      tier_8_9: 0,
      tier_7_8: 0,
      tier_below_7: 0,
    };

    allApplications.forEach((app) => {
      const studentUser = allUsers.find((u) => u.id === app.studentId);
      const rawCpi = getStudentCpi(app, studentUser);
      if (rawCpi !== null) {
        totalCpiSum += rawCpi;
        validCpiCount++;
        if (rawCpi >= 9.0) cpiTiers.tier_9_10++;
        else if (rawCpi >= 8.0) cpiTiers.tier_8_9++;
        else if (rawCpi >= 7.0) cpiTiers.tier_7_8++;
        else cpiTiers.tier_below_7++;

        if (app.status === "selected") {
          selectedCpiSum += rawCpi;
          validSelectedCpiCount++;
        }
      }
    });

    const avgApplicantCpi =
      validCpiCount > 0 ? (totalCpiSum / validCpiCount).toFixed(2) : "N/A";
    const avgSelectedCpi =
      validSelectedCpiCount > 0
        ? (selectedCpiSum / validSelectedCpiCount).toFixed(2)
        : "N/A";

    const cpiBreakdown = [
      {
        label: "9.0 – 10.0 CPI",
        count: cpiTiers.tier_9_10,
        percent:
          validCpiCount > 0
            ? ((cpiTiers.tier_9_10 / validCpiCount) * 100).toFixed(0)
            : 0,
        color: "#16a34a",
      },
      {
        label: "8.0 – 8.9 CPI",
        count: cpiTiers.tier_8_9,
        percent:
          validCpiCount > 0
            ? ((cpiTiers.tier_8_9 / validCpiCount) * 100).toFixed(0)
            : 0,
        color: "#0284c7",
      },
      {
        label: "7.0 – 7.9 CPI",
        count: cpiTiers.tier_7_8,
        percent:
          validCpiCount > 0
            ? ((cpiTiers.tier_7_8 / validCpiCount) * 100).toFixed(0)
            : 0,
        color: "#f59e0b",
      },
      {
        label: "Below 7.0 CPI",
        count: cpiTiers.tier_below_7,
        percent:
          validCpiCount > 0
            ? ((cpiTiers.tier_below_7 / validCpiCount) * 100).toFixed(0)
            : 0,
        color: "#64748b",
      },
    ];

    // ── Most In-Demand & Preferred Projects (Approved & Active Opportunities) ──
    const projectAppCounts = {};
    allApplications.forEach((app) => {
      if (app.projectId) {
        projectAppCounts[app.projectId] =
          (projectAppCounts[app.projectId] || 0) + 1;
      }
    });

    // Only include approved, non-rejected active projects in the preferred ranking
    const topPreferredProjects = allProjects
      .filter((p) => p.publishingStatus === "approved" || (!p.publishingStatus && p.publishingStatus !== "rejected" && p.status !== "closed"))
      .filter((p) => p.publishingStatus !== "rejected" && p.status !== "closed")
      .map((proj) => {
        const appCount = projectAppCounts[proj.id] || 0;
        return {
          ...proj,
          applicantCount: appCount,
        };
      })
      .sort((a, b) => b.applicantCount - a.applicantCount)
      .slice(0, 5);

    // ── Comprehensive Branch Application Statistics (Which Branches Have Applied) ──
    const branchMap = {};

    allApplications.forEach((app) => {
      const studentUser = allUsers.find((u) => u.id === app.studentId);
      const cleanDept = getStudentDepartment(app, studentUser);
      const rawCpi = getStudentCpi(app, studentUser);
      const deg = getStudentDegree(app, studentUser);

      if (!branchMap[cleanDept]) {
        branchMap[cleanDept] = {
          name: cleanDept,
          count: 0,
          cpiSum: 0,
          cpiCount: 0,
          selectedCount: 0,
          shortlistedCount: 0,
          degrees: {},
        };
      }

      branchMap[cleanDept].count++;
      branchMap[cleanDept].degrees[deg] =
        (branchMap[cleanDept].degrees[deg] || 0) + 1;

      if (rawCpi !== null) {
        branchMap[cleanDept].cpiSum += rawCpi;
        branchMap[cleanDept].cpiCount++;
      }
      if (app.status === "selected") {
        branchMap[cleanDept].selectedCount++;
      } else if (app.status === "shortlisted") {
        branchMap[cleanDept].shortlistedCount++;
      }
    });

    const totalApps = allApplications.length;
    const branchBreakdown = Object.values(branchMap)
      .map((b) => ({
        ...b,
        percent: totalApps > 0 ? ((b.count / totalApps) * 100).toFixed(0) : 0,
        avgCpi: b.cpiCount > 0 ? (b.cpiSum / b.cpiCount).toFixed(2) : "N/A",
        degreesList: Object.entries(b.degrees)
          .map(([degName, cnt]) => `${degName} (${cnt})`)
          .join(", "),
      }))
      .sort((a, b) => b.count - a.count);

    // ── Degree / Program Demographics ──
    const degreeMap = {};
    allApplications.forEach((app) => {
      const studentUser = allUsers.find((u) => u.id === app.studentId);
      const deg = getStudentDegree(app, studentUser);
      degreeMap[deg] = (degreeMap[deg] || 0) + 1;
    });
    const degreeBreakdown = Object.entries(degreeMap)
      .map(([name, count]) => ({
        name,
        count,
        percent: totalApplications > 0 ? ((count / totalApplications) * 100).toFixed(0) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Recent Applicants Stream (Sorted by appliedAt Descending) ──
    let recentApplicantsList = allApplications.map((app) => {
      const studentUser = allUsers.find((u) => u.id === app.studentId);
      const projectDoc = allProjects.find((p) => p.id === app.projectId);
      const rawCpi = getStudentCpi(app, studentUser);
      const cpiVal = rawCpi !== null ? rawCpi : 0;
      const deg = getStudentDegree(app, studentUser);
      const cleanDept = getStudentDepartment(app, studentUser);
      const projTitle = projectDoc?.title || app.projectTitle || "Research Project";
      const projHost = projectDoc?.createdByInstitute || projectDoc?.location || "";

      return {
        id: app.id,
        studentId: app.studentId,
        name: app.studentName || studentUser?.fullName || studentUser?.name || "Student",
        rollNumber: app.studentRollNumber || studentUser?.rollNumber || studentUser?.roll || "",
        cpi: cpiVal,
        cpiDisplay: cpiVal > 0 ? cpiVal.toFixed(2) : "N/A",
        degree: deg,
        department: cleanDept,
        projectTitle: projTitle,
        projectHost: projHost,
        status: app.status || "applied",
        adminApprovalStatus: app.adminApprovalStatus || "pending",
        appliedAt: app.appliedAt?.toDate?.() || app.appliedAt || 0,
      };
    });

    // Sort by most recent application first
    recentApplicantsList.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

    // Apply interactive filters to Recent Applicants
    if (topAppDegreeFilter !== "all") {
      recentApplicantsList = recentApplicantsList.filter(
        (a) => a.degree.toLowerCase() === topAppDegreeFilter.toLowerCase()
      );
    }
    if (topAppStatusFilter !== "all") {
      recentApplicantsList = recentApplicantsList.filter((a) => {
        if (topAppStatusFilter === "pending") {
          return a.adminApprovalStatus === "pending" || !a.adminApprovalStatus;
        }
        return a.status === topAppStatusFilter || a.adminApprovalStatus === topAppStatusFilter;
      });
    }

    const recentApplicants = recentApplicantsList.slice(0, 10);

    return {
      totalUsers,
      totalStudents,
      totalProfessors,
      totalProjects,
      activeOpenProjects,
      pendingProjects,
      rejectedProjects,
      closedProjects,
      totalApplications,
      pendingAdminApps,
      approvedForwardedApps,
      rejectedAdminApps,
      shortlistedApps,
      selectedApps,
      rejectedProfApps,
      selectionRate,
      forwardRate,
      shortlistRate,
      avgApplicantCpi,
      avgSelectedCpi,
      validCpiCount,
      cpiBreakdown,
      topPreferredProjects,
      branchBreakdown,
      degreeBreakdown,
      recentApplicants,
    };
  }, [isAdmin, role, allProjects, allApplications, allUsers, topAppDegreeFilter, topAppStatusFilter]);

  useEffect(() => {
    if (window.location.hash === "#applications") {
      document.getElementById("applications")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loading]);

  return (
    <AppShell
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder={
        isAdmin || role === "admin"
          ? "Search across portal..."
          : isStudent
          ? "Search projects, universities..."
          : "Search your projects..."
      }
    >
      {loading || ( (isAdmin || role === "admin") && adminDataLoading ) ? (
        <div className="home-shimmer">
          <div className="home-shimmer-block" style={{ height: 180 }} />
          <div className="home-shimmer-block" />
          <div className="home-shimmer-block" />
        </div>
      ) : isAdmin || role === "admin" ? (
        /* ══════════════════════════════════════════════════════════════════
           ADMIN PORTAL-WIDE ANALYTICS & OPERATIONS DASHBOARD
           ══════════════════════════════════════════════════════════════════ */
        <div className="home-page" style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "40px" }}>
          {/* Simple Clean Header */}
          <div className="portal-analytics-header">
            <div className="portal-analytics-header-text">
              <h1>Overview & Analytics</h1>
              <p>
                Institutional performance metrics, applicant academic performance, project demand rankings, and operational queues.
              </p>
            </div>
            <div className="portal-analytics-header-actions">
              <button
                type="button"
                className="portal-analytics-btn-primary"
                onClick={() => navigate("/admin?tab=projects&filter=pending")}
              >
                Review Projects ({adminAnalytics?.pendingProjects || 0} Pending)
              </button>
              <button
                type="button"
                className="portal-analytics-btn-primary"
                onClick={() => navigate("/admin?tab=applications&filter=pending")}
                style={{ backgroundColor: "#0284c7", borderColor: "#0284c7" }}
              >
                Screen Applications ({adminAnalytics?.pendingAdminApps || 0} Pending)
              </button>
              <button
                type="button"
                className="portal-analytics-btn-secondary"
                onClick={() => navigate("/admin?tab=broadcast")}
              >
                Broadcast Notices
              </button>
            </div>
          </div>

          {/* Key Performance Indicators (KPI Cards) */}
          <div className="portal-analytics-kpi-grid">
            {/* Card 1: Total Applications */}
            <div className="portal-analytics-kpi-card">
              <div>
                <div className="portal-analytics-kpi-title">Total Applications</div>
                <div className="portal-analytics-kpi-value">{adminAnalytics?.totalApplications || 0}</div>
              </div>
              <div className="portal-analytics-kpi-badges">
                <span className="portal-analytics-badge portal-analytics-badge-blue">
                  {adminAnalytics?.approvedForwardedApps || 0} Forwarded
                </span>
                {adminAnalytics?.pendingAdminApps > 0 && (
                  <span className="portal-analytics-badge portal-analytics-badge-amber">
                    {adminAnalytics.pendingAdminApps} Pending Screening
                  </span>
                )}
              </div>
            </div>

            {/* Card 2: Average Applicant CPI */}
            <div className="portal-analytics-kpi-card">
              <div>
                <div className="portal-analytics-kpi-title">Average Applicant CPI</div>
                <div className="portal-analytics-kpi-value">{adminAnalytics?.avgApplicantCpi}</div>
              </div>
              <div className="portal-analytics-kpi-badges">
                <span className="portal-analytics-badge portal-analytics-badge-green">
                  Selected Avg: {adminAnalytics?.avgSelectedCpi}
                </span>
                <span className="portal-analytics-badge portal-analytics-badge-slate">
                  {adminAnalytics?.validCpiCount || 0} Profiles
                </span>
              </div>
            </div>

            {/* Card 3: Research Projects */}
            <div className="portal-analytics-kpi-card">
              <div>
                <div className="portal-analytics-kpi-title">Research Projects</div>
                <div className="portal-analytics-kpi-value">{adminAnalytics?.totalProjects || 0}</div>
              </div>
              <div className="portal-analytics-kpi-badges">
                <span className="portal-analytics-badge portal-analytics-badge-green">
                  {adminAnalytics?.activeOpenProjects || 0} Active & Open
                </span>
                {adminAnalytics?.pendingProjects > 0 && (
                  <span className="portal-analytics-badge portal-analytics-badge-amber">
                    {adminAnalytics.pendingProjects} Pending Approval
                  </span>
                )}
              </div>
            </div>

            {/* Card 4: Selection Rate */}
            <div className="portal-analytics-kpi-card">
              <div>
                <div className="portal-analytics-kpi-title">Selection Rate</div>
                <div className="portal-analytics-kpi-value">{adminAnalytics?.selectionRate || "0.0"}%</div>
              </div>
              <div className="portal-analytics-kpi-badges">
                <span className="portal-analytics-badge portal-analytics-badge-green">
                  {adminAnalytics?.selectedApps || 0} Selected
                </span>
                <span className="portal-analytics-badge portal-analytics-badge-blue">
                  {adminAnalytics?.shortlistedApps || 0} Shortlisted
                </span>
              </div>
            </div>
          </div>

          {/* Row 1: CPI Distribution & High-Demand Projects */}
          <div className="portal-analytics-grid-2col">
            {/* Left: CPI Performance Distribution */}
            <div className="portal-analytics-card">
              <div className="portal-analytics-card-header">
                <div>
                  <h3>Academic Performance & CPI Distribution</h3>
                  <p>Distribution of applicant CPIs across all submissions</p>
                </div>
              </div>

              {(!adminAnalytics?.cpiBreakdown || adminAnalytics.validCpiCount === 0) ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  No student CPI data recorded yet.
                </div>
              ) : (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px", padding: "12px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: "700" }}>Applicant Pool Avg</div>
                      <div style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>{adminAnalytics.avgApplicantCpi}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: "700" }}>Selected Cohort Avg</div>
                      <div style={{ fontSize: "18px", fontWeight: "800", color: "#15803d" }}>{adminAnalytics.avgSelectedCpi}</div>
                    </div>
                  </div>

                  {adminAnalytics.cpiBreakdown.map((item) => (
                    <div key={item.label} className="portal-analytics-bar-item">
                      <div className="portal-analytics-bar-labels">
                        <strong>{item.label}</strong>
                        <span>{item.count} applicants ({item.percent}%)</span>
                      </div>
                      <div className="portal-analytics-bar-track">
                        <div
                          className="portal-analytics-bar-fill"
                          style={{
                            width: `${Math.max(Number(item.percent), 3)}%`,
                            background: item.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Most In-Demand & Preferred Projects */}
            <div className="portal-analytics-card">
              <div className="portal-analytics-card-header">
                <div>
                  <h3>Most Preferred Projects</h3>
                  <p>Research projects receiving the highest application volume</p>
                </div>
              </div>

              {(!adminAnalytics?.topPreferredProjects || adminAnalytics.topPreferredProjects.length === 0) ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  No project application data recorded yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {adminAnalytics.topPreferredProjects.map((proj, idx) => (
                    <div
                      key={proj.id}
                      style={{
                        padding: "12px 14px",
                        backgroundColor: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          #{idx + 1} {proj.title}
                        </div>
                        <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>
                          {proj.createdByInstitute || proj.location || "IIT Kanpur"} • Min CPI: {proj.cpiRequirement ?? "None"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: "14px", fontWeight: "800", color: "#0284c7" }}>
                          {proj.applicantCount} {proj.applicantCount === 1 ? "app" : "apps"}
                        </div>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            padding: "2px 7px",
                            borderRadius: "4px",
                            display: "inline-block",
                            marginTop: "2px",
                            backgroundColor:
                              proj.publishingStatus === "rejected"
                                ? "#fef2f2"
                                : proj.publishingStatus === "pending"
                                ? "#fefce8"
                                : proj.status === "closed"
                                ? "#f1f5f9"
                                : proj.applicantCount >= 5
                                ? "#f0fdf4"
                                : "#f0f9ff",
                            color:
                              proj.publishingStatus === "rejected"
                                ? "#b91c1c"
                                : proj.publishingStatus === "pending"
                                ? "#a16207"
                                : proj.status === "closed"
                                ? "#64748b"
                                : proj.applicantCount >= 5
                                ? "#15803d"
                                : "#0369a1",
                          }}
                        >
                          {proj.publishingStatus === "rejected"
                            ? "Rejected"
                            : proj.publishingStatus === "pending"
                            ? "Pending Review"
                            : proj.status === "closed"
                            ? "Closed"
                            : proj.applicantCount >= 5
                            ? "High Demand"
                            : "Open"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Branch Application Statistics & Pipeline Funnel */}
          <div className="portal-analytics-grid-2col">
            {/* Left: Branch Application Statistics */}
            <div className="portal-analytics-card">
              <div className="portal-analytics-card-header">
                <div>
                  <h3>Branch Application Statistics</h3>
                  <p>Distribution and academic statistics of branches that have applied</p>
                </div>
                <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
                  {adminAnalytics?.branchBreakdown?.length || 0} Branches
                </span>
              </div>

              {(!adminAnalytics?.branchBreakdown || adminAnalytics.branchBreakdown.length === 0) ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  No branch application data recorded yet.
                </div>
              ) : (
                <div style={{ overflowX: "auto", maxHeight: "280px", overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", position: "sticky", top: 0, backgroundColor: "#ffffff" }}>
                        <th style={{ padding: "8px 10px" }}>Branch</th>
                        <th style={{ padding: "8px 10px" }}>Apps (%)</th>
                        <th style={{ padding: "8px 10px" }}>Avg CPI</th>
                        <th style={{ padding: "8px 10px" }}>Degrees</th>
                        <th style={{ padding: "8px 10px" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminAnalytics.branchBreakdown.map((branch) => (
                        <tr key={branch.name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 10px", fontWeight: "600", color: "#0f172a" }}>
                            {branch.name}
                          </td>
                          <td style={{ padding: "8px 10px", color: "#0284c7", fontWeight: "700", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span>{branch.count} ({branch.percent}%)</span>
                              <div style={{ width: "36px", height: "4px", backgroundColor: "#e2e8f0", borderRadius: "2px", overflow: "hidden" }}>
                                <div style={{ width: `${Math.max(Number(branch.percent), 6)}%`, height: "100%", backgroundColor: "#0284c7" }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ backgroundColor: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontWeight: "700", color: "#334155", fontSize: "11.5px" }}>
                              {branch.avgCpi}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", color: "#64748b", fontSize: "11.5px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={branch.degreesList}>
                            {branch.degreesList || "None"}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: "11.5px", whiteSpace: "nowrap" }}>
                            {branch.selectedCount > 0 && (
                              <span style={{ color: "#15803d", fontWeight: "600", marginRight: "6px" }}>
                                {branch.selectedCount} Sel
                              </span>
                            )}
                            {branch.shortlistedCount > 0 && (
                              <span style={{ color: "#0284c7", fontWeight: "600" }}>
                                {branch.shortlistedCount} Short
                              </span>
                            )}
                            {branch.selectedCount === 0 && branch.shortlistedCount === 0 && (
                              <span style={{ color: "#94a3b8" }}>In Review</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Degree / Program Breakdown Summary */}
              <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <h4 style={{ margin: 0, fontSize: "11.5px", fontWeight: "700", color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Degrees Summary
                  </h4>
                </div>
                <div className="portal-analytics-chips-wrap">
                  {adminAnalytics?.degreeBreakdown.map((deg) => (
                    <div key={deg.name} className="portal-analytics-chip" style={{ padding: "3px 8px", fontSize: "11.5px" }}>
                      <span>{deg.name}:</span>
                      <strong>{deg.count} ({deg.percent}%)</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Pipeline Progression */}
            <div className="portal-analytics-card">
              <div className="portal-analytics-card-header">
                <div>
                  <h3>Application Pipeline Progression</h3>
                  <p>Milestone progression from initial submission to placement</p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                <div className="portal-analytics-funnel-step">
                  <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: "600" }}>
                    1. Submitted Applications
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#0284c7" }}>
                    {adminAnalytics?.totalApplications || 0} (100%)
                  </div>
                </div>

                <div className="portal-analytics-funnel-step">
                  <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: "600" }}>
                    2. Admin Screened & Forwarded
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#0284c7" }}>
                    {adminAnalytics?.approvedForwardedApps || 0} ({adminAnalytics?.forwardRate || 0}%)
                  </div>
                </div>

                <div className="portal-analytics-funnel-step">
                  <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: "600" }}>
                    3. Faculty Shortlisted Candidates
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#0284c7" }}>
                    {(adminAnalytics?.shortlistedApps || 0) + (adminAnalytics?.selectedApps || 0)} ({adminAnalytics?.shortlistRate || 0}%)
                  </div>
                </div>

                <div className="portal-analytics-funnel-step step-highlight">
                  <div style={{ fontSize: "13px", color: "#15803d", fontWeight: "700" }}>
                    4. Final Selected & Placed
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "800", color: "#15803d" }}>
                    {adminAnalytics?.selectedApps || 0} ({adminAnalytics?.selectionRate || 0}%)
                  </div>
                </div>
              </div>

              {/* Community Summary */}
              <div style={{ paddingTop: "18px", borderTop: "1px solid #f1f5f9" }}>
                <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", fontWeight: "700", color: "#334155", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Registered Community Breakdown
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div style={{ padding: "10px 12px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Registered Students</div>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>{adminAnalytics?.totalStudents || 0}</div>
                  </div>
                  <div style={{ padding: "10px 12px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>Faculty Hosts</div>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>{adminAnalytics?.totalProfessors || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Recent Applicants Stream */}
          <div className="portal-analytics-card">
            <div className="portal-analytics-card-header" style={{ flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h3>Recent Application Submissions</h3>
                <p>Latest applicant submissions across all research projects</p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {/* Degree Filter */}
                <select
                  value={topAppDegreeFilter}
                  onChange={(e) => setTopAppDegreeFilter(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", backgroundColor: "#ffffff" }}
                >
                  <option value="all">All Degrees</option>
                  <option value="B.Tech">B.Tech</option>
                  <option value="BS">BS</option>
                  <option value="M.Tech">M.Tech</option>
                  <option value="Dual Degree">Dual Degree</option>
                  <option value="B.Cyber">B.Cyber</option>
                  <option value="M.Sc">M.Sc</option>
                  <option value="Ph.D">Ph.D</option>
                </select>

                {/* Status Filter */}
                <select
                  value={topAppStatusFilter}
                  onChange={(e) => setTopAppStatusFilter(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "12px", backgroundColor: "#ffffff" }}
                >
                  <option value="all">All Statuses</option>
                  <option value="selected">Selected</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="pending">Pending Admin</option>
                </select>

                <button
                  type="button"
                  onClick={() => navigate("/admin?tab=applications")}
                  className="admin-btn-action"
                  style={{ padding: "6px 14px", fontSize: "12.5px" }}
                >
                  Open Admin Panel →
                </button>
              </div>
            </div>

            {(!adminAnalytics?.recentApplicants || adminAnalytics.recentApplicants.length === 0) ? (
              <div style={{ padding: "28px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                No applicants match the selected degree and status filters.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <th style={{ padding: "10px 12px" }}>Student</th>
                      <th style={{ padding: "10px 12px" }}>CPI</th>
                      <th style={{ padding: "10px 12px" }}>Program & Branch</th>
                      <th style={{ padding: "10px 12px" }}>Applied Project</th>
                      <th style={{ padding: "10px 12px" }}>Date</th>
                      <th style={{ padding: "10px 12px" }}>Status</th>
                      <th style={{ padding: "10px 12px" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAnalytics.recentApplicants.map((app, idx) => (
                      <tr key={app.id || idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px" }}>
                          <strong style={{ color: "#0f172a", display: "block" }}>{app.name}</strong>
                          {app.rollNumber && <span style={{ fontSize: "11.5px", color: "#64748b" }}>Roll: {app.rollNumber}</span>}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span className="portal-top-cpi-pill">
                            {app.cpiDisplay}
                          </span>
                        </td>
                        <td style={{ padding: "12px", color: "#334155", fontSize: "12.5px" }}>
                          <strong style={{ display: "block", color: "#0f172a" }}>{app.degree}</strong>
                          <span style={{ color: "#64748b" }}>{app.department}</span>
                        </td>
                        <td style={{ padding: "12px", color: "#334155", maxWidth: "260px" }}>
                          <div style={{ fontWeight: "600", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {app.projectTitle}
                          </div>
                          {app.projectHost && (
                            <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>
                              {app.projectHost}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>
                          {app.appliedAt ? new Date(app.appliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent"}
                        </td>
                        <td style={{ padding: "12px" }}>
                          <span
                            className={`admin-approval-badge ${
                              app.status === "selected"
                                ? "admin-approval-approved"
                                : app.status === "shortlisted"
                                ? "admin-approval-approved"
                                : app.adminApprovalStatus === "approved"
                                ? "admin-approval-approved"
                                : "admin-approval-pending"
                            }`}
                            style={{
                              backgroundColor:
                                app.status === "selected" ? "#f0fdf4" : app.status === "shortlisted" ? "#eff6ff" : undefined,
                              color:
                                app.status === "selected" ? "#15803d" : app.status === "shortlisted" ? "#1d4ed8" : undefined,
                            }}
                          >
                            {app.status === "selected" ? "Selected" : app.status === "shortlisted" ? "Shortlisted" : app.adminApprovalStatus === "approved" ? "Forwarded" : "Pending Admin"}
                          </span>
                        </td>
                        <td style={{ padding: "12px" }}>
                          <button
                            type="button"
                            onClick={() => navigate(`/admin?tab=applications`)}
                            style={{ background: "none", border: "none", color: "#0284c7", fontWeight: "600", cursor: "pointer", fontSize: "12.5px" }}
                          >
                            Review in Admin →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════
           STUDENT & PROFESSOR DASHBOARDS
           ══════════════════════════════════════════════════════════════════ */
        <div className="home-page">
          <section className="home-hero">
            <div className="home-hero-text">
              {!isStudent ? (
                <>
                  <h1>Welcome to FEP Host Portal</h1>
                  <p>
                    {name ? ` Welcome back, Professor ${name.split(" ")[0]}. ` : ""}
                    Manage your research projects, review student applications, and track project progress.
                  </p>
                  <div className="home-hero-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="home-btn-primary"
                      onClick={() => navigate("/dashboard/projects?action=create")}
                    >
                      Create New Project
                    </button>
                    <button
                      type="button"
                      className="home-btn-secondary"
                      onClick={() => navigate("/dashboard/projects")}
                      style={{ background: 'rgba(255, 255, 255, 0.15)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.25)', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.25)'}
                      onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.15)'}
                    >
                      Manage Projects
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1>Welcome to FEP Portal</h1>
                  <p>
                    Discover research opportunities, connect with partner universities,
                    and manage your foreign exposure journey.
                    {name ? ` Glad to have you here, ${name.split(" ")[0]}.` : ""}
                  </p>
                  <div className="home-hero-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="home-btn-primary"
                      onClick={() => navigate("/dashboard/projects")}
                    >
                      Browse Projects
                    </button>
                    <a
                      href={GUIDELINES_DOC_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="home-btn-secondary"
                      style={{ background: 'rgba(255, 255, 255, 0.15)', color: 'white', border: '1px solid rgba(255, 255, 255, 0.25)', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: 'background 0.2s', display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                      onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.25)'}
                      onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.15)'}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      Guidelines & Policy
                    </a>
                  </div>
                </>
              )}
            </div>
            <div className="home-hero-art" aria-hidden="true">
              <div className="home-hero-block" />
              <div className="home-hero-block" />
              <div className="home-hero-block" />
              <div className="home-hero-block" />
            </div>
          </section>

          <div className="home-guidelines-banner">
            <div className="home-guidelines-banner-left">
              <div className="home-guidelines-badge-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="home-guidelines-banner-info">
                <div className="home-guidelines-banner-title-row">
                  <h3>Guidelines and Policy</h3>
                </div>
                <p>
                  Review the official Foreign Exposure Programme guidelines, eligibility criteria, and student undertaking terms before applying.
                </p>
              </div>
            </div>
            <a
              href={GUIDELINES_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="home-guidelines-banner-btn"
            >
              <span>View Policy Document</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>

          <div className="home-grid">
            <section>
              <div className="home-section-header">
                <h2>
                  {isStudent ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 6l-9.5 9.5-5-5L1 18" />
                        <path d="M17 6h6v6" />
                      </svg>
                      Trending Opportunities
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                        <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                      </svg>
                      My Projects
                    </>
                  )}
                </h2>
                <button
                  type="button"
                  className="home-section-link"
                  onClick={() => navigate("/dashboard/projects")}
                >
                  View all
                </button>
              </div>

              <div className="home-trending-grid">
                {projectsLoading ? (
                  [0, 1, 2, 3].map((n) => (
                    <div key={n} className="home-project-card home-app-skeleton" style={{ pointerEvents: "none" }}>
                      <div className="home-skeleton-badge" style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="home-skeleton-title" style={{ width: "75%", height: 14, marginBottom: 8 }} />
                        <div className="home-skeleton-sub" style={{ width: "45%", height: 11, marginBottom: 12 }} />
                        <div style={{ display: "flex", gap: 6 }}>
                          <div className="home-skeleton-badge" style={{ width: 55, height: 18 }} />
                          <div className="home-skeleton-badge" style={{ width: 65, height: 18 }} />
                        </div>
                      </div>
                    </div>
                  ))
                ) : filteredProjects.length === 0 ? (
                  <p className="home-empty">
                    {isStudent ? "No open projects right now. Check back soon." : "You haven't created any projects yet."}
                  </p>
                ) : (
                  filteredProjects.map((project, i) => (
                    <button
                      key={project.id}
                      type="button"
                      className="home-project-card"
                      onClick={() => navigate("/dashboard/projects")}
                    >
                      <div
                        className="home-project-icon"
                        style={{ background: ICON_COLORS[i % ICON_COLORS.length] }}
                      >
                        {getProjectInitial(project, isStudent)}
                      </div>
                      <div className="home-project-body">
                        <h3>{project.title}</h3>
                        {isStudent ? (
                          <p className="home-project-org">
                            {project.createdByInstitute || project.location || "IIT Kanpur"}
                          </p>
                        ) : (
                          <p className="home-project-org" style={{ fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", margin: "4px 0 10px" }}>
                            <span style={{ color: project.status === "open" ? "#16a34a" : "#dc2626" }}>
                              {project.status || "open"}
                            </span>
                            <span style={{ color: "#94a3b8", margin: "0 6px" }}>•</span>
                            <span style={{ color: "#475569" }}>
                              Publishing: {project.publishingStatus || "pending"}
                            </span>
                          </p>
                        )}
                        <div className="home-project-tags">
                          {project.compensation && (
                            <span className="home-project-tag">{project.compensation}</span>
                          )}
                          {project.timeCommitment && (
                            <span className="home-project-tag">{project.timeCommitment}</span>
                          )}
                          {project.location && (
                            <span className="home-project-tag">{project.location}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>

            <aside className="home-events-panel" id="applications">
              <div className="home-section-header">
                <h2>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  {isStudent ? "My Applications" : "Recent Applications"}
                </h2>
                <button
                  type="button"
                  className="home-section-link"
                  onClick={() => navigate("/dashboard/projects")}
                >
                  {isStudent ? "Apply now" : "Manage applications"}
                </button>
              </div>

              <div className="home-events-list home-apps-list">
                {applicationsLoading ? (
                  [0, 1, 2].map((i) => (
                    <div key={i} className="home-event-item home-app-skeleton">
                      <div className="home-skeleton-title" />
                      <div className="home-skeleton-sub" />
                      <div className="home-skeleton-badge" />
                    </div>
                  ))
                ) : applications.length === 0 ? (
                  <div className="home-event-item home-apps-empty">
                    <div className="home-apps-empty-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <p className="home-event-venue" style={{ textAlign: "center" }}>
                      {isStudent ? "No applications yet. Browse projects and apply!" : "No applications received yet."}
                    </p>
                  </div>
                ) : (
                  applications.slice(0, 5).map((app) => {
                    const s = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
                    return (
                      <div
                        key={app.id}
                        className="home-event-item home-app-item"
                        onClick={() => navigate(`/dashboard/applications/${app.id}`)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="home-app-item-row">
                          <div className="home-app-item-left">
                            <div className="home-app-item-icon">
                              {isStudent
                                ? (app.projectTitle || "P").charAt(0).toUpperCase()
                                : (app.studentName || "S").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h4 style={{ margin: "0 0 2px" }}>
                                {isStudent ? (app.projectTitle || "Untitled Project") : (app.studentName || "Anonymous Student")}
                              </h4>
                              <p className="home-event-venue" style={{ margin: 0 }}>
                                {isStudent ? (app.projectHost || "") : (app.projectTitle || "")}
                              </p>
                            </div>
                          </div>
                          <span
                            className="home-app-status-badge"
                            style={{ background: s.bg, color: s.color }}
                          >
                            {s.label}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                {!applicationsLoading && applications.length > 5 && (
                  <div className="home-apps-more-row">
                    <button
                      type="button"
                      className="home-section-link"
                      onClick={() => navigate("/dashboard/projects")}
                    >
                      +{applications.length - 5} more application{applications.length - 5 !== 1 ? "s" : ""} →
                    </button>
                  </div>
                )}
              </div>

              <div className="home-help-card">
                <h3>Need Help?</h3>
                <p>
                  Contact the FEP team for queries about applications, eligibility,
                  or partner universities.
                </p>
                <a href="mailto:fep@iitk.ac.in">Contact Support →</a>
              </div>
            </aside>
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Dashboard;