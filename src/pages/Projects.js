import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  auth,
  db,
  onAuthStateChanged,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "../firebase";
import AppShell from "../components/AppShell";
import "../styles/projects.css";
import "../styles/admin.css";
import { notifyApplicationSubmitted } from "../services/api";

const initialProjectForm = {
  title: "",
  description: "",
  stipendType: "Paid",
  stipendMin: "",
  stipendMax: "",
  expenseSupport: [],
  expenseSupportOther: "",
  hasOtherExpense: false,
  location: "Onsite",
  timeCommitment: "Full-time",
  timeline: "",
  deadline: "",
  departments: [],
  openToAll: true,
  cpiRequirement: "",
  priorExperience: "",
  openings: "1",
  eligibleYears: [],
  requiredDocuments: [],
  optionalTags: "",
  status: "open",
};

const initialApplyForm = {
  cpi: "",
  experience: "",
  coverNote: "",
  selectedResumeUrl: "",
  agreedToUndertaking: false,
};

const DEPARTMENT_MAP = {
  "AE": "Aerospace Engineering",
  "BSBE": "Biological Sciences & Bioengineering",
  "CHE": "Chemical Engineering",
  "CE": "Civil Engineering",
  "CGS": "Cognitive Science",
  "CSE": "Computer Science & Engineering",
  "DES": "Design",
  "ES": "Earth Sciences",
  "ECO": "Economic Sciences",
  "EE": "Electrical Engineering",
  "HSS": "Humanities and Social Sciences",
  "IME": "Industrial & Management Engineering",
  "IS": "Intelligent Systems",
  "MSE": "Materials Science & Engineering",
  "ME": "Mechanical Engineering",
  "CHM": "Chemistry",
  "MTH": "Mathematics & Statistics",
  "PHY": "Physics",
  "SPASE": "Space, Planetary & Astronomical Sciences & Engineering",
  "SDS": "Statistics & Data Sciences",
  "SEE": "Sustainable Energy Engineering",
};

const DEPARTMENTS = [
  { code: "AE", name: "Aerospace Engineering" },
  { code: "BSBE", name: "Biological Sciences & Bioengineering" },
  { code: "CHE", name: "Chemical Engineering" },
  { code: "CE", name: "Civil Engineering" },
  { code: "CGS", name: "Cognitive Science" },
  { code: "CSE", name: "Computer Science & Engineering" },
  { code: "DES", name: "Design" },
  { code: "ES", name: "Earth Sciences" },
  { code: "ECO", name: "Economic Sciences" },
  { code: "EE", name: "Electrical Engineering" },
  { code: "HSS", name: "Humanities and Social Sciences" },
  { code: "IME", name: "Industrial & Management Engineering" },
  { code: "IS", name: "Intelligent Systems" },
  { code: "MSE", name: "Materials Science & Engineering" },
  { code: "ME", name: "Mechanical Engineering" },
  { code: "CHM", name: "Chemistry" },
  { code: "MTH", name: "Mathematics & Statistics" },
  { code: "PHY", name: "Physics" },
  { code: "SPASE", name: "Space, Planetary & Astronomical Sciences & Engineering" },
  { code: "SDS", name: "Statistics & Data Sciences" },
  { code: "SEE", name: "Sustainable Energy Engineering" },
];

const getDepartmentCode = (deptStr) => {
  if (!deptStr) return "";
  const clean = deptStr.trim().toUpperCase();
  if (DEPARTMENT_MAP[clean]) return clean;
  for (const [code, fullName] of Object.entries(DEPARTMENT_MAP)) {
    if (fullName.toUpperCase() === clean) return code;
  }
  return clean;
};

const normalizeDepartment = (value) =>
  value.trim().replace(/\s{2,}/g, " ").toUpperCase();

// eslint-disable-next-line no-unused-vars
const parseDepartments = (value) =>
  value
    .split(",")
    .map((item) => normalizeDepartment(item))
    .filter(Boolean);

const getDisplayName = (profile) =>
  profile?.fullName || profile?.name || profile?.email || "Unknown User";

const hasUnreadMessage = (application, role) =>
  role === "professor"
    ? Boolean(application?.unreadForProfessor)
    : Boolean(application?.unreadForStudent);

let _cachedProfile = null;
let _cachedRole = null;
let _cachedProjects = null;
const _creatorCache = new Map();

const readInitialAuth = () => {
  if (_cachedProfile && _cachedRole) {
    return { profile: _cachedProfile, role: _cachedRole };
  }
  try {
    const role = sessionStorage.getItem("fep_role") || null;
    return { profile: _cachedProfile, role: role || _cachedRole };
  } catch {
    return { profile: null, role: null };
  }
};

const ProjectCardSkeleton = () => (
  <div className="project-card-new skeleton-card" aria-hidden="true">
    <div className="project-card-left">
      <div className="skeleton-box skeleton-icon" />
    </div>
    <div className="project-card-middle">
      <div className="skeleton-box skeleton-title" />
      <div className="skeleton-box skeleton-subtitle" />
      <div className="skeleton-box skeleton-desc-line" />
      <div className="skeleton-box skeleton-desc-line short" />
      <div className="skeleton-tags-row">
        <div className="skeleton-box skeleton-tag-pill" style={{ width: "90px" }} />
        <div className="skeleton-box skeleton-tag-pill" style={{ width: "120px" }} />
        <div className="skeleton-box skeleton-tag-pill" style={{ width: "75px" }} />
      </div>
    </div>
    <div className="project-card-right">
      <div className="skeleton-box skeleton-deadline-label" />
      <div className="skeleton-box skeleton-deadline-val" />
    </div>
  </div>
);

const ProjectEmptyState = ({ isSearchActive, onClearFilters, isProfessor, onCreateProject }) => {
  if (isSearchActive) {
    return (
      <div className="projects-empty-card">
        <div className="projects-empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </div>
        <h3>No projects match your criteria</h3>
        <p>Try adjusting your search terms or filter selections to find what you're looking for.</p>
        <button type="button" className="btn-secondary" onClick={onClearFilters} style={{ padding: "8px 18px", borderRadius: "6px", fontSize: "13px" }}>
          Clear Filters
        </button>
      </div>
    );
  }

  if (isProfessor) {
    return (
      <div className="projects-empty-card">
        <div className="projects-empty-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
        <h3>No projects created yet</h3>
        <p>Post a research opportunity and start accepting applications from interested students.</p>
        <button type="button" className="btn-primary" onClick={onCreateProject} style={{ padding: "8px 18px", borderRadius: "6px", fontSize: "13px" }}>
          Create Project
        </button>
      </div>
    );
  }

  return (
    <div className="projects-empty-card">
      <div className="projects-empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      </div>
      <h3>No projects available right now</h3>
      <p>There are no open research opportunities at the moment. Please check back soon.</p>
    </div>
  );
};

