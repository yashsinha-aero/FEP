import { useCallback, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
} from "../firebase";
import AppShell from "../components/AppShell";
import {
  broadcastAnnouncement,
  adminCreateProfessor,
} from "../services/api";
import "../styles/admin.css";

const generateClientTempPassword = () => {
  const charsUpper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const charsLower = "abcdefghjkmnpqrstuvwxyz";
  const charsDigits = "23456789";
  const charsSpecial = "@#$&*!";

  let password = "";
  password += charsUpper[Math.floor(Math.random() * charsUpper.length)];
  password += charsLower[Math.floor(Math.random() * charsLower.length)];
  password += charsDigits[Math.floor(Math.random() * charsDigits.length)];
  password += charsSpecial[Math.floor(Math.random() * charsSpecial.length)];

  const allChars = charsUpper + charsLower + charsDigits + charsSpecial;
  for (let i = 0; i < 8; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
};

const BROADCAST_TEMPLATES = {
  general_portal: {
    id: "general_portal",
    name: "General Portal Announcement",
    subject: (title) => "Important Update from Foreign Exposure Programme (FEP) IIT Kanpur",
    message: () =>
      `Dear Students / Faculty Members,\n\nPlease note this official announcement from the Foreign Exposure Programme (FEP) administration.\n\nWe encourage all students and faculty supervisors to log into the FEP Portal to check the latest project updates, announcements, and opportunities.\n\nBest regards,\nForeign Exposure Programme Team\nInternational Relations Wing, IIT Kanpur`,
  },
  concluded: {
    id: "concluded",
    name: "Selection Process Concluded",
    subject: (title) => `Update on Applications: Selection Process Concluded — ${title || "Research Project"}`,
    message: (title, profName) =>
      `Dear Applicant,\n\nThank you for your interest in the research project "${title || "your applied project"}"${profName && profName !== "N/A" ? ` under Professor ${profName}` : ""}.\n\nThe review and selection process for this project has now formally concluded. We sincerely appreciate the time and dedication you put into your application.\n\nWhile this position has been finalized, we strongly encourage you to explore other active opportunities on the FEP Portal for which you are eligible.\n\nBest regards,\nForeign Exposure Programme Team\nInternational Relations Wing, IIT Kanpur`,
  },
  shortlist: {
    id: "shortlist",
    name: "Shortlist & Next Steps Released",
    subject: (title) => `Application Update: Shortlisted Candidates & Next Steps — ${title || "Research Project"}`,
    message: (title, profName) =>
      `Dear Applicant,\n\nWe have completed the initial screening of applications for the research project "${title || "your applied project"}"${profName && profName !== "N/A" ? ` under Professor ${profName}` : ""}.\n\nShortlisted candidates have been updated on the portal and will be contacted shortly with details regarding interview schedules, assessment tasks, or subsequent evaluation rounds.\n\nPlease monitor your portal dashboard and registered IITK email for further instructions.\n\nBest regards,\nForeign Exposure Programme Team\nInternational Relations Wing, IIT Kanpur`,
  },
  action_required: {
    id: "action_required",
    name: "Action Required: Information / Resubmission",
    subject: (title) => `Action Required: Additional Information Needed for "${title || "Research Project"}"`,
    message: (title, profName) =>
      `Dear Applicant,\n\nDuring the evaluation of applications for the research project "${title || "your applied project"}"${profName && profName !== "N/A" ? ` under Professor ${profName}` : ""}, additional information or documentation is required to proceed with the evaluation.\n\nPlease log into the FEP Portal at your earliest convenience to review the updates on your application and respond with the requested details.\n\nPrompt action will ensure your application is fully considered.\n\nBest regards,\nForeign Exposure Programme Team\nInternational Relations Wing, IIT Kanpur`,
  },
  custom: {
    id: "custom",
    name: "Custom Announcement (Blank)",
    subject: (title) => title ? `Administrative Notice: ${title}` : "Official Notice | FEP IITK",
    message: () => ``,
  },
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

const Admin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialTab = searchParams.get("tab") || "projects";
  const initialFilter = searchParams.get("filter") || "pending";

  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Edit project
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // Lists
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [applications, setApplications] = useState([]);

  // Filters
  const [projectFilter, setProjectFilter] = useState(initialFilter);
  const [applicationFilter, setApplicationFilter] = useState(initialFilter);
  const [projectSearch, setProjectSearch] = useState("");
  const [applicationSearch, setApplicationSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get("tab");
    const filterParam = params.get("filter");
    if (tabParam && ["projects", "applications", "broadcast"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    if (filterParam) {
      setProjectFilter(filterParam);
      setApplicationFilter(filterParam);
    }
  }, [location.search]);

  // Status & Error
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Broadcast Section State
  const [broadcastTargetMode, setBroadcastTargetMode] = useState("portal_wide"); // "portal_wide" | "project" | "custom_users"
  const [broadcastPortalAudience, setBroadcastPortalAudience] = useState("all_students"); // "all_students" | "all_professors" | "all_users"
  const [selectedBroadcastProjectId, setSelectedBroadcastProjectId] = useState("");
  const [broadcastProjectAudience, setBroadcastProjectAudience] = useState("all");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("student");
  const [broadcastTemplate, setBroadcastTemplate] = useState("general_portal");
  const [broadcastSubject, setBroadcastSubject] = useState(BROADCAST_TEMPLATES.general_portal.subject());
  const [broadcastMessage, setBroadcastMessage] = useState(BROADCAST_TEMPLATES.general_portal.message());
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastSuccess, setBroadcastSuccess] = useState("");
  const [broadcastError, setBroadcastError] = useState("");
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showBroadcastConfirmModal, setShowBroadcastConfirmModal] = useState(false);

  // ── Professor Management State ──────────────────────────────────────────────
  const [professorSearch, setProfessorSearch] = useState("");
  const [showCreateProfModal, setShowCreateProfModal] = useState(false);
  const [createProfForm, setCreateProfForm] = useState({
    fullName: "",
    email: "",
    institute: "",
    department: "",
    interests: "",
    password: "",
    sendWelcomeEmail: true,
  });
  const [createProfLoading, setCreateProfLoading] = useState(false);
  const [createProfError, setCreateProfError] = useState("");
  const [createdProfSuccessData, setCreatedProfSuccessData] = useState(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // ── Professor Handlers ──────────────────────────────────────────────────────
  const handleOpenCreateProfModal = () => {
    setCreateProfError("");
    setCreateProfForm({
      fullName: "",
      email: "",
      institute: "",
      department: "",
      interests: "",
      password: generateClientTempPassword(),
      sendWelcomeEmail: true,
    });
    setShowCreateProfModal(true);
  };

  const handleCreateProfSubmit = async (e) => {
    e.preventDefault();
    setCreateProfError("");

    const { fullName, email, institute, department, interests, password, sendWelcomeEmail } = createProfForm;

    if (!fullName.trim()) {
      setCreateProfError("Please enter the professor's name.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setCreateProfError("Please enter a valid institutional email address.");
      return;
    }
    if (!institute.trim()) {
      setCreateProfError("Please enter the university or institution.");
      return;
    }
    if (!department.trim()) {
      setCreateProfError("Please enter the department.");
      return;
    }
    if (!password || password.length < 8) {
      setCreateProfError("Password must be at least 8 characters.");
      return;
    }

    try {
      setCreateProfLoading(true);
      const token = await auth.currentUser.getIdToken(true);

      const payload = {
        fullName: fullName.trim(),
        email: normalizedEmail,
        password: password.trim(),
        institute: institute.trim(),
        department1: department.trim(),
        interest: interests.trim() || null,
        sendWelcomeEmail,
      };

      const response = await adminCreateProfessor(token, payload);

      if (response.data?.success) {
        setShowCreateProfModal(false);
        setCreatedProfSuccessData({
          fullName: fullName.trim(),
          email: normalizedEmail,
          temporaryPassword: response.data.temporaryPassword || password.trim(),
          institute: institute.trim(),
          department: department.trim(),
          emailSent: response.data.emailSent,
        });

        if (response.data.professor) {
          setUsers((prev) => [
            response.data.professor,
            ...prev.filter((u) => u.id !== response.data.professor.id),
          ]);
        }
        loadUsers();
      } else {
        setCreateProfError(response.data?.error || "Failed to create account.");
      }
    } catch (err) {
      console.error("Create professor error:", err);
      setCreateProfError(
        err.response?.data?.error || err.message || "Failed to create account."
      );
    } finally {
      setCreateProfLoading(false);
    }
  };

  const handleCopyCredentials = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2500);
  };

  const handleViewProfessorProjects = (prof) => {
    setActiveTab("projects");
    setProjectFilter("all");
    setProjectSearch(prof.fullName || prof.email || "");
  };

  const loadProjects = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "projects"));
      const projectsList = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setProjects(projectsList);
    } catch (err) {
      console.error("Error loading projects: ", err);
      setError("Failed to load projects: " + err.message);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const usersList = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setUsers(usersList);
    } catch (err) {
      console.error("Error loading users: ", err);
      setError("Failed to load user profiles: " + err.message);
    }
  }, []);

  const loadApplications = useCallback(async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "applications"));
      const appList = querySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setApplications(appList);
    } catch (err) {
      console.error("Error loading applications: ", err);
      setError("Failed to load applications: " + err.message);
    }
  }, []);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");
    setSuccess("");
    try {
      await Promise.all([loadProjects(), loadUsers(), loadApplications()]);
      setSuccess("Dashboard data refreshed successfully.");
    } catch (err) {
      console.error("Refresh error: ", err);
      setError("Failed to refresh dashboard: " + err.message);
    } finally {
      setRefreshing(false);
    }
  };

  const verifyRole = useCallback(async (currentUser) => {
    try {
      setCheckingRole(true);
      const tokenResult = await currentUser.getIdTokenResult();
      const isAdmin = tokenResult.claims.isAdmin === true;

      if (!isAdmin) {
        await signOut(auth);
        navigate("/admin/login");
        return;
      }

      await Promise.all([loadProjects(), loadUsers(), loadApplications()]);
    } catch (err) {
      console.error("Error verifying admin role:", err);
      setError("Authorization verification error: " + err.message);
    } finally {
      setCheckingRole(false);
      setLoading(false);
    }
  }, [loadProjects, loadUsers, loadApplications, navigate]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate("/admin/login");
        return;
      }
      await verifyRole(currentUser);
    });

    return () => unsubscribe();
  }, [verifyRole, navigate]);

  const handleUpdateProjectStatus = async (projectId, newStatus) => {
    setError("");
    setSuccess("");
    try {
      const projectRef = doc(db, "projects", projectId);
      await updateDoc(projectRef, {
        publishingStatus: newStatus,
      });
      setSuccess(
        newStatus === "pending"
          ? "Project status changed to pending."
          : `Project ${newStatus} successfully.`
      );
      await loadProjects();
    } catch (err) {
      console.error("Failed to update project status:", err);
      setError("Failed to update project status: " + err.message);
    }
  };

  const handleEditProject = (proj) => {
    setEditingProjectId(proj.id);
    setEditForm({
      title: proj.title || "",
      description: proj.description || "",
      stipendType: (proj.stipendType === "Unpaid" || proj.compensation === "Unpaid" || proj.compensation === "Unpaid (Expenses Covered)") ? "Unpaid" : "Paid",
      stipendMin: proj.stipendMin !== undefined && proj.stipendMin !== null ? proj.stipendMin.toString() : "",
      stipendMax: proj.stipendMax !== undefined && proj.stipendMax !== null ? proj.stipendMax.toString() : "",
      expenseSupport: proj.expenseSupport || (proj.stipendType === "Unpaid with expenses covered" || proj.compensation === "Unpaid (Expenses Covered)" ? ["Travel expenses covered", "Accommodation provided"] : []),
      expenseSupportOther: proj.expenseSupportOther || "",
      hasOtherExpense: !!proj.expenseSupportOther,
      location: proj.location || "Onsite",
      timeCommitment: proj.timeCommitment || "",
      timeline: proj.timeline || "",
      deadline: proj.deadline || "",
      openings: proj.openings ?? 1,
      cpiRequirement: proj.cpiRequirement !== undefined && proj.cpiRequirement !== null ? proj.cpiRequirement.toString() : "",
      priorExperience: proj.priorExperience || "",
      status: proj.status || "open",
      eligibleYears: proj.eligibleYears || [],
      requiredDocuments: proj.requiredDocuments || [],
      departments: proj.departments || [],
      openToAll: proj.openToAll !== undefined ? proj.openToAll : (proj.departments && proj.departments.length > 0 ? false : true),
      optionalTags: proj.optionalTags || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingProjectId(null);
    setEditForm({});
  };

  const handleSaveProjectEdit = async (projectId) => {
    setEditSaving(true);
    setError("");
    setSuccess("");
    try {
      const depts = editForm.openToAll ? [] : editForm.departments;

      const hasPhysicalLocation = editForm.location === "Onsite" || editForm.location === "Hybrid";
      const expSupport = hasPhysicalLocation ? (editForm.expenseSupport || []) : [];
      const expOther = hasPhysicalLocation ? (editForm.expenseSupportOther || "") : "";

      let compText = "Unpaid";
      if (editForm.stipendType === "Paid" || editForm.stipendType === "Scholarship") {
        compText = editForm.stipendMin
          ? `${editForm.stipendMin} / mo`
          : "Paid";
      } else {
        compText = (expSupport.length > 0 || expOther)
          ? "Unpaid (Expenses Covered)"
          : "Unpaid";
      }

      const projectRef = doc(db, "projects", projectId);
      await updateDoc(projectRef, {
        title: editForm.title.trim(),
        description: editForm.description.trim(),
        stipendType: editForm.stipendType,
        stipendMin: (editForm.stipendType === "Paid" || editForm.stipendType === "Scholarship") && editForm.stipendMin ? parseFloat(editForm.stipendMin) : null,
        stipendMax: null,
        compensation: compText,
        expenseSupport: expSupport,
        expenseSupportOther: expOther,
        location: editForm.location,
        timeCommitment: editForm.timeCommitment.trim(),
        timeline: editForm.timeline.trim(),
        deadline: editForm.deadline || null,
        openings: parseInt(editForm.openings) || 1,
        cpiRequirement: editForm.cpiRequirement !== "" && editForm.cpiRequirement !== undefined && editForm.cpiRequirement !== null ? parseFloat(editForm.cpiRequirement) : null,
        priorExperience: editForm.priorExperience.trim(),
        status: editForm.status,
        eligibleYears: editForm.eligibleYears || [],
        requiredDocuments: editForm.requiredDocuments || [],
        departments: depts,
        openToAll: editForm.openToAll,
        optionalTags: editForm.optionalTags || "",
      });
      setSuccess("Project updated successfully.");
      setEditingProjectId(null);
      setEditForm({});
      await loadProjects();
    } catch (err) {
      console.error("Failed to save project edits:", err);
      setError("Failed to save project: " + err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleUpdateApplicationApproval = async (applicationId, newStatus) => {
    setError("");
    setSuccess("");
    try {
      const appRef = doc(db, "applications", applicationId);
      await updateDoc(appRef, {
        adminApprovalStatus: newStatus,
      });
      setSuccess(
        newStatus === "pending"
          ? "Application status moved to pending."
          : `Application ${newStatus} successfully.`
      );
      await loadApplications();
    } catch (err) {
      console.error("Failed to update application approval:", err);
      setError("Failed to update application: " + err.message);
    }
  };

  const handleUpdateApplicationProfessorStatus = async (applicationId, newStatus) => {
    setError("");
    setSuccess("");
    try {
      const appRef = doc(db, "applications", applicationId);
      await updateDoc(appRef, {
        status: newStatus,
      });
      setSuccess(`Professor Decision status updated to ${newStatus}.`);
      await loadApplications();

      // Notify student via email (non-blocking — email failure does not affect status update)
      try {
        const token = await auth.currentUser.getIdToken();
        await fetch("https://us-central1-fep-iitk.cloudfunctions.net/api/notify-status-change", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ applicationId, newStatus }),
        });
      } catch (emailErr) {
        console.warn("Could not send notification email:", emailErr);
      }
    } catch (err) {
      console.error("Failed to update application status:", err);
      setError("Failed to update application status: " + err.message);
    }
  };

  // ─── Helper lookups ───────────────────────────────────────────────────────
  const getProjectTitle = (projectId) => {
    const proj = projects.find((p) => p.id === projectId);
    return proj?.title || projectId;
  };

  const getProfessorInstitute = (proj) => {
    if (proj?.createdByInstitute) return proj.createdByInstitute;
    const prof = users.find((u) => u.id === proj?.createdBy);
    return prof?.institute || prof?.university || "N/A";
  };

  const getProfessorName = (proj) => {
    if (proj?.createdByName) return proj.createdByName;
    const prof = users.find((u) => u.id === proj?.createdBy);
    if (!prof) return "N/A";
    return prof.name || `${prof.firstName || ""} ${prof.lastName || ""}`.trim() || prof.email || "N/A";
  };

  const getProfessorDept = (professorId) => {
    const prof = users.find((u) => u.id === professorId);
    if (!prof) return "N/A";
    const dept1 = prof.department1;
    const dept2 = prof.department2;
    if (dept1 && dept2) return `${dept1}, ${dept2}`;
    return dept1 || dept2 || "N/A";
  };

  // ─── Broadcast Section Helpers ──────────────────────────────────────────────
  const loadBroadcastHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(25));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setBroadcastHistory(list);
    } catch (err) {
      console.warn("Error loading broadcast history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "broadcast") {
      loadBroadcastHistory();
    }
  }, [activeTab, loadBroadcastHistory]);

  const calculateTotalRecipients = () => {
    if (broadcastTargetMode === "portal_wide") {
      if (broadcastPortalAudience === "all_students") {
        return users.filter((u) => u.role === "student").length;
      }
      if (broadcastPortalAudience === "all_professors") {
        return users.filter((u) => u.role === "professor").length;
      }
      return users.filter((u) => u.email).length;
    }

    if (broadcastTargetMode === "project") {
      if (!selectedBroadcastProjectId) return 0;
      const projApps = applications.filter((a) => a.projectId === selectedBroadcastProjectId);
      if (broadcastProjectAudience === "professor") return 1;
      if (broadcastProjectAudience === "all") return projApps.length;
      if (broadcastProjectAudience === "both") return projApps.length + 1;
      if (broadcastProjectAudience === "applied" || broadcastProjectAudience === "pending") {
        return projApps.filter((a) => !a.status || a.status === "applied" || a.status === "pending").length;
      }
      if (broadcastProjectAudience === "shortlisted") {
        return projApps.filter((a) => a.status === "shortlisted").length;
      }
      if (broadcastProjectAudience === "selected") {
        return projApps.filter((a) => a.status === "selected").length;
      }
      if (broadcastProjectAudience === "rejected") {
        return projApps.filter((a) => a.status === "rejected").length;
      }
      return projApps.length;
    }

    if (broadcastTargetMode === "custom_users") {
      return selectedUserIds.length;
    }

    return 0;
  };

  const handleApplyTemplate = (templateKey) => {
    setBroadcastTemplate(templateKey);
    const tmpl = BROADCAST_TEMPLATES[templateKey];
    if (!tmpl) return;

    let projTitle = "";
    let profName = "";
    if (selectedBroadcastProjectId) {
      const proj = projects.find((p) => p.id === selectedBroadcastProjectId);
      if (proj) {
        projTitle = proj.title;
        profName = getProfessorName(proj);
      }
    }

    setBroadcastSubject(tmpl.subject(projTitle));
    setBroadcastMessage(tmpl.message(projTitle, profName));
  };

  const handleToggleSelectUser = (uid) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSelectAllFilteredUsers = (filteredList) => {
    const idsToAdd = filteredList.map((u) => u.id);
    setSelectedUserIds((prev) => Array.from(new Set([...prev, ...idsToAdd])));
  };

  const handleClearSelectedUsers = () => {
    setSelectedUserIds([]);
  };

  const handleInitiateBroadcast = () => {
    if (!broadcastSubject.trim() || !broadcastMessage.trim()) {
      setBroadcastError("Please provide both a subject and message body.");
      return;
    }

    const totalRecipients = calculateTotalRecipients();
    if (totalRecipients === 0) {
      setBroadcastError("Selected audience has 0 recipients. Please select at least one recipient.");
      return;
    }

    setBroadcastError("");
    setShowBroadcastConfirmModal(true);
  };

  const handleExecuteSendBroadcast = async () => {
    setShowBroadcastConfirmModal(false);
    setBroadcasting(true);
    setBroadcastError("");
    setBroadcastSuccess("");

    try {
      if (!auth.currentUser) {
        setBroadcastError("You are not currently authenticated. Please log in as an administrator.");
        setBroadcasting(false);
        return;
      }
      const token = await auth.currentUser.getIdToken(true);
      const payload = {
        targetMode: broadcastTargetMode,
        portalAudience: broadcastPortalAudience,
        projectId: broadcastTargetMode === "project" ? selectedBroadcastProjectId : null,
        targetAudience: broadcastProjectAudience,
        recipientUids: broadcastTargetMode === "custom_users" ? selectedUserIds : [],
        subject: broadcastSubject.trim(),
        message: broadcastMessage.trim(),
      };

      const response = await broadcastAnnouncement(token, payload);

      if (response.data?.success) {
        setBroadcastSuccess(`Announcement broadcasted successfully to ${response.data.recipientCount} recipient(s).`);
        loadBroadcastHistory();
        if (broadcastTargetMode === "custom_users") {
          setSelectedUserIds([]);
        }
      } else {
        setBroadcastError(response.data?.error || "Failed to broadcast announcement.");
      }
    } catch (err) {
      console.error("Broadcast error:", err);
      setBroadcastError(err.response?.data?.error || err.message || "Error sending broadcast announcement.");
    } finally {
      setBroadcasting(false);
    }
  };

  // ─── Filter Logic ─────────────────────────────────────────────────────────
  const filteredProjects = projects.filter((proj) => {
    const status = proj.publishingStatus || "approved";
    const matchesStatus = projectFilter === "all" || status === projectFilter;
    const searchLower = projectSearch.toLowerCase();
    const profName = (getProfessorName(proj) || "").toLowerCase();
    const profInstitute = (getProfessorInstitute(proj) || "").toLowerCase();
    const matchesSearch =
      proj.title.toLowerCase().includes(searchLower) ||
      profName.includes(searchLower) ||
      profInstitute.includes(searchLower);
    return matchesStatus && matchesSearch;
  });

  const filteredApplications = applications.filter((app) => {
    const status = app.adminApprovalStatus || "pending";
    const matchesStatus =
      applicationFilter === "all" || status === applicationFilter;
    const searchLower = applicationSearch.toLowerCase();
    const projectTitle = getProjectTitle(app.projectId).toLowerCase();
    const studentName = (app.studentName || "").toLowerCase();
    const matchesSearch =
      studentName.includes(searchLower) || projectTitle.includes(searchLower);
    return matchesStatus && matchesSearch;
  });

  // ── Professors List & Filtering ──────────────────────────────────────────
  const professorsList = users.filter((u) => u.role === "professor");

  const getProfessorProjects = (profId, profEmail) => {
    return projects.filter(
      (p) => p.createdBy === profId || (profEmail && p.creatorEmail === profEmail)
    );
  };

  const filteredProfessors = professorsList.filter((prof) => {
    if (professorSearch.trim()) {
      const q = professorSearch.toLowerCase().trim();
      const nameMatch = (prof.fullName || "").toLowerCase().includes(q);
      const emailMatch = (prof.email || "").toLowerCase().includes(q);
      const instMatch = (prof.institute || "").toLowerCase().includes(q);
      const deptMatch =
        (prof.department1 || "").toLowerCase().includes(q) ||
        (prof.department2 || "").toLowerCase().includes(q) ||
        (prof.department || "").toLowerCase().includes(q);
      const desigMatch = (prof.designation || "").toLowerCase().includes(q);
      const interestMatch = (prof.interest || "").toLowerCase().includes(q);
      return nameMatch || emailMatch || instMatch || deptMatch || desigMatch || interestMatch;
    }
    return true;
  });

  // Counts for tab labels
  const pendingProjectsCount = projects.filter(
    (p) => !p.publishingStatus || p.publishingStatus === "pending"
  ).length;

  const pendingApplicationsCount = applications.filter(
    (a) => !a.adminApprovalStatus || a.adminApprovalStatus === "pending"
  ).length;

  if (loading || checkingRole) {
    return (
      <AppShell showSearch={false}>
        <div className="admin-loading-container">Verifying credentials…</div>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell showSearch={false}>
      <div className="admin-page shell-page">

        {/* ── Page Header ── */}
        <div className="admin-page-header">
          <div className="admin-page-header-text">
            <p className="admin-kicker">CONTROL PANEL</p>
            <h1>System Administrator</h1>
            <p>Approve projects, manage student applications, and onboard faculty members.</p>
          </div>
          <div className="admin-header-button-group">
            <button
              type="button"
              onClick={handleOpenCreateProfModal}
              className="admin-btn-primary"
              id="admin-onboard-prof-btn"
            >
              + Onboard Professor
            </button>
            <button
              onClick={handleRefresh}
              className="btn-refresh-dashboard"
              disabled={refreshing}
            >
              <span className={refreshing ? "spinner-icon" : ""}>↻</span>{" "}
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && <div className="admin-message-alert admin-error">{error}</div>}
        {success && <div className="admin-message-alert admin-success">{success}</div>}

        {/* ── Tabs ── */}
        <div className="admin-tabs">
          <button
            className={`admin-tab-btn ${activeTab === "projects" ? "active" : ""}`}
            onClick={() => setActiveTab("projects")}
          >
            Manage Projects
            {pendingProjectsCount > 0 && (
              <span className="admin-tab-badge">{pendingProjectsCount}</span>
            )}
          </button>
          <button
            className={`admin-tab-btn ${activeTab === "applications" ? "active" : ""}`}
            onClick={() => setActiveTab("applications")}
          >
            Applications
            {pendingApplicationsCount > 0 && (
              <span className="admin-tab-badge">{pendingApplicationsCount}</span>
            )}
          </button>
          <button
            className={`admin-tab-btn ${activeTab === "professors" ? "active" : ""}`}
            onClick={() => setActiveTab("professors")}
          >
            Manage Professors
            <span className="admin-tab-badge" style={{ backgroundColor: "#0284c7" }}>
              {professorsList.length}
            </span>
          </button>
          <button
            className={`admin-tab-btn ${activeTab === "broadcast" ? "active" : ""}`}
            onClick={() => setActiveTab("broadcast")}
          >
            Broadcast Notices
          </button>
        </div>

        {/* ── Tab 1: PROJECTS ── */}
        {activeTab === "projects" && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Professor Projects</h2>
              <div className="admin-header-actions">
                <input
                  type="text"
                  placeholder="Search by project or professor…"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  className="admin-search-input"
                />
                <div className="admin-filters">
                  <button
                    className={projectFilter === "pending" ? "active" : ""}
                    onClick={() => setProjectFilter("pending")}
                  >
                    Pending
                  </button>
                  <button
                    className={projectFilter === "approved" ? "active" : ""}
                    onClick={() => setProjectFilter("approved")}
                  >
                    Approved
                  </button>
                  <button
                    className={projectFilter === "rejected" ? "active" : ""}
                    onClick={() => setProjectFilter("rejected")}
                  >
                    Rejected
                  </button>
                  <button
                    className={projectFilter === "all" ? "active" : ""}
                    onClick={() => setProjectFilter("all")}
                  >
                    All
                  </button>
                </div>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="admin-empty-state">No projects found for the selected status.</div>
            ) : (
              <div className="admin-grid">
                {filteredProjects.map((proj) => {
                  const status = proj.publishingStatus || "approved";
                  const isEditing = editingProjectId === proj.id;
                  return (
                    <div key={proj.id} className="admin-card">
                      <div className="admin-card-header">
                        <h3>{proj.title}</h3>
                        <span className={`admin-badge badge-${status}`}>
                          {status}
                        </span>
                      </div>

                      {!isEditing && (
                        <>
                          <div className="admin-card-meta">
                            <div className="meta-full-width"><strong>Professor:</strong> {getProfessorName(proj)}</div>
                            <div className="meta-full-width"><strong>University / Institute:</strong> {getProfessorInstitute(proj)}</div>
                            <div className="meta-full-width"><strong>Department:</strong> {getProfessorDept(proj.createdBy)}</div>
                            <div className="meta-full-width">
                              <strong>Target Depts:</strong> {proj.openToAll || !proj.departments || proj.departments.length === 0 ? "Open to all departments" : proj.departments.map(code => DEPARTMENT_MAP[code] || code).join(", ")}
                            </div>
                            <div><strong>Stipend:</strong> {proj.compensation || "N/A"}</div>
                            <div><strong>Location:</strong> {proj.location || "N/A"}</div>
                            <div><strong>Commitment:</strong> {proj.timeCommitment || "N/A"}</div>
                            <div><strong>Timeline:</strong> {proj.timeline || "N/A"}</div>
                            <div><strong>Min CPI:</strong> {proj.cpiRequirement || "None"}</div>
                            <div><strong>Openings:</strong> {proj.openings || 1}</div>
                            <div><strong>Project Status:</strong> <span style={{ textTransform: 'capitalize' }}>{proj.status || "Open"}</span></div>
                             {proj.deadline && (
                               <div><strong>Application Deadline:</strong> {new Date(proj.deadline).toLocaleDateString()}</div>
                             )}
                            {proj.eligibleYears && proj.eligibleYears.length > 0 && (
                              <div className="meta-full-width"><strong>Eligible Years:</strong> {proj.eligibleYears.join(", ")}</div>
                            )}
                            {proj.requiredDocuments && proj.requiredDocuments.length > 0 && (
                              <div className="meta-full-width"><strong>Required Docs:</strong> {proj.requiredDocuments.join(", ")}</div>
                            )}
                            {proj.optionalTags && (
                              <div className="meta-full-width"><strong>Tags:</strong> {proj.optionalTags}</div>
                            )}
                          </div>

                          <div className="admin-card-body">
                            <strong>Description:</strong>
                            <p>{proj.description}</p>
                            {proj.priorExperience && (
                              <>
                                <strong>Prior Experience Required:</strong>
                                <p>{proj.priorExperience}</p>
                              </>
                            )}
                          </div>
                        </>
                      )}

                      {isEditing && (
                        <div className="admin-edit-form">
                          <div className="admin-edit-field">
                            <label>Title</label>
                            <input
                              type="text"
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              className="admin-edit-input"
                            />
                          </div>
                          <div className="admin-edit-field">
                            <label>Description</label>
                            <textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              className="admin-edit-textarea"
                              rows={4}
                            />
                          </div>

                          <div className="admin-edit-row" style={{ margin: '14px 0 16px' }}>
                            <div className="admin-edit-field">
                              <label>Location *</label>
                              <select
                                value={editForm.location}
                                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                                className="admin-edit-input"
                              >
                                <option value="Onsite">Onsite</option>
                                <option value="Remote">Remote</option>
                                <option value="Hybrid">Hybrid</option>
                              </select>
                            </div>
                          </div>

                          {/* Compensation Radio Group */}
                          <div className="admin-edit-field" style={{ margin: '14px 0 16px' }}>
                            <label style={{ fontWeight: '700', fontSize: '13px', color: 'var(--app-ink, #0f172a)', marginBottom: '6px', display: 'block' }}>
                              Compensation *
                            </label>
                            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', margin: '6px 0 10px' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600' }}>
                                <input
                                  type="radio"
                                  name="adminStipendType"
                                  value="Paid"
                                  checked={editForm.stipendType === "Paid" || editForm.stipendType === "Scholarship"}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      stipendType: e.target.value,
                                    })
                                  }
                                  style={{ accentColor: '#0284c7', width: '16px', height: '16px' }}
                                />
                                Paid stipend
                              </label>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: '600' }}>
                                <input
                                  type="radio"
                                  name="adminStipendType"
                                  value="Unpaid"
                                  checked={editForm.stipendType === "Unpaid"}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      stipendType: e.target.value,
                                      stipendMin: "",
                                    })
                                  }
                                  style={{ accentColor: '#0284c7', width: '16px', height: '16px' }}
                                />
                                Unpaid
                              </label>
                            </div>

                            {(editForm.stipendType === "Paid" || editForm.stipendType === "Scholarship") && (
                              <div style={{ marginTop: '8px' }}>
                                <label style={{ fontSize: '12.5px', fontWeight: '600' }}>Monthly Stipend (INR/month)</label>
                                <input
                                  type="number"
                                  placeholder="e.g. 15000"
                                  value={editForm.stipendMin}
                                  onChange={(e) => setEditForm({ ...editForm, stipendMin: e.target.value })}
                                  className="admin-edit-input"
                                />
                              </div>
                            )}
                          </div>

                          {/* Expense Support Checkbox Group (Shown when location is Onsite or Hybrid) */}
                          {(editForm.location === "Onsite" || editForm.location === "Hybrid") && (
                            <div style={{ marginBottom: '16px', padding: '12px 14px', background: 'var(--app-surface-muted, #f8fafc)', border: '1px solid var(--app-border, #e2e8f0)', borderRadius: '10px' }}>
                              <label style={{ fontWeight: '700', fontSize: '13px', color: 'var(--app-ink, #0f172a)', marginBottom: '8px', display: 'block' }}>
                                Expense Support
                              </label>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '6px' }}>
                                {[
                                  "Travel expenses covered",
                                  "Accommodation provided",
                                  "Meals provided",
                                  "Local transport provided",
                                ].map((expense) => {
                                  const isChecked = (editForm.expenseSupport || []).includes(expense);
                                  return (
                                    <label key={expense} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          const currentList = editForm.expenseSupport || [];
                                          const updatedList = e.target.checked
                                            ? [...currentList, expense]
                                            : currentList.filter((item) => item !== expense);
                                          setEditForm({
                                            ...editForm,
                                            expenseSupport: updatedList,
                                          });
                                        }}
                                        style={{ accentColor: '#0284c7', width: '15px', height: '15px' }}
                                      />
                                      {expense}
                                    </label>
                                  );
                                })}

                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!editForm.hasOtherExpense}
                                    onChange={(e) => {
                                      setEditForm({
                                        ...editForm,
                                        hasOtherExpense: e.target.checked,
                                        expenseSupportOther: e.target.checked ? editForm.expenseSupportOther : "",
                                      });
                                    }}
                                    style={{ accentColor: '#0284c7', width: '15px', height: '15px' }}
                                  />
                                  Other
                                </label>
                              </div>

                              {editForm.hasOtherExpense && (
                                <div style={{ marginTop: '10px' }}>
                                  <input
                                    type="text"
                                    placeholder="Specify other expense support"
                                    value={editForm.expenseSupportOther || ""}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        expenseSupportOther: e.target.value,
                                      })
                                    }
                                    className="admin-edit-input"
                                    style={{ fontSize: '13px' }}
                                  />
                                </div>
                              )}
                            </div>
                          )}

                          <div className="admin-edit-row">
                            <div className="admin-edit-field">
                              <label>Time Commitment</label>
                              <input
                                type="text"
                                value={editForm.timeCommitment}
                                onChange={(e) => setEditForm({ ...editForm, timeCommitment: e.target.value })}
                                className="admin-edit-input"
                              />
                            </div>
                            <div className="admin-edit-field">
                              <label>Timeline</label>
                              <input
                                type="text"
                                value={editForm.timeline}
                                onChange={(e) => setEditForm({ ...editForm, timeline: e.target.value })}
                                className="admin-edit-input"
                              />
                            </div>
                          </div>

                          <div className="admin-edit-row">
                            <div className="admin-edit-field">
                               <label>Application Deadline</label>
                              <input
                                type="date"
                                value={editForm.deadline}
                                onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                                className="admin-edit-input"
                              />
                            </div>
                            <div className="admin-edit-field">
                              <label>Openings</label>
                              <input
                                type="number"
                                min="1"
                                value={editForm.openings}
                                onChange={(e) => setEditForm({ ...editForm, openings: e.target.value })}
                                className="admin-edit-input"
                              />
                            </div>
                          </div>

                          <div className="admin-edit-row">
                            <div className="admin-edit-field">
                              <label>Min CPI</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="10"
                                value={editForm.cpiRequirement}
                                onChange={(e) => setEditForm({ ...editForm, cpiRequirement: e.target.value })}
                                className="admin-edit-input"
                                placeholder="Leave blank for none"
                              />
                            </div>
                            <div className="admin-edit-field">
                              <label>Status</label>
                              <select
                                value={editForm.status}
                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                className="admin-edit-input"
                              >
                                <option value="open">Open</option>
                                <option value="closed">Closed</option>
                              </select>
                            </div>
                          </div>

                          <div className="admin-edit-field">
                            <label>Prior Experience Required</label>
                            <input
                              type="text"
                              value={editForm.priorExperience}
                              onChange={(e) => setEditForm({ ...editForm, priorExperience: e.target.value })}
                              className="admin-edit-input"
                              placeholder="e.g. Basic Python, ML fundamentals"
                            />
                          </div>

                          <div className="admin-edit-field">
                            <label style={{ fontWeight: '600', marginBottom: '2px' }}>Eligible Years</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '4px 0' }}>
                              {["1st Year", "2nd Year", "3rd Year", "4th Year"].map((year) => {
                                const isChecked = (editForm.eligibleYears || []).includes(year);
                                return (
                                  <label key={year} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 'normal' }}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const current = editForm.eligibleYears || [];
                                        const next = e.target.checked
                                          ? [...current, year]
                                          : current.filter((y) => y !== year);
                                        setEditForm({ ...editForm, eligibleYears: next });
                                      }}
                                    />
                                    {year}
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div className="admin-edit-field">
                            <label style={{ fontWeight: '600', marginBottom: '2px' }}>Required Documents</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px', padding: '4px 0' }}>
                              {["Resume/CV", "Cover Letter", "Statement of Purpose (SOP)", "Academic Transcripts", "Recommendation Letter"].map((docName) => {
                                const isChecked = (editForm.requiredDocuments || []).includes(docName);
                                return (
                                  <label key={docName} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 'normal' }}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        const current = editForm.requiredDocuments || [];
                                        const next = e.target.checked
                                          ? [...current, docName]
                                          : current.filter((d) => d !== docName);
                                        setEditForm({ ...editForm, requiredDocuments: next });
                                      }}
                                    />
                                    {docName}
                                  </label>
                                );
                              })}
                            </div>
                          </div>

                          <div className="admin-edit-field" style={{ margin: '4px 0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'normal', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={editForm.openToAll}
                                onChange={(e) => setEditForm({
                                  ...editForm,
                                  openToAll: e.target.checked,
                                  departments: e.target.checked ? [] : editForm.departments
                                })}
                              />
                              <strong>Open to all departments</strong>
                            </label>
                          </div>

                          {!editForm.openToAll && (
                            <div className="admin-edit-field">
                              <label>Eligible Departments</label>
                              <select
                                value=""
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val && !(editForm.departments || []).includes(val)) {
                                    const next = [...(editForm.departments || []), val];
                                    setEditForm({ ...editForm, departments: next });
                                  }
                                  e.target.value = "";
                                }}
                                className="admin-edit-input"
                              >
                                <option value="">-- Select Department --</option>
                                {DEPARTMENTS.map((dept) => (
                                  <option key={dept.code} value={dept.code} disabled={(editForm.departments || []).includes(dept.code)}>
                                    {dept.name}
                                  </option>
                                ))}
                              </select>

                              {(editForm.departments || []).length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                  {editForm.departments.map((code) => {
                                    const name = DEPARTMENT_MAP[code] || code;
                                    return (
                                      <span
                                        key={code}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          padding: '3px 8px',
                                          background: 'var(--app-surface-hover, #edf2f7)',
                                          color: 'var(--app-ink, #2d3748)',
                                          borderRadius: '12px',
                                          fontSize: '12px',
                                          fontWeight: '500',
                                          border: '1px solid var(--app-border, #cbd5e1)'
                                        }}
                                      >
                                        {name}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = editForm.departments.filter((d) => d !== code);
                                            setEditForm({ ...editForm, departments: next });
                                          }}
                                          style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: '#ef4444',
                                            fontWeight: 'bold',
                                            fontSize: '12px',
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

                          <div className="admin-edit-field">
                            <label>Optional Tags (comma-separated)</label>
                            <input
                              type="text"
                              placeholder="e.g. Machine Learning, NLP, Python"
                              value={editForm.optionalTags}
                              onChange={(e) => setEditForm({ ...editForm, optionalTags: e.target.value })}
                              className="admin-edit-input"
                            />
                          </div>
                        </div>
                      )}

                      <div className="admin-card-actions">
                        {!isEditing && (
                          <button
                            onClick={() => handleEditProject(proj)}
                            className="admin-btn-action admin-btn-edit"
                          >
                            ✎ Edit Details
                          </button>
                        )}
                        {isEditing && (
                          <>
                            <button
                              onClick={() => handleSaveProjectEdit(proj.id)}
                              className="admin-btn-action admin-btn-approve"
                              disabled={editSaving}
                            >
                              {editSaving ? "Saving…" : "✓ Save Changes"}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="admin-btn-action admin-btn-undo"
                              disabled={editSaving}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {!isEditing && status !== "approved" && (
                          <button
                            onClick={() => handleUpdateProjectStatus(proj.id, "approved")}
                            className="admin-btn-action admin-btn-approve"
                          >
                            Approve
                          </button>
                        )}
                        {!isEditing && status !== "rejected" && (
                          <button
                            onClick={() => handleUpdateProjectStatus(proj.id, "rejected")}
                            className="admin-btn-action admin-btn-reject"
                          >
                            Reject
                          </button>
                        )}
                        {!isEditing && status !== "pending" && (
                          <button
                            onClick={() => handleUpdateProjectStatus(proj.id, "pending")}
                            className="admin-btn-action admin-btn-undo"
                          >
                            ↩ Move to Pending
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Tab 2: APPLICATIONS ── */}
        {activeTab === "applications" && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Student Applications</h2>
              <div className="admin-header-actions">
                <input
                  type="text"
                  placeholder="Search by student or project…"
                  value={applicationSearch}
                  onChange={(e) => setApplicationSearch(e.target.value)}
                  className="admin-search-input"
                />
                <div className="admin-filters">
                  <button
                    className={applicationFilter === "pending" ? "active" : ""}
                    onClick={() => setApplicationFilter("pending")}
                  >
                    Pending
                  </button>
                  <button
                    className={applicationFilter === "approved" ? "active" : ""}
                    onClick={() => setApplicationFilter("approved")}
                  >
                    Approved
                  </button>
                  <button
                    className={applicationFilter === "rejected" ? "active" : ""}
                    onClick={() => setApplicationFilter("rejected")}
                  >
                    Rejected
                  </button>
                  <button
                    className={applicationFilter === "all" ? "active" : ""}
                    onClick={() => setApplicationFilter("all")}
                  >
                    All
                  </button>
                </div>
              </div>
            </div>

            {filteredApplications.length === 0 ? (
              <div className="admin-empty-state">
                {applicationFilter === "pending"
                  ? "No applications pending review. All caught up."
                  : "No applications found for the selected filter."}
              </div>
            ) : (
              <div className="admin-grid">
                {filteredApplications.map((app) => {
                  const adminStatus = app.adminApprovalStatus || "pending";
                  const projectTitle = getProjectTitle(app.projectId);
                  return (
                    <div key={app.id} className="admin-card admin-app-card">
                      <div className="admin-card-header">
                        <div className="admin-app-card-title">
                          <span className="admin-app-avatar">
                            {(app.studentName || "S").charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <h3>{app.studentName || "Unknown Student"}</h3>
                            <p className="admin-app-project-name">
                              {projectTitle}
                              {(() => {
                                const proj = projects.find((p) => p.id === app.projectId);
                                const inst = proj ? getProfessorInstitute(proj) : null;
                                return inst && inst !== "N/A" ? ` (${inst})` : "";
                              })()}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                          <span className={`admin-badge badge-${adminStatus}`}>
                            Admin: {adminStatus}
                          </span>
                          {adminStatus === "approved" && (
                            <span className={`admin-badge status-${app.status || "applied"}`}>
                              Prof: {app.status || "applied"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="admin-card-meta">
                        <div><strong>CPI:</strong> {app.cpi || "N/A"}</div>
                        <div><strong>Applied:</strong> {app.createdAt ? new Date(app.createdAt.toDate?.() || app.createdAt).toLocaleDateString() : "N/A"}</div>
                        {app.experience && (
                          <div className="meta-full-width">
                            <strong>Experience:</strong> {app.experience}
                          </div>
                        )}
                      </div>

                      {app.coverNote && (
                        <div className="admin-card-body">
                          <strong>Cover Note:</strong>
                          <p>{app.coverNote}</p>
                        </div>
                      )}

                      <div className="admin-app-card-links" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {app.resumeUrl && (
                          <a
                            href={app.resumeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="admin-link-view"
                          >
                            📄 View Resume
                          </a>
                        )}
                        {(app.documents || []).map((docItem, idx) => (
                          <a
                            key={idx}
                            href={docItem.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="admin-link-view"
                          >
                            📎 {docItem.name || docItem.fileName || "Document"}
                          </a>
                        ))}
                      </div>

                      <div className="admin-card-actions">
                        {adminStatus !== "approved" && (
                          <button
                            onClick={() => handleUpdateApplicationApproval(app.id, "approved")}
                            className="admin-btn-action admin-btn-approve"
                          >
                            ✓ Approve & Forward
                          </button>
                        )}
                        {adminStatus !== "rejected" && (
                          <button
                            onClick={() => handleUpdateApplicationApproval(app.id, "rejected")}
                            className="admin-btn-action admin-btn-reject"
                          >
                            ✕ Reject
                          </button>
                        )}
                        {adminStatus !== "pending" && (
                          <button
                            onClick={() => handleUpdateApplicationApproval(app.id, "pending")}
                            className="admin-btn-action admin-btn-undo"
                          >
                            ↩ Move to Pending
                          </button>
                        )}
                      </div>

                      {adminStatus === "approved" && (
                        <div className="admin-prof-status-section">
                          <strong>Professor Decision:</strong>
                          <select
                            value={app.status || "applied"}
                            onChange={(e) => handleUpdateApplicationProfessorStatus(app.id, e.target.value)}
                            className="admin-edit-input"
                          >
                            <option value="applied">Applied</option>
                            <option value="shortlisted">Shortlisted</option>
                            <option value="selected">Selected</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Tab: PROFESSORS DIRECTORY & ONBOARDING ── */}
        {activeTab === "professors" && (
          <section className="admin-section">
            <div className="admin-section-header">
              <div>
                <h2>Faculty & Supervisors</h2>
                <p style={{ margin: "4px 0 0", fontSize: "14px", color: "var(--app-muted, #64748b)" }}>
                  Manage faculty accounts or set up a new professor account directly on their behalf.
                </p>
              </div>
              <div className="admin-header-actions">
                <input
                  type="text"
                  placeholder="Search faculty by name, email, institute..."
                  value={professorSearch}
                  onChange={(e) => setProfessorSearch(e.target.value)}
                  className="admin-search-input"
                  style={{ minWidth: "260px" }}
                />
                <button
                  type="button"
                  onClick={handleOpenCreateProfModal}
                  className="admin-btn-primary"
                  style={{ padding: "8px 16px", whiteSpace: "nowrap" }}
                >
                  + Add Professor
                </button>
              </div>
            </div>

            {filteredProfessors.length === 0 ? (
              <div className="admin-empty-state">
                <p>No faculty members found.</p>
                <div style={{ marginTop: "12px", display: "flex", gap: "10px", justifyContent: "center" }}>
                  {professorSearch && (
                    <button
                      type="button"
                      onClick={() => setProfessorSearch("")}
                      className="admin-btn-action admin-btn-undo"
                    >
                      Clear Search
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleOpenCreateProfModal}
                    className="admin-btn-primary"
                  >
                    + Add Professor
                  </button>
                </div>
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Faculty Member</th>
                      <th>Institution & Department</th>
                      <th>Research Interests</th>
                      <th>Projects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfessors.map((prof) => {
                      const profProjects = getProfessorProjects(prof.id, prof.email);

                      return (
                        <tr key={prof.id}>
                          <td>
                            <div>
                              <div style={{ fontWeight: "600", color: "#0f172a", fontSize: "14px" }}>
                                {prof.fullName || "Unnamed Professor"}
                              </div>
                              <a
                                href={`mailto:${prof.email}`}
                                style={{ color: "#0284c7", fontSize: "12.5px", textDecoration: "none" }}
                              >
                                {prof.email}
                              </a>
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: "600", color: "#1e293b", fontSize: "13px" }}>
                              {prof.institute || "—"}
                            </div>
                            <div style={{ fontSize: "12px", color: "#64748b" }}>
                              {prof.department1 || prof.department || "—"}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontSize: "13px", color: "#334155", maxWidth: "260px" }}>
                              {prof.interest || "—"}
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleViewProfessorProjects(prof)}
                              title="Filter projects by this professor"
                              style={{
                                background: profProjects.length > 0 ? "#e0f2fe" : "#f1f5f9",
                                color: profProjects.length > 0 ? "#0369a1" : "#64748b",
                                border: "1px solid",
                                borderColor: profProjects.length > 0 ? "#bae6fd" : "#e2e8f0",
                                borderRadius: "999px",
                                padding: "3px 10px",
                                fontSize: "12px",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              {profProjects.length} {profProjects.length === 1 ? "Project" : "Projects"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── Tab 3: BROADCAST NOTICES & ANNOUNCEMENTS ── */}
        {activeTab === "broadcast" && (
          <section className="admin-section">
            <div className="admin-section-header" style={{ marginBottom: "24px" }}>
              <div>
                <h2>Broadcast & Announcements Center</h2>
                <p style={{ margin: "4px 0 0", fontSize: "14px", color: "var(--app-muted, #64748b)" }}>
                  Dispatch official announcements and email notifications to mass audiences, project applicants, or specific individual students.
                </p>
              </div>
            </div>

            {broadcastError && (
              <div className="admin-message-alert admin-error" style={{ marginBottom: "20px" }}>
                {broadcastError}
              </div>
            )}
            {broadcastSuccess && (
              <div className="admin-message-alert admin-success" style={{ marginBottom: "20px" }}>
                {broadcastSuccess}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: "24px", marginBottom: "32px" }}>
              {/* Left Column: Audience & Composition */}
              <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                {/* 1. Target Mode Selection */}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "14px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
                    1. Select Audience Type
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                    {[
                      { id: "portal_wide", label: "Portal-Wide", desc: "Mass broadcast" },
                      { id: "project", label: "Per-Project", desc: "Project applicants" },
                      { id: "custom_users", label: "Specific Users", desc: "Handpick students" },
                    ].map((m) => {
                      const isSel = broadcastTargetMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setBroadcastTargetMode(m.id);
                            if (m.id === "portal_wide") {
                              handleApplyTemplate("general_portal");
                            } else if (m.id === "project" && selectedBroadcastProjectId) {
                              handleApplyTemplate(broadcastTemplate);
                            }
                          }}
                          style={{
                            padding: "10px 8px",
                            borderRadius: "8px",
                            border: isSel ? "2px solid #0284c7" : "1px solid #cbd5e1",
                            backgroundColor: isSel ? "#f0f9ff" : "#f8fafc",
                            color: isSel ? "#0284c7" : "#475569",
                            cursor: "pointer",
                            textAlign: "center",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <strong style={{ display: "block", fontSize: "13px" }}>{m.label}</strong>
                          <span style={{ fontSize: "11px", color: isSel ? "#0369a1" : "#64748b", display: "block", marginTop: "2px" }}>{m.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-Audience Mode 1: Portal Wide */}
                {broadcastTargetMode === "portal_wide" && (
                  <div style={{ marginBottom: "20px", padding: "14px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#0f172a", marginBottom: "8px" }}>
                      Target Group
                    </label>
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                      {[
                        { id: "all_students", label: `All Students (${users.filter(u => u.role === "student").length})` },
                        { id: "all_professors", label: `All Professors (${users.filter(u => u.role === "professor").length})` },
                        { id: "all_users", label: `Everyone (${users.filter(u => u.email).length})` },
                      ].map((grp) => (
                        <label key={grp.id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#334155", cursor: "pointer" }}>
                          <input
                            type="radio"
                            name="portalAudience"
                            value={grp.id}
                            checked={broadcastPortalAudience === grp.id}
                            onChange={(e) => setBroadcastPortalAudience(e.target.value)}
                          />
                          {grp.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-Audience Mode 2: Project Based */}
                {broadcastTargetMode === "project" && (
                  <div style={{ marginBottom: "20px", padding: "14px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#0f172a", marginBottom: "6px" }}>
                      Select Project
                    </label>
                    <select
                      value={selectedBroadcastProjectId}
                      onChange={(e) => {
                        setSelectedBroadcastProjectId(e.target.value);
                        const proj = projects.find(p => p.id === e.target.value);
                        if (proj) {
                          const profName = getProfessorName(proj);
                          const tmpl = BROADCAST_TEMPLATES[broadcastTemplate] || BROADCAST_TEMPLATES.concluded;
                          setBroadcastSubject(tmpl.subject(proj.title));
                          setBroadcastMessage(tmpl.message(proj.title, profName));
                        }
                      }}
                      className="admin-edit-input"
                      style={{ width: "100%", padding: "8px 12px", marginBottom: "12px" }}
                    >
                      <option value="">-- Choose a Project ({projects.length} available) --</option>
                      {projects.map((p) => {
                        const appCount = applications.filter(a => a.projectId === p.id).length;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.title} • Prof. {getProfessorName(p)} ({appCount} applicants)
                          </option>
                        );
                      })}
                    </select>

                    {selectedBroadcastProjectId && (
                      <div>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "600", color: "#0f172a", marginBottom: "6px" }}>
                          Project Recipients
                        </label>
                        <select
                          value={broadcastProjectAudience}
                          onChange={(e) => setBroadcastProjectAudience(e.target.value)}
                          className="admin-edit-input"
                          style={{ width: "100%", padding: "8px 12px" }}
                        >
                          <option value="all">All Project Applicants</option>
                          <option value="applied">Pending / Applied Applicants Only</option>
                          <option value="shortlisted">Shortlisted Candidates Only</option>
                          <option value="selected">Selected Candidates Only</option>
                          <option value="rejected">Rejected Applicants Only</option>
                          <option value="professor">Project Professor Only</option>
                          <option value="both">Both Professor & All Applicants</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Audience Mode 3: Custom Users */}
                {broadcastTargetMode === "custom_users" && (
                  <div style={{ marginBottom: "20px", padding: "14px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <label style={{ fontSize: "13px", fontWeight: "600", color: "#0f172a" }}>
                        Select Individual Students ({selectedUserIds.length} selected)
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            const filtered = users.filter((u) => {
                              const matchRole = userRoleFilter === "all" || u.role === userRoleFilter;
                              const q = userSearchQuery.toLowerCase();
                              const name = (u.fullName || u.name || "").toLowerCase();
                              const email = (u.email || "").toLowerCase();
                              const roll = (u.rollNumber || u.rollNo || "").toLowerCase();
                              return matchRole && (name.includes(q) || email.includes(q) || roll.includes(q));
                            });
                            handleSelectAllFilteredUsers(filtered);
                          }}
                          style={{ fontSize: "11.5px", color: "#0284c7", background: "none", border: "none", cursor: "pointer", fontWeight: "600" }}
                        >
                          Select All Filtered
                        </button>
                        <span style={{ color: "#cbd5e1" }}>|</span>
                        <button
                          type="button"
                          onClick={handleClearSelectedUsers}
                          style={{ fontSize: "11.5px", color: "#64748b", background: "none", border: "none", cursor: "pointer" }}
                        >
                          Clear Selection
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                      <input
                        type="text"
                        placeholder="Search student by name, roll, or email..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="admin-edit-input"
                        style={{ flex: 1, padding: "6px 10px", fontSize: "13px" }}
                      />
                      <select
                        value={userRoleFilter}
                        onChange={(e) => setUserRoleFilter(e.target.value)}
                        className="admin-edit-input"
                        style={{ width: "110px", padding: "6px 8px", fontSize: "12.5px" }}
                      >
                        <option value="student">Students</option>
                        <option value="professor">Professors</option>
                        <option value="all">All Roles</option>
                      </select>
                    </div>

                    {/* Scrollable User List */}
                    <div style={{ maxHeight: "180px", overflowY: "auto", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "6px", padding: "6px" }}>
                      {(() => {
                        const filteredUsers = users.filter((u) => {
                          const matchRole = userRoleFilter === "all" || u.role === userRoleFilter;
                          const q = userSearchQuery.toLowerCase();
                          const name = (u.fullName || u.name || "").toLowerCase();
                          const email = (u.email || "").toLowerCase();
                          const roll = (u.rollNumber || u.rollNo || "").toLowerCase();
                          return matchRole && (name.includes(q) || email.includes(q) || roll.includes(q));
                        });

                        if (filteredUsers.length === 0) {
                          return <div style={{ padding: "12px", textAlign: "center", fontSize: "12.5px", color: "#94a3b8" }}>No users match search.</div>;
                        }

                        return filteredUsers.map((u) => {
                          const isChecked = selectedUserIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "6px 8px",
                                borderBottom: "1px solid #f1f5f9",
                                cursor: "pointer",
                                backgroundColor: isChecked ? "#f0f9ff" : "transparent",
                                borderRadius: "4px",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleSelectUser(u.id)}
                              />
                              <div style={{ flex: 1, fontSize: "12.5px" }}>
                                <strong style={{ color: "#0f172a" }}>{u.fullName || u.name || "Student"}</strong>
                                {u.rollNumber && <span style={{ color: "#64748b", marginLeft: "6px" }}>({u.rollNumber})</span>}
                                <span style={{ color: "#0284c7", marginLeft: "6px", fontSize: "11.5px" }}>{u.email}</span>
                              </div>
                            </label>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}

                {/* 2. Quick Templates */}
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#0f172a", marginBottom: "6px" }}>
                    2. Load Preset Template
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {Object.values(BROADCAST_TEMPLATES).map((tmpl) => {
                      const isActive = broadcastTemplate === tmpl.id;
                      return (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => handleApplyTemplate(tmpl.id)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "600",
                            cursor: "pointer",
                            border: isActive ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                            backgroundColor: isActive ? "#f0f9ff" : "#f8fafc",
                            color: isActive ? "#0284c7" : "#475569",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {tmpl.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Subject */}
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#0f172a", marginBottom: "6px" }}>
                    3. Notice Subject Line
                  </label>
                  <input
                    type="text"
                    value={broadcastSubject}
                    onChange={(e) => setBroadcastSubject(e.target.value)}
                    disabled={broadcasting}
                    className="admin-edit-input"
                    placeholder="Enter email / notice subject..."
                    style={{ width: "100%", fontSize: "13.5px", padding: "8px 12px" }}
                  />
                </div>

                {/* 4. Message Body */}
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "#0f172a", marginBottom: "6px" }}>
                    4. Announcement Message Body
                  </label>
                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    disabled={broadcasting}
                    rows={7}
                    className="admin-edit-textarea"
                    placeholder="Type the official announcement message here..."
                    style={{ width: "100%", fontSize: "13px", lineHeight: "1.5", padding: "10px 12px", resize: "vertical" }}
                  />
                </div>
              </div>

              {/* Right Column: Live Output Preview & Dispatch */}
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>
                    Live Delivery Summary
                  </h3>

                  <div style={{ backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                    <div style={{ fontSize: "13px", color: "#0369a1", marginBottom: "4px" }}>
                      <strong>Target Mode:</strong> {broadcastTargetMode === "portal_wide" ? "Portal-Wide Mass Broadcast" : broadcastTargetMode === "project" ? "Project-Specific" : "Handpicked Students"}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#0284c7" }}>
                      Total Target Recipients: {calculateTotalRecipients()} users
                    </div>
                  </div>

                  {/* Live Email Card Mockup */}
                  <div style={{ border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", backgroundColor: "#f8fafc" }}>
                    <div style={{ backgroundColor: "#0f294a", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#ffffff", fontSize: "13px", fontWeight: "600" }}>Foreign Exposure Programme</span>
                      <span style={{ color: "#94a3b8", fontSize: "11px" }}>from: fep@iitk.ac.in</span>
                    </div>
                    <div style={{ padding: "16px", backgroundColor: "#ffffff" }}>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
                        Subject: {broadcastSubject || "(No subject)"}
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#334155", whiteSpace: "pre-line", maxHeight: "160px", overflowY: "auto", lineHeight: "1.5", padding: "8px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                        {broadcastMessage || "(No message entered yet)"}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={handleInitiateBroadcast}
                      disabled={broadcasting || !broadcastSubject.trim() || !broadcastMessage.trim() || calculateTotalRecipients() === 0}
                      className="admin-btn-action"
                      style={{
                        backgroundColor: "#0284c7",
                        color: "#ffffff",
                        borderColor: "#0284c7",
                        padding: "10px 24px",
                        fontSize: "14px",
                        fontWeight: "700",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {broadcasting ? (
                        <>
                          <span className="spinner-icon">↻</span> Sending Broadcast…
                        </>
                      ) : (
                        `Send Broadcast (${calculateTotalRecipients()} Recipients)`
                      )}
                    </button>
                  </div>
                </div>

                {/* Past Broadcast History */}
                <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>
                      Recent Broadcast History
                    </h3>
                    <button
                      type="button"
                      onClick={loadBroadcastHistory}
                      style={{ fontSize: "12px", color: "#0284c7", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Refresh
                    </button>
                  </div>

                  {historyLoading ? (
                    <div style={{ padding: "16px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>Loading logs…</div>
                  ) : broadcastHistory.length === 0 ? (
                    <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>No previous broadcasts found.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "280px", overflowY: "auto" }}>
                      {broadcastHistory.map((item) => (
                        <div key={item.id} style={{ padding: "12px", backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                            <strong style={{ fontSize: "13px", color: "#0f172a" }}>{item.subject}</strong>
                            <span style={{ fontSize: "11px", color: "#64748b" }}>
                              {item.createdAt ? new Date(item.createdAt.toDate?.() || item.createdAt).toLocaleString() : "Recent"}
                            </span>
                          </div>
                          <p style={{ margin: "4px 0", fontSize: "12px", color: "#475569", lineHeight: "1.4", whiteSpace: "pre-line", maxHeight: "60px", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {item.message}
                          </p>
                          <div style={{ fontSize: "11px", color: "#0284c7", fontWeight: "500", marginTop: "4px" }}>
                            Sent to: {item.recipientCount || 0} recipients • {item.projectTitle ? `Project: ${item.projectTitle}` : "Portal Announcement"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

      </div>
    </AppShell>

    {/* ── Broadcast Confirmation Modal ── */}
    {showBroadcastConfirmModal && (
      <div
        className="admin-modal-overlay"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "16px",
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="admin-modal"
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            maxWidth: "520px",
            width: "100%",
            padding: "24px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "#0f172a" }}>
              Confirm Announcement Dispatch
            </h3>
            <button
              type="button"
              onClick={() => setShowBroadcastConfirmModal(false)}
              style={{ border: "none", background: "transparent", fontSize: "18px", color: "#94a3b8", cursor: "pointer", padding: "4px 8px" }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: "13.5px", color: "#475569", lineHeight: "1.5", margin: "0 0 16px 0" }}>
            You are about to dispatch this official announcement to <strong>{calculateTotalRecipients()} recipient(s)</strong>. This action will immediately deliver in-app notifications and official emails from <strong>fep@iitk.ac.in</strong>.
          </p>

          <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "14px", marginBottom: "20px" }}>
            <div style={{ fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
              <strong>Audience Scope:</strong>{" "}
              {broadcastTargetMode === "portal_wide"
                ? `Portal-Wide (${broadcastPortalAudience === "all_students" ? "All Students" : broadcastPortalAudience === "all_professors" ? "All Professors" : "All Users"})`
                : broadcastTargetMode === "project"
                ? `Project: ${projects.find((p) => p.id === selectedBroadcastProjectId)?.title || "Selected Project"}`
                : `Handpicked Students (${selectedUserIds.length} users)`}
            </div>
            <div style={{ fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
              <strong>Total Recipients:</strong> {calculateTotalRecipients()}
            </div>
            <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: "600" }}>
              <strong>Subject:</strong> {broadcastSubject}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="button"
              onClick={() => setShowBroadcastConfirmModal(false)}
              className="admin-btn-action admin-btn-undo"
              style={{ padding: "8px 18px" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecuteSendBroadcast}
              className="admin-btn-action"
              style={{
                backgroundColor: "#0284c7",
                color: "#ffffff",
                borderColor: "#0284c7",
                padding: "8px 20px",
                fontWeight: "600",
              }}
            >
              Confirm & Send Broadcast
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modal: Add Professor ── */}
    {showCreateProfModal && (
      <div
        className="admin-modal-overlay"
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-modal" style={{ maxWidth: "500px" }}>
          <div className="admin-modal-header">
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "#0f172a" }}>
                Add Professor Account
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
                Create a faculty account and configure their profile on their behalf.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateProfModal(false)}
              className="admin-modal-close-btn"
              title="Close modal"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleCreateProfSubmit} className="admin-modal-body">
            {createProfError && (
              <div className="admin-message-alert admin-error" style={{ marginBottom: "14px" }}>
                {createProfError}
              </div>
            )}

            <div className="admin-form-group">
              <label className="admin-form-label">
                Full Name <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Prof. Alan Turing"
                value={createProfForm.fullName}
                onChange={(e) => setCreateProfForm({ ...createProfForm, fullName: e.target.value })}
                className="admin-form-input"
                required
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">
                Institutional Email <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="email"
                placeholder="e.g. aturing@cambridge.ac.uk"
                value={createProfForm.email}
                onChange={(e) => setCreateProfForm({ ...createProfForm, email: e.target.value })}
                className="admin-form-input"
                required
              />
            </div>

            <div className="admin-form-row">
              <div className="admin-form-group" style={{ flex: 1 }}>
                <label className="admin-form-label">
                  Institution / University <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cambridge University"
                  value={createProfForm.institute}
                  onChange={(e) => setCreateProfForm({ ...createProfForm, institute: e.target.value })}
                  className="admin-form-input"
                  required
                />
              </div>
              <div className="admin-form-group" style={{ flex: 1 }}>
                <label className="admin-form-label">
                  Department <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Computer Science"
                  value={createProfForm.department}
                  onChange={(e) => setCreateProfForm({ ...createProfForm, department: e.target.value })}
                  className="admin-form-input"
                  required
                />
              </div>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">
                Research Interests (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Machine Learning, Cryptography"
                value={createProfForm.interests}
                onChange={(e) => setCreateProfForm({ ...createProfForm, interests: e.target.value })}
                className="admin-form-input"
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">
                Temporary Password <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={createProfForm.password}
                  onChange={(e) => setCreateProfForm({ ...createProfForm, password: e.target.value })}
                  className="admin-form-input"
                  style={{ fontFamily: "monospace", fontWeight: "600" }}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setCreateProfForm({ ...createProfForm, password: generateClientTempPassword() })}
                  className="admin-btn-action"
                  style={{ whiteSpace: "nowrap", padding: "0 12px", fontSize: "12px" }}
                >
                  ↻ Regenerate
                </button>
              </div>
            </div>

            <div style={{ margin: "14px 0 6px" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", color: "#334155", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  style={{ marginTop: "2px" }}
                  checked={createProfForm.sendWelcomeEmail}
                  onChange={(e) => setCreateProfForm({ ...createProfForm, sendWelcomeEmail: e.target.checked })}
                />
                <span>
                  <strong>Send welcome email</strong> with login credentials to the professor
                </span>
              </label>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                onClick={() => setShowCreateProfModal(false)}
                className="admin-btn-action admin-btn-undo"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="admin-btn-primary"
                disabled={createProfLoading}
              >
                {createProfLoading ? "Creating…" : "Create Account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* ── Modal: Post-Creation Credentials Confirmation ── */}
    {createdProfSuccessData && (
      <div
        className="admin-modal-overlay"
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-modal" style={{ maxWidth: "480px" }}>
          <div className="admin-modal-header">
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "#0f172a" }}>
                Account Created Successfully
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
                The professor account has been provisioned and is ready for use.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreatedProfSuccessData(null)}
              className="admin-modal-close-btn"
            >
              ✕
            </button>
          </div>

          <div className="admin-modal-body">
            <div className="admin-credentials-card">
              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#64748b" }}>
                  Professor
                </div>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#0f172a" }}>
                  {createdProfSuccessData.fullName}
                </div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  {createdProfSuccessData.institute} • {createdProfSuccessData.department}
                </div>
              </div>

              <div style={{ marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#64748b" }}>
                  Login Email
                </div>
                <div style={{ fontSize: "13.5px", fontWeight: "600", color: "#0f172a", fontFamily: "monospace" }}>
                  {createdProfSuccessData.email}
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "#64748b" }}>
                  Temporary Password
                </div>
                <div style={{ display: "inline-block", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "4px 10px", fontFamily: "monospace", fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>
                  {createdProfSuccessData.temporaryPassword}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleCopyCredentials(
                    `IIT Kanpur Foreign Exposure Programme - Faculty Login Details\n` +
                    `Professor: ${createdProfSuccessData.fullName}\n` +
                    `Institution: ${createdProfSuccessData.institute}\n` +
                    `Portal URL: https://iriitk.com/fep/login\n` +
                    `Email: ${createdProfSuccessData.email}\n` +
                    `Temporary Password: ${createdProfSuccessData.temporaryPassword}\n`
                  )
                }
                className="admin-copy-credentials-btn"
              >
                {copiedCredentials ? "✓ Copied to Clipboard!" : "📋 Copy Login Details"}
              </button>
            </div>

            {createdProfSuccessData.emailSent && (
              <div style={{ marginTop: "12px", fontSize: "12.5px", color: "#166534" }}>
                ✓ A welcome email with these login instructions was sent to {createdProfSuccessData.email}.
              </div>
            )}

            <div className="admin-modal-footer" style={{ marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => setCreatedProfSuccessData(null)}
                className="admin-btn-primary"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

export default Admin;
