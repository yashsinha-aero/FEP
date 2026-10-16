import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  auth,
  db,
  storage,
  onAuthStateChanged,
  signOut,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "../firebase";
import AppShell from "../components/AppShell";
import { deleteAccount, requestDeleteCode } from "../services/api";
import "../styles/profile.css";

const editableFields = [
  "fullName",
  "phone",
  "institute",
  "roll",
  "programme",
  "department1",
  "department2",
  "interest",
];

const getInitials = (name, email) => {
  if (name && name.trim()) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  if (email && email.trim()) {
    return email[0].toUpperCase();
  }
  return "U";
};

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteCodeSent, setDeleteCodeSent] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [stats, setStats] = useState({ projects: 0, applications: 0 });
  const [sendingDeleteCode, setSendingDeleteCode] = useState(false);

  // Resume state
  const [resumeName, setResumeName] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [resumeSuccess, setResumeSuccess] = useState("");
  const [fileInputKey, setFileInputKey] = useState(Date.now());
  const [resumeToDelete, setResumeToDelete] = useState(null); // resume pending deletion confirm

  // Supporting Documents state (Transcripts, Certificates, SOP, etc.)
  const [docName, setDocName] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState("");
  const [docSuccess, setDocSuccess] = useState("");
  const [docFileInputKey, setDocFileInputKey] = useState(Date.now());
  const [docToDelete, setDocToDelete] = useState(null); // doc pending deletion confirm

  const isProfessor = profile?.role === "professor";
  const isStudent = profile?.role === "student";

  const visibleFields = useMemo(() => {
    if (isProfessor) {
      return [
        "fullName",
        "phone",
        "institute",
        "department1",
        "department2",
        "interest",
      ];
    }

    if (isStudent) {
      return [
        "fullName",
        "phone",
        "roll",
        "programme",
        "department1",
        "department2",
        "interest",
      ];
    }

    return editableFields;
  }, [isProfessor, isStudent]);

  const loadStats = useCallback(async (currentUser, role) => {
    if (!currentUser || !role) return;
    try {
      let projectCount = 0;
      let applicationCount = 0;

      if (role === "professor") {
        const projectSnapshot = await getDocs(
          query(collection(db, "projects"), where("createdBy", "==", currentUser.uid))
        );
        projectCount = projectSnapshot.size;

        const profAppsSnapshot = await getDocs(
          query(collection(db, "applications"), where("professorId", "==", currentUser.uid))
        );
        applicationCount = profAppsSnapshot.size;
      } else if (role === "student") {
        const studentAppsSnapshot = await getDocs(
          query(collection(db, "applications"), where("studentId", "==", currentUser.uid))
        );
        applicationCount = studentAppsSnapshot.size;
      }

      setStats({ projects: projectCount, applications: applicationCount });
    } catch (statsError) {
      // Stats failing should never block profile display or save.
      console.warn("Could not load profile stats:", statsError.message);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let unsubSnapshot = null;
    const fallbackTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 6000);

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        if (isMounted) {
          setLoading(false);
          navigate("/login");
        }
        return;
      }

      if (isMounted) {
        setUser(currentUser);
      }

      if (unsubSnapshot) unsubSnapshot();
      unsubSnapshot = onSnapshot(
        doc(db, "users", currentUser.uid),
        (userSnap) => {
          if (!isMounted) return;
          const userData = userSnap.exists() ? userSnap.data() : {};
          const profileData = { id: currentUser.uid, email: currentUser.email, ...userData };
          setProfile(profileData);
          setForm((prev) => ({
            fullName: userData?.fullName || currentUser.displayName || prev.fullName || "",
            phone: userData?.phone || prev.phone || "",
            institute: userData?.institute || prev.institute || "",
            roll: userData?.roll || prev.roll || "",
            programme: userData?.programme || prev.programme || "",
            department1: userData?.department1 || prev.department1 || "",
            department2: userData?.department2 || prev.department2 || "",
            interest: userData?.interest || prev.interest || "",
          }));
          setLoading(false);
          loadStats(currentUser, userData?.role);
        },
        (err) => {
          console.error("Profile load error:", err);
          if (isMounted) {
            setError(err.message);
            setLoading(false);
          }
        }
      );
    });

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
      if (unsubSnapshot) unsubSnapshot();
      unsubscribeAuth();
    };
  }, [loadStats, navigate]);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!user) return;

    setSaving(true);
    setError("");
    setStatusMessage("");

    try {
      const payload = {};
      visibleFields.forEach((field) => {
        payload[field] = form[field]?.trim() || null;
      });

      await updateDoc(doc(db, "users", user.uid), payload);
      setStatusMessage("Profile updated successfully.");
    } catch (saveError) {
      setError("Failed to update profile: " + saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendDeleteCode = async () => {
    if (!user) return;

    setSendingDeleteCode(true);
    setError("");
    setStatusMessage("");

    try {
      const token = await user.getIdToken(true);
      await requestDeleteCode(token);
      setDeleteCodeSent(true);
      setStatusMessage("Deletion code sent to your email.");
    } catch (codeError) {
      const message = codeError.response?.data?.error || codeError.message;
      setError("Failed to send deletion code: " + message);
    } finally {
      setSendingDeleteCode(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !deleteCode.trim()) return;

    setDeleting(true);
    setError("");
    setStatusMessage("");

    try {
      const token = await user.getIdToken(true);
      await deleteAccount(token, deleteCode.trim());
      await signOut(auth);
      navigate("/signup");
    } catch (deleteError) {
      const message = deleteError.response?.data?.error || deleteError.message;
      setError("Failed to delete account: " + message);
      setDeleting(false);
    }
  };

  const handleUploadResume = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (!resumeName.trim()) {
      setResumeError("Please enter a resume name");
      return;
    }
    if (!resumeFile) {
      setResumeError("Please select a resume file");
      return;
    }

    const MAX_RESUME_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5MB
    if (resumeFile.size > MAX_RESUME_SIZE_BYTES) {
      setResumeError("Resume file size must not exceed 1.5MB. Please upload a smaller file.");
      return;
    }

    setUploadingResume(true);
    setResumeError("");
    setResumeSuccess("");

    try {
      const timestamp = Date.now();
      const storagePath = `resumes/${user.uid}/profile/${timestamp}-${resumeFile.name}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, resumeFile);
      const downloadUrl = await getDownloadURL(fileRef);

      const userRef = doc(db, "users", user.uid);
      const currentResumes = profile?.resumes || [];
      const newResume = {
        name: resumeName.trim(),
        url: downloadUrl,
        storagePath: storagePath,
        uploadedAt: new Date().toISOString(),
        approvalStatus: "approved",
      };
      
      const updatedResumes = [...currentResumes, newResume];
      await updateDoc(userRef, { resumes: updatedResumes });
      
      setResumeName("");
      setResumeFile(null);
      setFileInputKey(Date.now());
      setResumeSuccess("Resume uploaded successfully.");
    } catch (err) {
      console.error("Resume upload error: ", err);
      setResumeError("Failed to upload resume: " + err.message);
    } finally {
      setUploadingResume(false);
    }
  };

  const handleRemoveResume = (resume) => {
    // Open the advisory modal instead of window.confirm
    setResumeToDelete(resume);
  };

  const handleConfirmRemoveResume = async () => {
    if (!user || !resumeToDelete) return;

    setUploadingResume(true);
    setResumeError("");
    setResumeSuccess("");
    setResumeToDelete(null);

    try {
      if (resumeToDelete.storagePath) {
        const fileRef = ref(storage, resumeToDelete.storagePath);
        await deleteObject(fileRef);
      }

      const userRef = doc(db, "users", user.uid);
      const currentResumes = profile?.resumes || [];
      const updatedResumes = currentResumes.filter(
        (r) => r.storagePath !== resumeToDelete.storagePath
      );

      await updateDoc(userRef, { resumes: updatedResumes });
      setResumeSuccess("Resume removed successfully.");
    } catch (err) {
      console.error("Resume remove error: ", err);
      setResumeError("Failed to remove resume: " + err.message);
    } finally {
      setUploadingResume(false);
    }
  };

  const handleUploadDoc = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (!docName.trim()) {
      setDocError("Please enter a document name (e.g. Official Transcript, SOP)");
      return;
    }
    if (!docFile) {
      setDocError("Please select a PDF document file");
      return;
    }

    const MAX_DOC_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5MB
    if (docFile.size > MAX_DOC_SIZE_BYTES) {
      setDocError("Document file size must not exceed 1.5MB. Please upload a smaller file.");
      return;
    }

    setUploadingDoc(true);
    setDocError("");
    setDocSuccess("");

    try {
      const timestamp = Date.now();
      const cleanName = docFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const storagePath = `documents/${user.uid}/profile/${timestamp}-${cleanName}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, docFile);
      const downloadUrl = await getDownloadURL(fileRef);

      const userRef = doc(db, "users", user.uid);
      const currentDocs = profile?.documents || [];
      const newDoc = {
        id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
        name: docName.trim(),
        fileName: docFile.name,
        url: downloadUrl,
        storagePath: storagePath,
        uploadedAt: new Date().toISOString(),
      };

      const updatedDocs = [...currentDocs, newDoc];
      await updateDoc(userRef, { documents: updatedDocs });

      setDocName("");
      setDocFile(null);
      setDocFileInputKey(Date.now());
      setDocSuccess("Document uploaded successfully.");
    } catch (err) {
      console.error("Document upload error: ", err);
      setDocError("Failed to upload document: " + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleRemoveDoc = (docItem) => {
    setDocToDelete(docItem);
  };

  const handleConfirmRemoveDoc = async () => {
    if (!user || !docToDelete) return;

    setUploadingDoc(true);
    setDocError("");
    setDocSuccess("");
    const target = docToDelete;
    setDocToDelete(null);

    try {
      if (target.storagePath) {
        const fileRef = ref(storage, target.storagePath);
        await deleteObject(fileRef).catch((err) => console.warn("Storage delete warning:", err));
      }

      const userRef = doc(db, "users", user.uid);
      const currentDocs = profile?.documents || [];
      const updatedDocs = currentDocs.filter(
        (d) => (target.id ? d.id !== target.id : (d.storagePath ? d.storagePath !== target.storagePath : d.url !== target.url))
      );

      await updateDoc(userRef, { documents: updatedDocs });
      setDocSuccess("Document removed successfully.");
    } catch (err) {
      console.error("Document remove error: ", err);
      setDocError("Failed to remove document: " + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const renderField = (field) => {
    const labels = {
      fullName: "Full Name",
      phone: "Phone",
      institute: "Institute",
      roll: "Roll Number",
      programme: "Programme",
      department1: "Primary Department",
      department2: "Secondary Department",
      interest: "Interest Area",
    };

    return (
      <label key={field} className="profile-field">
        <span>{labels[field]}</span>
        <input
          value={form[field] || ""}
          onChange={(event) => handleChange(field, event.target.value)}
          disabled={saving || deleting}
        />
      </label>
    );
  };

  const avatarInitial = getInitials(profile?.fullName, profile?.email);

  return (
    <>
    <AppShell showSearch={false}>
      <div className="shell-page profile-page">
        {loading ? (
          <div className="home-shimmer">
            <div className="home-shimmer-block" style={{ height: 140 }} />
            <div className="home-shimmer-block" style={{ height: 320 }} />
          </div>
        ) : (
          <>
            <section className="profile-hero">
              <div className="profile-hero-avatar">{avatarInitial}</div>
              <div className="profile-hero-info">
                <p className="profile-kicker">{profile?.role || "User"} Account</p>
                <h1>{profile?.fullName || "Profile"}</h1>
                <p className="profile-hero-email">{profile?.email}</p>
                <div className="profile-hero-chips">
                  <span className="profile-chip profile-chip-role">{profile?.role || "user"}</span>
                  <span className="profile-chip">{stats.projects} Project{stats.projects !== 1 ? "s" : ""}</span>
                  <span className="profile-chip">{stats.applications} Application{stats.applications !== 1 ? "s" : ""}</span>
                  <span className={`profile-chip ${profile?.emailVerified ? "profile-chip-verified" : "profile-chip-unverified"}`}>
                    {profile?.emailVerified ? "✓ Verified" : "Unverified"}
                  </span>
                </div>
              </div>
            </section>

            <section className="profile-grid">
              <div className="profile-main-area">
                <form className="profile-card profile-form" onSubmit={handleSave}>
                  <div className="profile-section-header">
                    <div>
                      <h2>Profile Details</h2>
                      <p>Keep your FEP account information current.</p>
                    </div>
                    <button className="profile-primary-btn" disabled={saving || deleting}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>

                  {error && <div className="profile-error">{error}</div>}
                  {statusMessage && <div className="profile-success">{statusMessage}</div>}

                  <div className="profile-fields">{visibleFields.map(renderField)}</div>
                </form>

                {isStudent && (
                  <>
                    <div className="profile-card profile-resumes-card">
                    <div className="profile-section-header">
                      <div>
                        <h2>Manage Resumes</h2>
                        <p>Upload your resumes to use them when applying for projects.</p>
                      </div>
                    </div>

                    {resumeError && <div className="profile-error">{resumeError}</div>}
                    {resumeSuccess && <div className="profile-success">{resumeSuccess}</div>}

                    <div className="uploaded-resumes-list">
                      <h3>Your Resumes</h3>
                      {!profile?.resumes || profile.resumes.length === 0 ? (
                        <p className="no-resumes-text">No resumes uploaded yet. Upload your first resume below.</p>
                      ) : (
                        <div className="resume-items">
                          {profile.resumes.map((resume, idx) => {
                            return (
                              <div key={idx} className="resume-item-row">
                                <div className="resume-item-info">
                                  <span className="resume-file-icon">📄</span>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span className="resume-item-name">{resume.name}</span>
                                    <span className="resume-upload-date">
                                      Uploaded: {resume.uploadedAt ? new Date(resume.uploadedAt).toLocaleDateString() : "N/A"}
                                    </span>
                                  </div>
                                </div>
                                <div className="resume-item-actions">
                                  <a
                                    href={resume.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="resume-action-view"
                                  >
                                    View
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveResume(resume)}
                                    className="resume-action-remove"
                                    disabled={uploadingResume}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleUploadResume} className="resume-upload-form">
                      <h3>Upload New Resume</h3>
                      <div className="resume-upload-fields">
                        <label className="profile-field">
                          <span>Resume Name</span>
                          <input
                            type="text"
                            value={resumeName}
                            onChange={(e) => setResumeName(e.target.value)}
                            placeholder="e.g. Software Engineering CV"
                            disabled={uploadingResume}
                            required
                          />
                        </label>
                        <label className="profile-field">
                          <span>Select PDF File <span style={{ fontSize: "11px", color: "var(--app-muted, #64748b)", fontWeight: "normal" }}>(Max 1.5MB)</span></span>
                          <input
                            key={fileInputKey}
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setResumeFile(e.target.files[0])}
                            disabled={uploadingResume}
                            required
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        className="profile-primary-btn resume-upload-btn"
                        disabled={uploadingResume || !resumeName.trim() || !resumeFile}
                      >
                        {uploadingResume ? "Uploading..." : "Upload Resume"}
                      </button>
                    </form>
                  </div>

                  {/* Supporting Documents (Transcripts, Certificates, SOP, etc.) */}
                  <div className="profile-card profile-resumes-card" style={{ marginTop: "24px" }}>
                    <div className="profile-section-header">
                      <div>
                        <h2>Supporting Documents</h2>
                        <p>Upload your transcripts, certificates, SOPs, and other documents to easily attach them when applying for research projects.</p>
                      </div>
                    </div>

                    {docError && <div className="profile-error">{docError}</div>}
                    {docSuccess && <div className="profile-success">{docSuccess}</div>}

                    <div className="uploaded-resumes-list">
                      <h3>Your Documents Library</h3>
                      {!profile?.documents || profile.documents.length === 0 ? (
                        <p className="no-resumes-text">No additional documents uploaded yet. Upload your transcripts, SOP, or certificates below.</p>
                      ) : (
                        <div className="resume-items">
                          {profile.documents.map((docItem, idx) => {
                            return (
                              <div key={docItem.id || idx} className="resume-item-row">
                                <div className="resume-item-info">
                                  <span className="resume-file-icon">📎</span>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span className="resume-item-name">{docItem.name}</span>
                                    <span className="resume-upload-date">
                                      {docItem.fileName ? `${docItem.fileName} • ` : ""}Uploaded: {docItem.uploadedAt ? new Date(docItem.uploadedAt).toLocaleDateString() : "N/A"}
                                    </span>
                                  </div>
                                </div>
                                <div className="resume-item-actions">
                                  <a
                                    href={docItem.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="resume-action-view"
                                  >
                                    View
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDoc(docItem)}
                                    className="resume-action-remove"
                                    disabled={uploadingDoc}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <form onSubmit={handleUploadDoc} className="resume-upload-form">
                      <h3>Upload New Document</h3>
                      <div className="resume-upload-fields">
                        <label className="profile-field">
                          <span>Document Name / Label</span>
                          <input
                            type="text"
                            value={docName}
                            onChange={(e) => setDocName(e.target.value)}
                            placeholder="e.g. Official Transcript, SOP, GATE Scorecard"
                            disabled={uploadingDoc}
                            required
                          />
                        </label>
                        <label className="profile-field">
                          <span>Select PDF File <span style={{ fontSize: "11px", color: "var(--app-muted, #64748b)", fontWeight: "normal" }}>(Max 1.5MB)</span></span>
                          <input
                            key={docFileInputKey}
                            type="file"
                            accept=".pdf"
                            onChange={(e) => setDocFile(e.target.files[0])}
                            disabled={uploadingDoc}
                            required
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        className="profile-primary-btn resume-upload-btn"
                        disabled={uploadingDoc || !docName.trim() || !docFile}
                      >
                        {uploadingDoc ? "Uploading..." : "Upload Document"}
                      </button>
                    </form>
                  </div>
                </>
              )}
              </div>

              <aside className="profile-side">
                <div className="profile-card profile-quick-info">
                  <h2>Account Info</h2>
                  <div className="profile-info-rows">
                    <div className="profile-info-row">
                      <span>Email</span>
                      <strong>{profile?.email || "N/A"}</strong>
                    </div>
                    <div className="profile-info-row">
                      <span>Role</span>
                      <strong style={{ textTransform: "capitalize" }}>{profile?.role || "N/A"}</strong>
                    </div>
                    <div className="profile-info-row">
                      <span>Projects</span>
                      <strong>{stats.projects}</strong>
                    </div>
                    <div className="profile-info-row">
                      <span>Applications</span>
                      <strong>{stats.applications}</strong>
                    </div>
                  </div>
                </div>

                <div className="profile-card profile-danger">
                  <h2>Delete Account</h2>
                  <p>
                    This permanently deletes your profile, projects, applications,
                    messages, resumes, and login account. A deletion code will be
                    sent to your registered email before anything is removed.
                  </p>
                  <button
                    type="button"
                    className="profile-secondary-danger-btn"
                    onClick={handleSendDeleteCode}
                    disabled={sendingDeleteCode || deleting}
                  >
                    {sendingDeleteCode ? "Sending Code..." : "Send Deletion Code"}
                  </button>
                  <label className="profile-field">
                    <span>Deletion Code</span>
                    <input
                      value={deleteCode}
                      onChange={(event) => setDeleteCode(event.target.value)}
                      disabled={deleting}
                      placeholder={deleteCodeSent ? "Enter emailed code" : "Send code first"}
                    />
                  </label>
                  <button
                    type="button"
                    className="profile-danger-btn"
                    onClick={handleDeleteAccount}
                    disabled={!deleteCode.trim() || deleting}
                  >
                    {deleting ? "Deleting..." : "Delete My Account"}
                  </button>
                </div>
              </aside>
            </section>
          </>
        )}
      </div>
    </AppShell>

    {/* ── Resume Delete Advisory Modal ── */}
    {resumeToDelete && (
      <div className="resume-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="resume-delete-title">
        <div className="resume-delete-modal">
          <div className="resume-delete-icon">⚠️</div>
          <h2 id="resume-delete-title">Delete Resume?</h2>
          <p className="resume-delete-name">“{resumeToDelete.name}”</p>
          <ul className="resume-delete-warnings">
            <li>The file will be <strong>permanently removed from the server</strong> and cannot be recovered.</li>
            <li>Any active application that used this resume will <strong>lose access to it</strong>, which may negatively impact your candidacy.</li>
            <li>You will need to re-upload and get admin approval for a replacement resume before applying again.</li>
          </ul>
          <div className="resume-delete-actions">
            <button
              type="button"
              className="resume-delete-cancel-btn"
              onClick={() => setResumeToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="resume-delete-confirm-btn"
              onClick={handleConfirmRemoveResume}
            >
              Yes, Delete Resume
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Document Delete Advisory Modal ── */}
    {docToDelete && (
      <div className="resume-delete-overlay" role="dialog" aria-modal="true" aria-labelledby="doc-delete-title">
        <div className="resume-delete-modal">
          <div className="resume-delete-icon">⚠️</div>
          <h2 id="doc-delete-title">Delete Document?</h2>
          <p className="resume-delete-name">“{docToDelete.name}”</p>
          <ul className="resume-delete-warnings">
            <li>The file will be <strong>permanently removed from your document library</strong> and storage.</li>
            <li>Any application where you attached this document will <strong>lose access to the file</strong>.</li>
          </ul>
          <div className="resume-delete-actions">
            <button
              type="button"
              className="resume-delete-cancel-btn"
              onClick={() => setDocToDelete(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="resume-delete-confirm-btn"
              onClick={handleConfirmRemoveDoc}
            >
              Yes, Delete Document
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

export default Profile;