const Projects = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialAuth = readInitialAuth();
  const [loading, setLoading] = useState(!initialAuth.role && !initialAuth.profile);
  const [role, setRole] = useState(initialAuth.role);
  const [userProfile, setUserProfile] = useState(initialAuth.profile);
  const [projects, setProjects] = useState(_cachedProjects || []);
  const [projectsLoading, setProjectsLoading] = useState(!_cachedProjects || _cachedProjects.length === 0);
  const [applicationsByProject, setApplicationsByProject] = useState({});
  const [studentApplications, setStudentApplications] = useState([]);
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [formError, setFormError] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [activeApplyProjectId, setActiveApplyProjectId] = useState(null);
  const [applyForm, setApplyForm] = useState(initialApplyForm);
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [applyError, setApplyError] = useState("");
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [withdrawingApp, setWithdrawingApp] = useState(false);
  const [showWithdrawConfirmForId, setShowWithdrawConfirmForId] = useState(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [activeApplicationsProjectId, setActiveApplicationsProjectId] = useState(null);
  const [editingProjectId, setEditingProjectId] = useState(null);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  useEffect(() => {
    if (userProfile && role === "professor") {
      const searchParams = new URLSearchParams(location.search);
      if (searchParams.get("action") === "create") {
        setShowProjectForm(true);
        navigate("/dashboard/projects", { replace: true });
      }
    }
  }, [location.search, userProfile, role, navigate]);

  // Search and filter states
  const [professorSearch, setProfessorSearch] = useState("");
  const [professorStatusFilter, setProfessorStatusFilter] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState("all");

  // Applications overlay search, filter, and sorting states
  const [appStatusFilter, setAppStatusFilter] = useState("all");
  const [appNameSearch, setAppNameSearch] = useState("");
  const [appSortBy, setAppSortBy] = useState("cpi-desc");

  const isProfessor = role === "professor";
  const isStudent = role === "student";

  const getProjectUnreadCount = (projectId) =>
    (applicationsByProject[projectId] || []).filter((app) =>
      hasUnreadMessage(app, role)
    ).length;

  const studentDepartments = useMemo(() => {
    if (!userProfile) return [];
    return [userProfile.department1, userProfile.department2]
      .filter(Boolean)
      .map((value) => getDepartmentCode(value));
  }, [userProfile]);

  const isEligibleForProject = (project) => {
    if (project.openToAll) return true;
    const projectDepartmentCodes = (project.departments || []).map((dept) =>
      getDepartmentCode(dept)
    );
    return projectDepartmentCodes.some((code) => studentDepartments.includes(code));
  };

  // Filter projects based on search and filters
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        project.title.toLowerCase().includes(professorSearch.toLowerCase()) ||
        project.description.toLowerCase().includes(professorSearch.toLowerCase());
      const matchesStatus =
        professorStatusFilter === "all" || project.status === professorStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, professorSearch, professorStatusFilter]);

  // Filter student projects
  const filteredStudentProjects = useMemo(() => {
    return projects.filter((project) => {
      // Admin Approval: only show approved projects (or legacy projects)
      const isApproved = !project.publishingStatus || project.publishingStatus === "approved";
      if (!isApproved) return false;

      const q = studentSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        project.title?.toLowerCase().includes(q) ||
        project.description?.toLowerCase().includes(q) ||
        project.createdByName?.toLowerCase().includes(q) ||
        project.createdByInstitute?.toLowerCase().includes(q) ||
        (project.departments || []).some((dept) =>
          dept.toLowerCase().includes(q)
        );
      const matchesStatus =
        studentStatusFilter === "all" || project.status === studentStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, studentSearch, studentStatusFilter]);

  // Real-time Projects Listener
  useEffect(() => {
    if (!role || !userProfile) return;

    setProjectsLoading(true);

    let q;
    if (role === "professor") {
      q = query(collection(db, "projects"), where("createdBy", "==", userProfile.id));
    } else {
      q = query(collection(db, "projects"), where("publishingStatus", "==", "approved"));
    }

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const rawProjects = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setProjects(rawProjects);
        _cachedProjects = rawProjects;
        setProjectsLoading(false);

        const creatorIds = [...new Set(rawProjects.map((p) => p.createdBy).filter(Boolean))];
        const uncachedIds = creatorIds.filter((uid) => !_creatorCache.has(uid));

        if (uncachedIds.length > 0) {
          await Promise.all(
            uncachedIds.map(async (uid) => {
              try {
                const uSnap = await getDoc(doc(db, "users", uid));
                if (uSnap.exists()) {
                  _creatorCache.set(uid, uSnap.data());
                }
              } catch (err) {
                console.error("Error fetching creator user details:", err);
              }
            })
          );
        }

        const enrichedProjects = rawProjects.map((p) => {
          const creatorData = _creatorCache.get(p.createdBy);
          return {
            ...p,
            createdByInstitute: p.createdByInstitute || creatorData?.institute || "",
            createdByName: p.createdByName || creatorData?.fullName || creatorData?.name || "",
          };
        });

        setProjects(enrichedProjects);
        _cachedProjects = enrichedProjects;
      },
      (err) => {
        console.error("Error in projects real-time listener:", err);
        setProjectsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [role, userProfile]);

  // Auth listener
  useEffect(() => {
    let isMounted = true;
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
        setProjectsLoading(false);
      }
    }, 6000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        _cachedProfile = null;
        _cachedRole = null;
        _cachedProjects = null;
        if (isMounted) {
          setLoading(false);
          setProjectsLoading(false);
          navigate("/login");
        }
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data() || {};

        const profileData = { id: user.uid, ...userData };
        const userRole = userData?.role || null;
        _cachedProfile = profileData;
        _cachedRole = userRole;

        if (isMounted) {
          setUserProfile(profileData);
          setRole(userRole);
        }
      } catch (err) {
        console.error("Auth load error:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [navigate]);

  // Real-time applications listener
  useEffect(() => {
    if (!userProfile || !role) return;

    let appQuery;
    if (role === "professor") {
      appQuery = query(
        collection(db, "applications"),
        where("professorId", "==", userProfile.id),
        where("adminApprovalStatus", "==", "approved")
      );
    } else {
      appQuery = query(
        collection(db, "applications"),
        where("studentId", "==", userProfile.id)
      );
    }

    const unsubscribe = onSnapshot(appQuery, (snapshot) => {
      if (role === "professor") {
        const grouped = {};
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!grouped[data.projectId]) grouped[data.projectId] = [];
          grouped[data.projectId].push({ id: docSnap.id, ...data });
        });
        setApplicationsByProject(grouped);
      } else {
        setStudentApplications(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
        );
      }
    }, (err) => {
      console.error("Applications snapshot load error:", err);
    });

    return () => unsubscribe();
  }, [userProfile, role]);

  // Real-time messages listener with read-marking auto clearing
  useEffect(() => {
    if (!selectedApplicationId || !userProfile || !role) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(
      db,
      "applications",
      selectedApplicationId,
      "messages"
    );
    const q = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const appDoc = await getDoc(doc(db, "applications", selectedApplicationId));
        if (appDoc.exists()) {
          const appData = appDoc.data();
          const unreadField = role === "professor" ? "unreadForProfessor" : "unreadForStudent";
          if (appData[unreadField]) {
            await updateDoc(doc(db, "applications", selectedApplicationId), {
              [unreadField]: false,
            });
          }
        }
      } catch (e) {
        console.warn("Message sync warning:", e);
      }

      const nextMessages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          message: data.message || "",
        };
      });
      setMessages(nextMessages);
    }, (err) => {
      console.warn("Messages snapshot error:", err);
    });

    return () => unsubscribe();
  }, [selectedApplicationId, userProfile, role]);

  // Close message overlay with Esc key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && selectedApplicationId) {
        setSelectedApplicationId(null);
      }
      if (e.key === "Escape" && activeApplicationsProjectId) {
        setActiveApplicationsProjectId(null);
      }
      if (e.key === "Escape" && selectedProjectId) {
        setSelectedProjectId(null);
        setActiveApplyProjectId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedApplicationId, activeApplicationsProjectId, selectedProjectId]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!projectForm.title.trim()) {
      setFormError("Project title is required");
      return;
    }

    if (projectForm.cpiRequirement) {
      const cpi = parseFloat(projectForm.cpiRequirement);
      if (isNaN(cpi) || cpi < 0 || cpi > 10) {
        setFormError("CPI Requirement must be a number between 0 and 10.");
        return;
      }
    }

    setSavingProject(true);

    try {
      const depts = projectForm.openToAll ? [] : projectForm.departments;

      // Construct backward compatible compensation text
      const hasPhysicalLocation = projectForm.location === "Onsite" || projectForm.location === "Hybrid";
      const expSupport = hasPhysicalLocation ? (projectForm.expenseSupport || []) : [];
      const expOther = hasPhysicalLocation ? (projectForm.expenseSupportOther || "") : "";

      let compText = "Unpaid";
      if (projectForm.stipendType === "Paid") {
        compText = projectForm.stipendMin
          ? `${projectForm.stipendMin} / mo`
          : "Paid";
      } else {
        compText = (expSupport.length > 0 || expOther)
          ? "Unpaid (Expenses Covered)"
          : "Unpaid";
      }

      const projectData = {
        title: projectForm.title,
        description: projectForm.description,
        stipendType: projectForm.stipendType,
        stipendMin: projectForm.stipendType === "Paid" && projectForm.stipendMin ? parseFloat(projectForm.stipendMin) : null,
        stipendMax: null,
        compensation: compText, // backward compatibility
        expenseSupport: expSupport,
        expenseSupportOther: expOther,
        location: projectForm.location,
        timeCommitment: projectForm.timeCommitment,
        timeline: projectForm.timeline,
        deadline: projectForm.deadline || null,
        departments: depts,
        openToAll: projectForm.openToAll,
        cpiRequirement: projectForm.cpiRequirement ? parseFloat(projectForm.cpiRequirement) : null,
        priorExperience: projectForm.priorExperience,
        openings: parseInt(projectForm.openings) || 1,
        eligibleYears: projectForm.eligibleYears || [],
        requiredDocuments: projectForm.requiredDocuments || [],
        optionalTags: projectForm.optionalTags || "",
        status: projectForm.status,
        createdByInstitute: userProfile.institute || "",
      };

      if (editingProjectId) {
        // Edit existing project
        await updateDoc(doc(db, "projects", editingProjectId), projectData);
      } else {
        // Create new project
        await addDoc(collection(db, "projects"), {
          ...projectData,
          createdBy: userProfile.id,
          createdByName: getDisplayName(userProfile),
          publishingStatus: "pending",
          createdAt: serverTimestamp(),
        });
      }

      setProjectForm(initialProjectForm);
      setEditingProjectId(null);
      setShowProjectForm(false);
    } catch (error) {
      setFormError(`Error saving project: ${error.message}`);
    } finally {
      setSavingProject(false);
    }
  };

  const handleUpdateProjectStatus = async (projectId, newStatus) => {
    try {
      await updateDoc(doc(db, "projects", projectId), {
        status: newStatus,
      });
    } catch (error) {
      setFormError("Error updating project: " + error.message);
    }
  };

  const handleApplyToProject = async (e) => {
    e.preventDefault();
    if (!activeApplyProjectId) return;

    const project = projects.find((p) => p.id === activeApplyProjectId);
    if (!project) return;

    const cpi = parseFloat(applyForm.cpi);
    if (project.cpiRequirement && cpi < project.cpiRequirement) {
      setApplyError(
        `Your CPI (${cpi}) is below the requirement (${project.cpiRequirement})`
      );
      return;
    }

    if (!applyForm.selectedResumeUrl) {
      setApplyError("Please select a resume from your profile");
      return;
    }

    if (!applyForm.agreedToUndertaking) {
      setApplyError("You must agree to the undertaking before submitting your application.");
      return;
    }

    setApplySubmitting(true);
    setApplyError("");

    try {
      const resumeUrl = applyForm.selectedResumeUrl;

      const existingApp = await getDocs(
        query(
          collection(db, "applications"),
          where("studentId", "==", userProfile.id),
          where("projectId", "==", activeApplyProjectId)
        )
      );

      if (existingApp.docs.length > 0) {
        setApplyError("You have already applied to this project");
        setApplySubmitting(false);
        return;
      }

      // Attach selected profile documents
      const profileDocs = userProfile?.documents || [];
      const attachedDocs = profileDocs
        .filter((d, idx) => {
          const docKey = d.id || d.storagePath || d.url || idx;
          return selectedDocIds.includes(docKey);
        })
        .map((d) => ({
          name: d.name || "Document",
          fileName: d.fileName || "",
          url: d.url,
          storagePath: d.storagePath || "",
          uploadedAt: d.uploadedAt || new Date().toISOString(),
        }));

      const applicationRef = await addDoc(collection(db, "applications"), {
        projectId: activeApplyProjectId,
        professorId: project.createdBy,
        studentId: userProfile.id,
        studentName: getDisplayName(userProfile),
        cpi: cpi,
        experience: applyForm.experience,
        coverNote: applyForm.coverNote,
        resumeUrl: resumeUrl,
        documents: attachedDocs,
        status: "applied",
        adminApprovalStatus: "pending",
        agreedToUndertaking: true,
        undertakingAgreedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      const token = await auth.currentUser.getIdToken();
      await notifyApplicationSubmitted(token, {
        applicationId: applicationRef.id,
        origin: `${window.location.origin}/fep`,
      });

      setApplyForm(initialApplyForm);
      setSelectedDocIds([]);
      setActiveApplyProjectId(null);
    } catch (error) {
      setApplyError("Error submitting application: " + error.message);
    } finally {
      setApplySubmitting(false);
    }
  };

  const handleWithdrawApplication = async (appId) => {
    if (!appId || !userProfile) return;
    const appToDelete = studentApplications.find((a) => a.id === appId);
    if (!appToDelete) return;

    setWithdrawingApp(true);
    try {
      const messagesSnap = await getDocs(
        collection(db, "applications", appId, "messages")
      );
      for (const m of messagesSnap.docs) {
        await deleteDoc(m.ref);
      }

      await deleteDoc(doc(db, "applications", appId));

      setShowWithdrawConfirmForId(null);
    } catch (error) {
      console.error("Error withdrawing application:", error);
      alert("Failed to withdraw application: " + error.message);
    } finally {
      setWithdrawingApp(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedApplicationId || !messageText.trim() || !userProfile) return;

    setMessageSending(true);

    try {
      const appRef = doc(db, "applications", selectedApplicationId);

      await addDoc(
        collection(db, "applications", selectedApplicationId, "messages"),
        {
          senderId: userProfile.id,
          senderRole: role,
          message: messageText.trim(),
          createdAt: serverTimestamp(),
        }
      );

      await updateDoc(appRef, {
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: userProfile.id,
        lastMessageSenderRole: role,
        unreadForProfessor: role !== "professor",
        unreadForStudent: role !== "student",
      });

      setMessageText("");
    } catch (error) {
      console.error("Error sending message:", error);
      setFormError("Failed to send message. Please try again.");
    } finally {
      setMessageSending(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const renderProjectListMeta = (project) => (
    <div className="k-meta-row project-meta-mini">
      {project.compensation && (
        <span className="k-meta-chip">{project.compensation}</span>
      )}
      {project.location && (
        <span className="k-meta-chip">{project.location}</span>
      )}
      {project.deadline && (
        <span className="k-meta-chip">
          Due {new Date(project.deadline).toLocaleDateString()}
        </span>
      )}
      <span className="k-meta-chip">
        {project.openings || 1} opening{(project.openings || 1) > 1 ? "s" : ""}
      </span>
    </div>
  );

  const renderProjectMeta = (project) => (
    <>
      <div className="project-info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', margin: '20px 0 24px' }}>
        <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px' }}>
          <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Stipend</span>
          <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>{project.compensation || "Not specified"}</span>
        </div>
        {(project.location === "Onsite" || project.location === "Hybrid") && ((project.expenseSupport && project.expenseSupport.length > 0) || project.expenseSupportOther) && (
          <div className="project-info-item" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px' }}>
            <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Expense Support Provided</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
              {(project.expenseSupport || []).map((exp, idx) => (
                <span key={idx} style={{ fontSize: '12px', fontWeight: '600', color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '3px 10px', borderRadius: '16px' }}>
                  ✓ {exp}
                </span>
              ))}
              {project.expenseSupportOther && (
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '3px 10px', borderRadius: '16px' }}>
                  ✓ {project.expenseSupportOther}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px' }}>
          <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Location</span>
          <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>{project.location || "Not specified"}</span>
        </div>
        <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px' }}>
          <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Time Commitment</span>
          <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>{project.timeCommitment || "Not specified"}</span>
        </div>
        <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px' }}>
          <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Timeline</span>
          <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>{project.timeline || "Not specified"}</span>
        </div>
        <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px' }}>
          <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Openings</span>
          <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>{project.openings || 1}</span>
        </div>
        <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px' }}>
          <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Required CPI</span>
          <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>{project.cpiRequirement ?? "Not specified"}</span>
        </div>
        {project.deadline && (
          <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px' }}>
            <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Application Deadline</span>
            <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>{new Date(project.deadline).toLocaleDateString()}</span>
          </div>
        )}
        <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px', gridColumn: 'span 2' }}>
          <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Eligible Departments</span>
          <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>
            {project.openToAll
              ? "Open to all departments"
              : (project.departments || []).map(code => DEPARTMENT_MAP[code] || code).join(", ") || "Not specified"}
          </span>
        </div>
        {project.eligibleYears && project.eligibleYears.length > 0 && (
          <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px', gridColumn: 'span 2' }}>
            <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Eligible Years</span>
            <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>
              {project.eligibleYears.join(", ")}
            </span>
          </div>
        )}
        {project.requiredDocuments && project.requiredDocuments.length > 0 && (
          <div className="project-info-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '12px', gridColumn: 'span 2' }}>
            <span className="project-info-label" style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--app-muted, #64748b)', letterSpacing: '0.05em' }}>Required Documents</span>
            <span className="project-info-value" style={{ fontSize: '14px', fontWeight: '600', color: 'var(--app-ink, #0f172a)' }}>
              {project.requiredDocuments.join(", ")}
            </span>
          </div>
        )}
      </div>

      {project.description && (
        <div className="project-detail-section" style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--app-muted, #64748b)', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>Description</h3>
          <p style={{ margin: 0, fontSize: '14.5px', lineHeight: '1.7', color: 'var(--app-ink, #334155)', whiteSpace: 'pre-wrap' }}>{project.description}</p>
        </div>
      )}

      {project.priorExperience && (
        <div className="project-detail-section" style={{ marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--app-muted, #64748b)', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>Prior Experience</h3>
          <p style={{ margin: 0, fontSize: '14.5px', lineHeight: '1.7', color: 'var(--app-ink, #334155)', whiteSpace: 'pre-wrap' }}>{project.priorExperience}</p>
        </div>
      )}</>
  );

  if (loading) {
    return (
      <AppShell searchPlaceholder="Search projects...">
        <div className="shell-page projects-page">
          <div className="projects-header">
            <div>
              <div className="skeleton-box" style={{ width: "180px", height: "28px", marginBottom: "8px" }} />
              <div className="skeleton-box" style={{ width: "280px", height: "16px" }} />
            </div>
            <div className="projects-header-actions">
              <div className="skeleton-box" style={{ width: "80px", height: "36px", borderRadius: "6px" }} />
              <div className="skeleton-box" style={{ width: "80px", height: "36px", borderRadius: "6px" }} />
            </div>
          </div>
          <div className="projects-layout-single">
            <div className="projects-list">
              {[1, 2, 3].map((n) => (
                <ProjectCardSkeleton key={n} />
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // Render messaging overlay
  const renderMessagingOverlay = () => {
    if (!selectedApplicationId) return null;

    return (
      <div className="messages-overlay">
        <div className="messages-panel">
          <button
            onClick={() => setSelectedApplicationId(null)}
            className="messages-close-btn"
            title="Close chat (Esc)"
          >
            ✕
          </button>
          <h3>Messages</h3>
          <div className="messages-list">
            {messages.length === 0 ? (
              <p className="empty-state">No messages yet.</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`message-item ${message.senderRole}`}
                >
                  <div className="message-sender">
                    {message.senderRole}
                  </div>
                  <div className="message-content">
                    {message.message}
                  </div>
                  <div className="message-time">
                    {message.createdAt
                      ? new Date(
                        message.createdAt.toDate?.() ||
                        message.createdAt
                      ).toLocaleString()
                      : ""}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="message-input-section">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type a message..."
              className="form-textarea"
            />
            <button
              onClick={handleSendMessage}
              disabled={messageSending}
              className="btn-primary"
            >
              {messageSending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderApplicationsOverlay = () => {
    if (!activeApplicationsProjectId) return null;

    const project = projects.find((item) => item.id === activeApplicationsProjectId);
    const apps = applicationsByProject[activeApplicationsProjectId] || [];

    const countByStatus = {
      all: apps.length,
      applied: apps.filter(a => a.status === "applied" || a.status === "pending").length,
      shortlisted: apps.filter(a => a.status === "shortlisted").length,
      selected: apps.filter(a => a.status === "selected").length,
      rejected: apps.filter(a => a.status === "rejected").length,
    };

    const filteredApps = apps.filter((app) => {
      const matchesSearch = (app.studentName || "").toLowerCase().includes(appNameSearch.toLowerCase());

      let matchesStatus = true;
      if (appStatusFilter !== "all") {
        if (appStatusFilter === "applied") {
          matchesStatus = app.status === "applied" || app.status === "pending";
        } else {
          matchesStatus = app.status === appStatusFilter;
        }
      }

      return matchesSearch && matchesStatus;
    });

    const sortedApps = [...filteredApps].sort((a, b) => {
      if (appSortBy === "cpi-desc") {
        return (b.cpi || 0) - (a.cpi || 0);
      }
      if (appSortBy === "cpi-asc") {
        return (a.cpi || 0) - (b.cpi || 0);
      }
      if (appSortBy === "date-desc") {
        const dateA = a.createdAt?.toDate?.()?.getTime() || a.createdAt || 0;
        const dateB = b.createdAt?.toDate?.()?.getTime() || b.createdAt || 0;
        return dateB - dateA;
      }
      if (appSortBy === "date-asc") {
        const dateA = a.createdAt?.toDate?.()?.getTime() || a.createdAt || 0;
        const dateB = b.createdAt?.toDate?.()?.getTime() || b.createdAt || 0;
        return dateA - dateB;
      }
      return 0;
    });

    const getAvatarInitials = (name) => {
      if (!name) return "U";
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    };

    const avatarBgColors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#ec4899", "#ef4444"];
    const getAvatarColor = (name) => {
      if (!name) return avatarBgColors[0];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return avatarBgColors[Math.abs(hash) % avatarBgColors.length];
    };

    return (
      <div className="applications-overlay">
        <div className="applications-overlay-panel">
          <div className="applications-overlay-header">
            <div>
              <h3>Applications</h3>
              <p>{project?.title || "Selected Project"} - {apps.length} total</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveApplicationsProjectId(null);
                setAppStatusFilter("all");
                setAppNameSearch("");
                setAppSortBy("cpi-desc");
              }}
              className="messages-close-btn"
              title="Close applications (Esc)"
            >
              ✕
            </button>
          </div>

          <div className="apps-filter-bar">
            <div className="apps-search-wrapper">
              <svg className="apps-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3-3" />
              </svg>
              <input
                type="text"
                placeholder="Search candidates..."
                value={appNameSearch}
                onChange={(e) => setAppNameSearch(e.target.value)}
                className="apps-search-input"
              />
            </div>

            <div className="apps-status-pills">
              {Object.keys(countByStatus).map((statusKey) => (
                <button
                  key={statusKey}
                  type="button"
                  className={`apps-status-pill ${appStatusFilter === statusKey ? 'active' : ''}`}
                  onClick={() => setAppStatusFilter(statusKey)}
                >
                  <span className="pill-label">
                    {statusKey.charAt(0).toUpperCase() + statusKey.slice(1)}
                  </span>
                  <span className="pill-count">
                    {countByStatus[statusKey]}
                  </span>
                </button>
              ))}
            </div>

            <div className="apps-sort-wrapper">
              <span className="sort-label">Sort:</span>
              <select
                value={appSortBy}
                onChange={(e) => setAppSortBy(e.target.value)}
                className="apps-sort-select"
              >
                <option value="cpi-desc">CPI (Highest First)</option>
                <option value="cpi-asc">CPI (Lowest First)</option>
                <option value="date-desc">Date (Newest First)</option>
                <option value="date-asc">Date (Oldest First)</option>
              </select>
            </div>
          </div>

          <div className="applications-overlay-list apps-table-container">
            {sortedApps.length === 0 ? (
              <div className="apps-empty-state">
                <svg className="empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                <p>No candidates found matching the filters.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="apps-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>CPI</th>
                      <th>Experience / Skills</th>
                      <th>Applied Date</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedApps.map((app) => {
                      const avatarInitials = getAvatarInitials(app.studentName);
                      const avatarBg = getAvatarColor(app.studentName);
                      const formattedDate = app.createdAt
                        ? new Date(app.createdAt.toDate?.() || app.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                        : "N/A";
                      const unread = hasUnreadMessage(app, role);

                      return (
                        <tr key={app.id} className={unread ? "unread-row" : ""}>
                          <td>
                            <div className="student-info-cell">
                              <div
                                className="student-avatar-circle"
                                style={{ backgroundColor: avatarBg }}
                              >
                                {avatarInitials}
                              </div>
                              <div className="student-name-wrapper">
                                <span className="student-name">{app.studentName}</span>
                                {unread && (
                                  <span className="app-unread-badge">
                                    New Message
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="apps-cpi-badge">
                              {app.cpi ? app.cpi.toFixed(2) : "N/A"}
                            </span>
                          </td>
                          <td>
                            <div className="apps-exp-trunc" title={app.experience}>
                              {app.experience || <span className="text-muted">None specified</span>}
                            </div>
                          </td>
                          <td>
                            <span className="apps-date">{formattedDate}</span>
                          </td>
                          <td>
                            <span className={`status-badge status-${app.status}`}>
                              {app.status}
                            </span>
                          </td>
                          <td className="text-right">
                            <div className="apps-actions-wrapper">
                              {app.resumeUrl && (
                                <a
                                  href={app.resumeUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-link"
                                >
                                  View Resume
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => navigate(`/dashboard/applications/${app.id}`)}
                                className="btn-primary"
                              >
                                View Application
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDetailsModal = () => {
    if (!selectedProjectId) return null;

    const project = projects.find((p) => p.id === selectedProjectId);
    if (!project) return null;

    const myApp = studentApplications.find((a) => a.projectId === project.id);

    return (
      <div className="details-overlay" onClick={(e) => { if (e.target.className === 'details-overlay') { setSelectedProjectId(null); setActiveApplyProjectId(null); } }}>
        <div className="details-modal">
          <div className="details-modal-header">
            <h2 className="details-modal-title">{project.title}</h2>
            <button
              className="details-modal-close"
              onClick={() => {
                setSelectedProjectId(null);
                setActiveApplyProjectId(null);
              }}
            >
              &times;
            </button>
          </div>
          <div className="details-modal-content">
            <div className="project-author-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--app-border, #e2e8f0)' }}>
              <div className="project-author-avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--app-primary, #0f294a)', color: '#fff', display: 'flex', alignItems: 'center', justify: 'center', fontSize: '16px', fontWeight: '600', flexShrink: 0 }}>
                {(project.createdByName || "U").charAt(0).toUpperCase()}
              </div>
              <div className="project-author-info" style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="project-author-role" style={{ fontSize: '12px', fontWeight: '500', color: 'var(--app-muted, #64748b)', lineSpacing: '1.2' }}>Project Publisher</span>
                <span className="project-author-name" style={{ fontSize: '15px', fontWeight: '600', color: 'var(--app-ink, #0f172a)', lineSpacing: '1.4' }}>
                  {project.createdByName || "Unknown User"}
                  {project.createdByInstitute && ` (${project.createdByInstitute})`}
                </span>
              </div>
            </div>

            {project.optionalTags && (
              <div className="project-detail-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {project.optionalTags.split(',').map(tag => tag.trim()).filter(Boolean).map((tag, idx) => (
                  <span key={idx} className="tag-pill" style={{ fontSize: '12.5px', padding: '6px 12px', background: '#edf2f7', color: '#2d3748', borderRadius: '20px', fontWeight: '600' }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {isStudent && (
              <>
                {renderProjectMeta(project)}

                {!myApp ? (
                  activeApplyProjectId === project.id ? (
                    <form onSubmit={handleApplyToProject} className="apply-form">
                      <h3>Apply for Project</h3>
                      {!isEligibleForProject(project) && (
                        <div className="eligibility-advisory" style={{
                          marginBottom: '16px',
                          padding: '12px',
                          background: '#fff7ed',
                          border: '1px solid #ffedd5',
                          borderRadius: '6px',
                          color: '#c2410c',
                          fontSize: '13px',
                          lineHeight: '1.5'
                        }}>
                          <strong>Advisory:</strong> You do not belong to the target departments configured for this project. However, you are still allowed to submit your application.
                        </div>
                      )}
                      {applyError && (
                        <div className="error-message">{applyError}</div>
                      )}

                      <div className="apply-field-group">
                        <label className="form-label">
                          <span>Current CPI <strong style={{ color: "#dc2626" }}>*</strong></span>
                          <input
                            type="number"
                            placeholder="e.g., 8.5"
                            step="0.01"
                            min="0"
                            max="10"
                            value={applyForm.cpi}
                            onChange={(e) =>
                              setApplyForm({ ...applyForm, cpi: e.target.value })
                            }
                            className="form-input"
                            required
                          />
                        </label>
                      </div>

                      <div className="apply-field-group">
                        <label className="form-label">
                          <span>Relevant Experience</span>
                          <textarea
                            placeholder="Briefly describe your relevant coursework, projects, or technical skills..."
                            value={applyForm.experience}
                            onChange={(e) =>
                              setApplyForm({
                                ...applyForm,
                                experience: e.target.value,
                              })
                            }
                            className="form-textarea"
                            rows={3}
                          />
                        </label>
                      </div>

                      <div className="apply-field-group">
                        <label className="form-label">
                          <span>Cover Note</span>
                          <textarea
                            placeholder="Why are you interested in this project? What makes you a good fit?"
                            value={applyForm.coverNote}
                            onChange={(e) =>
                              setApplyForm({
                                ...applyForm,
                                coverNote: e.target.value,
                              })
                            }
                            className="form-textarea"
                            rows={3}
                          />
                        </label>
                      </div>

                      <div className="apply-field-group">
                        {(() => {
                          const totalResumes = userProfile.resumes || [];

                          if (totalResumes.length === 0) {
                            return (
                              <div className="no-resumes-warning" style={{ margin: "14px 0", padding: "14px", background: "#fff5f5", border: "1px solid #ffcccc", borderRadius: "8px", color: "#cc0000", fontSize: "13px" }}>
                                <p style={{ margin: "0 0 8px 0", fontWeight: "500" }}>You haven't uploaded any resumes to your profile yet.</p>
                                <button
                                  type="button"
                                  onClick={() => navigate("/dashboard/profile")}
                                  className="btn-secondary"
                                  style={{ padding: "6px 12px", fontSize: "12.5px" }}
                                >
                                  Go to Profile to Upload Resume
                                </button>
                              </div>
                            );
                          }

                          return (
                            <label className="form-label">
                              <span>Select Resume <strong style={{ color: "#dc2626" }}>*</strong></span>
                              <div className="select-wrapper">
                                <select
                                  value={applyForm.selectedResumeUrl}
                                  onChange={(e) =>
                                    setApplyForm({
                                      ...applyForm,
                                      selectedResumeUrl: e.target.value,
                                    })
                                  }
                                  className="form-input form-select"
                                  required
                                >
                                  <option value="">-- Select a Resume --</option>
                                  {totalResumes.map((r, idx) => (
                                    <option key={idx} value={r.url}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </label>
                          );
                        })()}
                      </div>

                      {/* Supporting Documents (From Profile Library) */}
                      <div className="additional-docs-section" style={{ marginTop: "16px", marginBottom: "16px", padding: "14px", background: "var(--app-surface, #ffffff)", border: "1px solid var(--app-border, #e2e8f0)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                          <span style={{ fontWeight: "600", fontSize: "13.5px", color: "var(--app-ink, #0f172a)" }}>
                            Supporting Documents <span style={{ fontSize: "12px", fontWeight: "normal", color: "var(--app-muted, #64748b)" }}>(Optional)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => navigate("/dashboard/profile")}
                            className="btn-secondary"
                            style={{ padding: "4px 10px", fontSize: "11.5px" }}
                          >
                            Manage Documents in Profile ↗
                          </button>
                        </div>

                        {project.requiredDocuments && project.requiredDocuments.length > 0 && (
                          <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#0369a1", background: "#f0f9ff", border: "1px solid #bae6fd", padding: "6px 10px", borderRadius: "6px" }}>
                            <strong>Suggested by Professor:</strong> {project.requiredDocuments.join(", ")}
                          </p>
                        )}

                        {(!userProfile?.documents || userProfile.documents.length === 0) ? (
                          <div style={{ padding: "12px", background: "var(--app-surface-muted, #f8fafc)", border: "1px dashed var(--app-border, #cbd5e1)", borderRadius: "6px", fontSize: "12.5px", color: "var(--app-muted, #64748b)" }}>
                            No additional documents in your profile library yet. If you wish to attach transcripts, certificates, or an SOP, upload them in your <button type="button" onClick={() => navigate("/dashboard/profile")} style={{ background: "none", border: "none", color: "var(--app-primary, #0284c7)", fontWeight: "600", cursor: "pointer", padding: 0, textDecoration: "underline", font: "inherit" }}>Profile</button>.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "var(--app-muted, #64748b)" }}>
                              Select any documents from your profile to attach with this application:
                            </p>
                            {userProfile.documents.map((docItem, idx) => {
                              const docKey = docItem.id || docItem.storagePath || docItem.url || idx;
                              const isChecked = selectedDocIds.includes(docKey);
                              return (
                                <label
                                  key={docKey}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "8px 12px",
                                    background: isChecked ? "#eff6ff" : "var(--app-surface-muted, #f8fafc)",
                                    border: isChecked ? "1.5px solid #3b82f6" : "1px solid var(--app-border, #e2e8f0)",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedDocIds((prev) => [...prev, docKey]);
                                      } else {
                                        setSelectedDocIds((prev) => prev.filter((k) => k !== docKey));
                                      }
                                    }}
                                    style={{ width: "16px", height: "16px", accentColor: "var(--app-primary, #0284c7)" }}
                                  />
                                  <span style={{ fontSize: "13px", fontWeight: isChecked ? "650" : "500", color: "var(--app-ink, #0f172a)", flex: 1 }}>
                                    📎 {docItem.name} {docItem.fileName ? <span style={{ color: "#64748b", fontWeight: "normal", fontSize: "12px" }}>({docItem.fileName})</span> : ""}
                                  </span>
                                  <a
                                    href={docItem.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ fontSize: "11.5px", color: "var(--app-primary, #0284c7)", textDecoration: "none", fontWeight: "600" }}
                                  >
                                    Preview ↗
                                  </a>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="application-undertaking-box">
                        <div className="undertaking-header">Student Undertaking</div>
                        <p className="undertaking-text">
                          Applicants must ensure their availability and commitment to devote sufficient time to the project. Withdrawal or backing out after selection, except under circumstances approved by the FEP Team, may result in disciplinary action, including being barred from future opportunities facilitated by the Academics and Career Council (AnC).
                        </p>
                        <label className="undertaking-checkbox-label">
                          <input
                            type="checkbox"
                            checked={Boolean(applyForm.agreedToUndertaking)}
                            onChange={(e) =>
                              setApplyForm({
                                ...applyForm,
                                agreedToUndertaking: e.target.checked,
                              })
                            }
                            required
                          />
                          <span>
                            I agree to commit sufficient time to this project if selected, and understand that unauthorized withdrawal after selection may result in disciplinary action and debarment from future AnC opportunities.
                          </span>
                        </label>
                      </div>

                      <div className="form-buttons">
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={applySubmitting}
                        >
                          {applySubmitting ? "Submitting..." : "Submit Application"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveApplyProjectId(null);
                            setApplyForm(initialApplyForm);
                            setSelectedDocIds([]);
                            setApplyError("");
                          }}
                          className="btn-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setActiveApplyProjectId(project.id);
                        const userResumes = userProfile.resumes || [];
                        const defaultResume = userResumes[0]?.url || "";
                        setApplyForm({
                          ...initialApplyForm,
                          selectedResumeUrl: defaultResume,
                        });
                        setSelectedDocIds([]);
                      }}
                      className="btn-primary"
                    >
                      Apply for Project
                    </button>
                  )
                ) : (
                  <div className="application-status">
                    <h3>Your Application</h3>

                    {/* Admin approval status banner */}
                    {(!myApp.adminApprovalStatus || myApp.adminApprovalStatus === "pending") && (
                      <div className="admin-approval-notice admin-approval-pending">
                        <span className="approval-notice-icon">⏳</span>
                        <div>
                          <strong>Pending Admin Review</strong>
                          <p>Your application is being reviewed by the admin before it is forwarded to the professor.</p>
                        </div>
                      </div>
                    )}
                    {myApp.adminApprovalStatus === "rejected" && (
                      <div className="admin-approval-notice admin-approval-rejected">
                        <span className="approval-notice-icon">✕</span>
                        <div>
                          <strong>Rejected by Admin</strong>
                          <p>Your application was not approved by the admin and will not be forwarded to the professor.</p>
                        </div>
                      </div>
                    )}

                    <div className="status-display">
                      <strong>Status:</strong>{" "}
                      <span className={`status-badge status-${myApp.status}`}>
                        {myApp.status}
                      </span>
                      {myApp.adminApprovalStatus && (
                        <span
                          className={`status-badge admin-approval-badge admin-approval-${myApp.adminApprovalStatus}`}
                          style={{ marginLeft: "8px" }}
                        >
                          Admin: {myApp.adminApprovalStatus}
                        </span>
                      )}
                    </div>
                    {myApp.coverNote && (
                      <div>
                        <strong>Your Cover Note:</strong>
                        <p>{myApp.coverNote}</p>
                      </div>
                    )}

                    {myApp.documents && myApp.documents.length > 0 && (
                      <div style={{ margin: "10px 0" }}>
                        <strong style={{ fontSize: "13px", display: "block", marginBottom: "6px" }}>Attached Documents:</strong>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {myApp.documents.map((d, idx) => (
                            <a
                              key={idx}
                              href={d.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-secondary"
                              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "12px" }}
                            >
                              📎 {d.name || "Document"}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => {
                          setSelectedProjectId(null);
                          navigate(`/dashboard/applications/${myApp.id}`);
                        }}
                        className="btn-primary"
                      >
                        View Application
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowWithdrawConfirmForId(myApp.id)}
                        className="btn-secondary"
                        style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                        disabled={withdrawingApp}
                      >
                        Withdraw Application
                      </button>
                    </div>

                    {showWithdrawConfirmForId === myApp.id && (
                      <div style={{ marginTop: "12px", padding: "12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px" }}>
                        <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#991b1b", fontWeight: "500" }}>
                          Are you sure you want to withdraw and delete this application? This action cannot be undone.
                        </p>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={() => handleWithdrawApplication(myApp.id)}
                            disabled={withdrawingApp}
                            style={{ padding: "6px 14px", fontSize: "12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
                          >
                            {withdrawingApp ? "Withdrawing..." : "Yes, Withdraw"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowWithdrawConfirmForId(null)}
                            disabled={withdrawingApp}
                            className="btn-secondary"
                            style={{ padding: "6px 14px", fontSize: "12px" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {hasUnreadMessage(myApp, role) && (
                      <span className="message-alert application-message-alert">
                        New message received
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {isProfessor && (() => {
              const apps = applicationsByProject[project.id] || [];
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <p className="project-details-host" style={{ margin: 0 }}>
                      Status: <span className={`status-badge status-${project.status}`}>{project.status}</span>
                    </p>
                    {project.publishingStatus && (
                      <p className="project-details-host" style={{ margin: 0 }}>
                        Publishing: <span className={`status-badge status-${project.publishingStatus}`}>{project.publishingStatus}</span>
                      </p>
                    )}
                  </div>
                  {renderProjectMeta(project)}

                  <div className="project-controls" style={{ marginTop: '24px', borderTop: '1px solid var(--app-border)', paddingTop: '16px', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setProjectForm({
                          title: project.title || "",
                          description: project.description || "",
                          stipendType: (project.stipendType === "Unpaid" || project.compensation === "Unpaid" || project.compensation === "Unpaid (Expenses Covered)") ? "Unpaid" : "Paid",
                          stipendMin: project.stipendMin !== undefined && project.stipendMin !== null ? project.stipendMin.toString() : "",
                          stipendMax: project.stipendMax !== undefined && project.stipendMax !== null ? project.stipendMax.toString() : "",
                          expenseSupport: project.expenseSupport || (project.stipendType === "Unpaid with expenses covered" || project.compensation === "Unpaid (Expenses Covered)" ? ["Travel expenses covered", "Accommodation provided"] : []),
                          expenseSupportOther: project.expenseSupportOther || "",
                          hasOtherExpense: !!project.expenseSupportOther,
                          location: project.location || "Onsite",
                          timeCommitment: project.timeCommitment || "Full-time",
                          timeline: project.timeline || "",
                          deadline: project.deadline || "",
                          departments: project.departments || [],
                          openToAll: project.openToAll !== undefined ? project.openToAll : true,
                          cpiRequirement: project.cpiRequirement !== undefined && project.cpiRequirement !== null ? project.cpiRequirement.toString() : "",
                          priorExperience: project.priorExperience || "",
                          openings: project.openings !== undefined ? project.openings.toString() : "1",
                          eligibleYears: project.eligibleYears || [],
                          requiredDocuments: project.requiredDocuments || [],
                          optionalTags: project.optionalTags || "",
                          status: project.status || "open",
                        });
                        setEditingProjectId(project.id);
                        setShowProjectForm(true);
                        setSelectedProjectId(null);
                      }}
                      className="btn-secondary"
                      style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px' }}
                    >
                      Edit Project
                    </button>
                    <button
                      onClick={() =>
                        handleUpdateProjectStatus(
                          project.id,
                          project.status === "open" ? "closed" : "open"
                        )
                      }
                      className={`btn-${project.status === "open" ? "danger" : "success"}`}
                      style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px' }}
                    >
                      {project.status === "open" ? "Close Project" : "Reopen Project"}
                    </button>
                    {project.deadline && (
                      <button
                        onClick={() => {
                          const newDeadline = prompt("Enter new application deadline (YYYY-MM-DD):");
                          if (newDeadline) {
                            updateDoc(doc(db, "projects", project.id), {
                              deadline: newDeadline,
                            });
                          }
                        }}
                        className="btn-secondary"
                        style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px' }}
                      >
                        Extend Application Deadline
                      </button>
                    )}
                  </div>

                  <div className="applications-summary" style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '600' }}>Applications ({apps.length})</h3>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--app-muted)' }}>
                        Review candidates, resumes, and send message alerts.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveApplicationsProjectId(project.id);
                      }}
                      className="btn-primary"
                      style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px' }}
                    >
                      View Applications
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

  const handleCloseProjectForm = () => {
    setShowProjectForm(false);
    setProjectForm(initialProjectForm);
    setFormError("");
    setEditingProjectId(null);
  };

  const renderCreateProjectModal = () => {
    if (!showProjectForm || role !== "professor") return null;

    return (
      <div className="details-overlay" onClick={(e) => { if (e.target.className === 'details-overlay') { handleCloseProjectForm(); } }}>
        <div className="details-modal" style={{ maxWidth: '600px' }}>
          <div className="details-modal-header">
            <h2 className="details-modal-title">{editingProjectId ? "Edit Project" : "Create New Project"}</h2>
            <button
              className="details-modal-close"
              onClick={handleCloseProjectForm}
            >
              &times;
            </button>
          </div>
          <div className="details-modal-content" style={{ padding: '20px' }}>
            <form onSubmit={handleCreateProject} className="project-form" style={{ background: 'none', border: 'none', padding: 0, margin: 0 }}>
              {formError && <div className="error-message">{formError}</div>}

              <label className="form-label">
                Project Title:
                <input
                  type="text"
                  placeholder="Project Title"
                  value={projectForm.title}
                  onChange={(e) =>
                    setProjectForm({ ...projectForm, title: e.target.value })
                  }
                  className="form-input"
                  required
                />
              </label>

              <label className="form-label">
                Description:
                <textarea
                  placeholder="Description"
                  value={projectForm.description}
                  onChange={(e) =>
                    setProjectForm({
                      ...projectForm,
                      description: e.target.value,
                    })
                  }
                  className="form-textarea"
                  required
                />
              </label>

              {/* Location Select */}
              <div style={{ margin: '14px 0 16px' }}>
                <label className="form-label">
                  Location *
                  <select
                    value={projectForm.location}
                    onChange={(e) =>
                      setProjectForm({ ...projectForm, location: e.target.value })
                    }
                    className="form-input"
                  >
                    <option value="Onsite">Onsite</option>
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </label>
              </div>

              {/* Compensation Radio Group */}
              <div style={{ margin: '14px 0 16px' }}>
                <label className="form-label" style={{ fontWeight: '700', fontSize: '13px', color: 'var(--app-ink, #0f172a)', marginBottom: '6px', display: 'block' }}>
                  Compensation *
                </label>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', margin: '6px 0 10px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600', color: 'var(--app-ink, #1e293b)' }}>
                    <input
                      type="radio"
                      name="stipendType"
                      value="Paid"
                      checked={projectForm.stipendType === "Paid"}
                      onChange={(e) =>
                        setProjectForm({
                          ...projectForm,
                          stipendType: e.target.value,
                        })
                      }
                      style={{ accentColor: '#0284c7', width: '16px', height: '16px' }}
                    />
                    Paid stipend
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600', color: 'var(--app-ink, #1e293b)' }}>
                    <input
                      type="radio"
                      name="stipendType"
                      value="Unpaid"
                      checked={projectForm.stipendType === "Unpaid"}
                      onChange={(e) =>
                        setProjectForm({
                          ...projectForm,
                          stipendType: e.target.value,
                          stipendMin: "",
                        })
                      }
                      style={{ accentColor: '#0284c7', width: '16px', height: '16px' }}
                    />
                    Unpaid
                  </label>
                </div>

                {projectForm.stipendType === "Paid" && (
                  <label className="form-label" style={{ marginTop: '8px' }}>
                    Monthly Stipend (INR/month) *
                    <input
                      type="number"
                      placeholder="e.g. 15000"
                      value={projectForm.stipendMin}
                      onChange={(e) =>
                        setProjectForm({
                          ...projectForm,
                          stipendMin: e.target.value,
                        })
                      }
                      className="form-input"
                      required
                    />
                  </label>
                )}
              </div>

              {/* Expense Support Checkbox Group (Shown when location is Onsite or Hybrid) */}
              {(projectForm.location === "Onsite" || projectForm.location === "Hybrid") && (
                <div style={{ marginBottom: '20px', padding: '14px 16px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '10px' }}>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '13px', color: 'var(--app-ink, #0f172a)', marginBottom: '8px', display: 'block' }}>
                    Expense Support
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '6px' }}>
                    {[
                      "Travel expenses covered",
                      "Accommodation provided",
                      "Meals provided",
                      "Local transport provided",
                    ].map((expense) => {
                      const isChecked = (projectForm.expenseSupport || []).includes(expense);
                      return (
                        <label key={expense} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--app-ink, #334155)' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const currentList = projectForm.expenseSupport || [];
                              const updatedList = e.target.checked
                                ? [...currentList, expense]
                                : currentList.filter((item) => item !== expense);
                              setProjectForm({
                                ...projectForm,
                                expenseSupport: updatedList,
                              });
                            }}
                            style={{ accentColor: '#0284c7', width: '15px', height: '15px' }}
                          />
                          {expense}
                        </label>
                      );
                    })}

                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--app-ink, #334155)' }}>
                      <input
                        type="checkbox"
                        checked={!!projectForm.hasOtherExpense}
                        onChange={(e) => {
                          setProjectForm({
                            ...projectForm,
                            hasOtherExpense: e.target.checked,
                            expenseSupportOther: e.target.checked ? projectForm.expenseSupportOther : "",
                          });
                        }}
                        style={{ accentColor: '#0284c7', width: '15px', height: '15px' }}
                      />
                      Other
                    </label>
                  </div>

                  {projectForm.hasOtherExpense && (
                    <div style={{ marginTop: '10px' }}>
                      <input
                        type="text"
                        placeholder="Specify other expense support (e.g. Visa fees, Health insurance)"
                        value={projectForm.expenseSupportOther || ""}
                        onChange={(e) =>
                          setProjectForm({
                            ...projectForm,
                            expenseSupportOther: e.target.value,
                          })
                        }
                        className="form-input"
                        style={{ fontSize: '13px' }}
                      />
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="form-label">
                  Time Commitment (e.g., 20 hrs/week):
                  <input
                    type="text"
                    placeholder="Time Commitment"
                    value={projectForm.timeCommitment}
                    onChange={(e) =>
                      setProjectForm({
                        ...projectForm,
                        timeCommitment: e.target.value,
                      })
                    }
                    className="form-input"
                  />
                </label>

                <label className="form-label">
                  Timeline (e.g., 3 months):
                  <input
                    type="text"
                    placeholder="Timeline"
                    value={projectForm.timeline}
                    onChange={(e) =>
                      setProjectForm({ ...projectForm, timeline: e.target.value })
                    }
                    className="form-input"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="form-label">
                  Application Deadline:
                  <input
                    type="date"
                    value={projectForm.deadline}
                    onChange={(e) =>
                      setProjectForm({
                        ...projectForm,
                        deadline: e.target.value,
                      })
                    }
                    className="form-input"
                  />
                </label>

                <label className="form-label">
                  Number of Openings:
                  <input
                    type="number"
                    placeholder="Number of Openings"
                    value={projectForm.openings}
                    onChange={(e) =>
                      setProjectForm({ ...projectForm, openings: e.target.value })
                    }
                    className="form-input"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="form-label">
                  CPI Requirement (out of 10):
                  <input
                    type="number"
                    placeholder="CPI Requirement"
                    step="0.01"
                    min="0"
                    max="10"
                    value={projectForm.cpiRequirement}
                    onChange={(e) =>
                      setProjectForm({
                        ...projectForm,
                        cpiRequirement: e.target.value,
                      })
                    }
                    className="form-input"
                  />
                </label>

                <label className="form-label">
                  Prior Experience Required:
                  <input
                    type="text"
                    placeholder="Prior Experience Required"
                    value={projectForm.priorExperience}
                    onChange={(e) =>
                      setProjectForm({
                        ...projectForm,
                        priorExperience: e.target.value,
                      })
                    }
                    className="form-input"
                  />
                </label>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <span className="form-label" style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Eligible Years:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  {["1st Year", "2nd Year", "3rd Year", "4th Year"].map((year) => {
                    const isChecked = (projectForm.eligibleYears || []).includes(year);
                    return (
                      <label key={year} className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'normal' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = projectForm.eligibleYears || [];
                            const next = e.target.checked
                              ? [...current, year]
                              : current.filter((y) => y !== year);
                            setProjectForm({ ...projectForm, eligibleYears: next });
                          }}
                        />
                        {year}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <span className="form-label" style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>Required Documents:</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                  {["Resume/CV", "Cover Letter", "Statement of Purpose (SOP)", "Academic Transcripts", "Recommendation Letter"].map((docName) => {
                    const isChecked = (projectForm.requiredDocuments || []).includes(docName);
                    return (
                      <label key={docName} className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'normal' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = projectForm.requiredDocuments || [];
                            const next = e.target.checked
                              ? [...current, docName]
                              : current.filter((d) => d !== docName);
                            setProjectForm({ ...projectForm, requiredDocuments: next });
                          }}
                        />
                        {docName}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ margin: '8px 0 16px 0' }}>
                <label className="checkbox-label" style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="checkbox"
                    checked={projectForm.openToAll}
                    onChange={(e) =>
                      setProjectForm({
                        ...projectForm,
                        openToAll: e.target.checked,
                        departments: e.target.checked ? [] : projectForm.departments,
                      })
                    }
                  />
                  Open to all departments
                </label>
              </div>

              {!projectForm.openToAll && (
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                    Eligible Departments:
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && !(projectForm.departments || []).includes(val)) {
                          const next = [...(projectForm.departments || []), val];
                          setProjectForm({ ...projectForm, departments: next });
                        }
                        e.target.value = "";
                      }}
                      className="form-input"
                      style={{ marginTop: '4px' }}
                    >
                      <option value="">-- Select Department --</option>
                      {DEPARTMENTS.map((dept) => (
                        <option key={dept.code} value={dept.code} disabled={(projectForm.departments || []).includes(dept.code)}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* Selected Departments Chips */}
                  {(projectForm.departments || []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                      {projectForm.departments.map((code) => {
                        const name = DEPARTMENT_MAP[code] || code;
                        return (
                          <span
                            key={code}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              background: 'var(--app-surface-hover, #edf2f7)',
                              color: 'var(--app-ink, #2d3748)',
                              borderRadius: '16px',
                              fontSize: '12.5px',
                              fontWeight: '500',
                              border: '1px solid var(--app-border, #cbd5e1)'
                            }}
                          >
                            {name}
                            <button
                              type="button"
                              onClick={() => {
                                const next = projectForm.departments.filter((d) => d !== code);
                                setProjectForm({ ...projectForm, departments: next });
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#ef4444',
                                fontWeight: 'bold',
                                fontSize: '13px',
                                cursor: 'pointer',
                                padding: '0 2px',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <label className="form-label" style={{ marginTop: '12px' }}>
                Optional Tags (comma-separated):
                <input
                  type="text"
                  placeholder="e.g. Machine Learning, NLP, Python"
                  value={projectForm.optionalTags}
                  onChange={(e) =>
                    setProjectForm({
                      ...projectForm,
                      optionalTags: e.target.value,
                    })
                  }
                  className="form-input"
                />
              </label>

              <div className="form-buttons" style={{ marginTop: '20px' }}>
                <button type="submit" className="btn-primary" disabled={savingProject}>
                  {savingProject ? "Saving..." : (editingProjectId ? "Save Changes" : "Create Project")}
                </button>
                <button
                  type="button"
                  onClick={handleCloseProjectForm}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

  if (isProfessor) {
    return (
      <AppShell
        searchValue={professorSearch}
        onSearchChange={setProfessorSearch}
        searchPlaceholder="Search your projects..."
      >
        <div className="shell-page projects-page">
          <div className="projects-header">
            <div>
              <h1>Project Management</h1>
              <p className="projects-subtitle">
                Create, manage, and review student applications
              </p>
            </div>
            <div className="projects-header-actions">
              {["all", "open", "closed"].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`btn-header-action ${professorStatusFilter === status ? "active" : ""}`}
                  onClick={() => setProfessorStatusFilter(status)}
                >
                  {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
              <button
                onClick={handleRefresh}
                className="btn-header-action"
                disabled={refreshing}
              >
                <span className={refreshing ? "spinner-icon" : ""}>↻</span> {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button
                onClick={() => setShowProjectForm(true)}
                className="btn-primary"
                style={{
                  height: "40px",
                  padding: "0 16px",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create Project
              </button>
            </div>
          </div>

          <div className="projects-layout-single">
            <div className="projects-list">
              {projectsLoading ? (
                [1, 2, 3].map((n) => <ProjectCardSkeleton key={n} />)
              ) : filteredProjects.length === 0 ? (
                <ProjectEmptyState
                  isSearchActive={Boolean(professorSearch || professorStatusFilter !== "all")}
                  onClearFilters={() => {
                    setProfessorSearch("");
                    setProfessorStatusFilter("all");
                  }}
                  isProfessor={true}
                  onCreateProject={() => setShowProjectForm(true)}
                />
              ) : (
                filteredProjects.map((project) => {
                  const initial = (project.createdByName || project.title || "U").charAt(0).toUpperCase();
                  const subtitle = [(project.departments || []).join(", "), project.location].filter(Boolean).join(" • ");
                  const unreadCount = getProjectUnreadCount(project.id);
                  const appsCount = (applicationsByProject[project.id] || []).length;

                  return (
                    <div
                      key={project.id}
                      className="project-card-new"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setSelectedApplicationId(null);
                        setActiveApplicationsProjectId(null);
                      }}
                    >
                      <div className="project-card-left">
                        <div className="project-icon">{initial}</div>
                      </div>
                      <div className="project-card-middle">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', gap: '8px' }}>
                          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            {project.title}
                            {unreadCount > 0 && (
                              <span className="message-unread-indicator-badge">
                                ✉ {unreadCount} New Message{unreadCount > 1 ? 's' : ''}
                              </span>
                            )}
                          </h3>
                          <div className="project-card-badges" style={{ flexShrink: 0 }}>
                            <span className={`status-badge status-${project.status}`}>
                              {project.status}
                            </span>
                          </div>
                        </div>
                        <p className="project-card-subtitle">{subtitle}</p>
                        <p className="project-card-desc">{project.description}</p>
                        <div className="project-tags">
                          <span className="tag-pill highlight">Applications: {appsCount}</span>
                          <span className="tag-pill">Openings: {project.openings}</span>
                          {(project.departments || []).map((dept) => (
                            <span key={dept} className="tag-pill">{dept}</span>
                          ))}
                          {project.optionalTags && project.optionalTags.split(',').map(tag => tag.trim()).filter(Boolean).map((tag, idx) => (
                            <span key={idx} className="tag-pill" style={{ background: '#f1f5f9', color: '#475569' }}>{tag}</span>
                          ))}
                        </div>
                      </div>
                      <div className="project-card-right">
                        {project.deadline && (
                          <>
                            <span className="deadline-label">Application Deadline</span>
                            <span className="deadline-date">{new Date(project.deadline).toISOString().split('T')[0]}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {renderMessagingOverlay()}
          {renderApplicationsOverlay()}
          {renderDetailsModal()}
          {renderCreateProjectModal()}
        </div>
      </AppShell>
    );
  }

  if (isStudent) {
    return (
      <AppShell
        searchValue={studentSearch}
        onSearchChange={setStudentSearch}
        searchPlaceholder="Search projects, universities, or students..."
      >
        <div className="shell-page projects-page">
          <div className="projects-header">
            <div>
              <h1>Projects</h1>
              <p className="projects-subtitle">
                Explore and filter international research internships.
              </p>
            </div>
            <div className="projects-header-actions">
              <button
                onClick={() => { }}
                className="btn-header-action"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" /></svg> Sort
              </button>
              <button
                onClick={() => { }}
                className="btn-header-action"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg> Filter
              </button>
            </div>
          </div>

          <div className="projects-layout-single">
            <div className="projects-list">
              {projectsLoading ? (
                [1, 2, 3, 4].map((n) => <ProjectCardSkeleton key={n} />)
              ) : filteredStudentProjects.length === 0 ? (
                <ProjectEmptyState
                  isSearchActive={Boolean(studentSearch || studentStatusFilter !== "all")}
                  onClearFilters={() => {
                    setStudentSearch("");
                    setStudentStatusFilter("all");
                  }}
                  isProfessor={false}
                />
              ) : (
                filteredStudentProjects.map((project) => {
                  const initial = (project.createdByName || project.title || "U").charAt(0).toUpperCase();
                  const subtitle = [project.createdByName, project.createdByInstitute, (project.departments || []).join(", "), project.location].filter(Boolean).join(" • ");

                  return (
                    <div
                      key={project.id}
                      className="project-card-new"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setActiveApplyProjectId(null);
                        setSelectedApplicationId(null);
                      }}
                    >
                      <div className="project-card-left">
                        <div className="project-icon">{initial}</div>
                      </div>
                      <div className="project-card-middle">
                        <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', margin: '0 0 4px 0' }}>
                          {project.title}
                          {(() => {
                            const myApp = studentApplications.find((a) => a.projectId === project.id);
                            return myApp && hasUnreadMessage(myApp, role) ? (
                              <span className="message-unread-indicator-badge">
                                ✉ New Message
                              </span>
                            ) : null;
                          })()}
                        </h3>
                        <p className="project-card-subtitle">{subtitle}</p>
                        <p className="project-card-desc">{project.description}</p>
                        <div className="project-tags">
                          {(project.departments || []).map((dept) => (
                            <span key={dept} className="tag-pill">{dept}</span>
                          ))}
                          {project.timeCommitment && (
                            <span className="tag-pill highlight">{project.timeCommitment}</span>
                          )}
                          {project.optionalTags && project.optionalTags.split(',').map(tag => tag.trim()).filter(Boolean).map((tag, idx) => (
                            <span key={idx} className="tag-pill" style={{ background: '#f1f5f9', color: '#475569' }}>{tag}</span>
                          ))}
                        </div>
                      </div>
                      <div className="project-card-right">
                        {project.deadline && (
                          <>
                            <span className="deadline-label">Application Deadline</span>
                            <span className="deadline-date">{new Date(project.deadline).toISOString().split('T')[0]}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {renderMessagingOverlay()}
          {renderDetailsModal()}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell searchPlaceholder="Search projects...">
      <div className="shell-page projects-page">
        <div className="projects-layout-single">
          <div className="projects-list">
            {[1, 2, 3].map((n) => (
              <ProjectCardSkeleton key={n} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export default Projects;
