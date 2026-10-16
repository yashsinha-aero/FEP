import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
} from "../firebase";
import AppShell from "../components/AppShell";
import "../styles/projects.css";
import "../styles/admin.css";

const ApplicationDetails = () => {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [togglingMessaging, setTogglingMessaging] = useState(false);
  const [showEnablePrompt, setShowEnablePrompt] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [error, setError] = useState("");
  const [isActionDropdownOpen, setIsActionDropdownOpen] = useState(false);
  const [actionPendingConfirm, setActionPendingConfirm] = useState(null);
  const [isStudentDeleting, setIsStudentDeleting] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [announcements, setAnnouncements] = useState([]);

  const isProfessor = role === "professor";

  const markMessagesRead = useCallback(
    async (appData) => {
      if (!role || !applicationId) return;

      const unreadField =
        role === "professor" ? "unreadForProfessor" : "unreadForStudent";

      if (!appData?.[unreadField]) return;

      await updateDoc(doc(db, "applications", applicationId), {
        [unreadField]: false,
      });
    },
    [applicationId, role]
  );

  const chatEndRef = useRef(null);

  useEffect(() => {
    if (isChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isChatOpen]);

  useEffect(() => {
    if (isChatOpen && application) {
      markMessagesRead(application);
    }
  }, [isChatOpen, application, markMessagesRead]);

  useEffect(() => {
    let isMounted = true;
    const fallbackTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 6000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (isMounted) {
          setLoading(false);
          navigate("/login");
        }
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.data() || {};

        if (isMounted) {
          setUserProfile({ id: user.uid, ...userData });
          setRole(userData?.role);
        }
      } catch (err) {
        console.error("Auth loading error in ApplicationDetails:", err);
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

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (isActionDropdownOpen && !event.target.closest(".take-action-dropdown-container")) {
        setIsActionDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isActionDropdownOpen]);

  useEffect(() => {
    if (!applicationId || !userProfile || !role) return undefined;

    const appRef = doc(db, "applications", applicationId);
    const unsubscribe = onSnapshot(
      appRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          setApplication(null);
          setProject(null);
          setError("Application not found.");
          return;
        }

        const appData = { id: snapshot.id, ...snapshot.data() };
        const isParticipant =
          appData.studentId === userProfile.id || appData.professorId === userProfile.id;

        if (!isParticipant) {
          setApplication(null);
          setProject(null);
          setError("You do not have access to this application.");
          return;
        }

        setApplication(appData);
        setError("");

        if (appData.projectId) {
          try {
            const projectSnap = await getDoc(doc(db, "projects", appData.projectId));
            setProject(projectSnap.exists() ? { id: projectSnap.id, ...projectSnap.data() } : null);
          } catch (e) {
            console.warn("Could not fetch project details:", e);
          }
        }

        if (isChatOpen) {
          await markMessagesRead(appData);
        }
      },
      (snapshotError) => {
        setError(snapshotError.message);
      }
    );

    return () => unsubscribe();
  }, [applicationId, userProfile, role, markMessagesRead, isChatOpen]);

  useEffect(() => {
    if (!applicationId || !application) {
      setMessages([]);
      return undefined;
    }

    const messagesRef = collection(db, "applications", applicationId, "messages");
    const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const nextMessages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();

        return {
          id: docSnap.id,
          ...data,
          message: data.message || "",
        };
      });

      setMessages(nextMessages);
    });

    return () => unsubscribe();
  }, [applicationId, application]);

  // Subscribe to project announcements
  useEffect(() => {
    if (!application?.projectId) return;
    try {
      const q = query(
        collection(db, "projects", application.projectId, "announcements"),
        orderBy("createdAt", "desc")
      );
      const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setAnnouncements(list);
      }, (err) => {
        console.warn("Announcements subscription error:", err);
      });
      return () => unsub();
    } catch (e) {
      console.warn("Announcements query error:", e);
    }
  }, [application?.projectId]);

  const handleUpdateApplicationStatus = async (newStatus) => {
    if (!applicationId) return;

    try {
      await updateDoc(doc(db, "applications", applicationId), {
        status: newStatus,
      });

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
    } catch (statusError) {
      setError("Error updating application: " + statusError.message);
    }
  };

  const handleToggleMessaging = async () => {
    if (!applicationId || !isProfessor) return;
    setTogglingMessaging(true);
    try {
      const current = application?.messagingEnabled ?? false;
      await updateDoc(doc(db, "applications", applicationId), {
        messagingEnabled: !current,
      });
      if (!current) setShowEnablePrompt(false);
    } catch (toggleError) {
      setError("Failed to update messaging setting: " + toggleError.message);
    } finally {
      setTogglingMessaging(false);
    }
  };

  const handleSendMessage = async () => {
    if (!applicationId || !messageText.trim() || !application || !userProfile) return;

    if (!isProfessor && !application.messagingEnabled) return;

    setMessageSending(true);
    setError("");

    try {
      const appRef = doc(db, "applications", applicationId);

      await addDoc(collection(db, "applications", applicationId, "messages"), {
        senderId: userProfile.id,
        senderRole: role,
        message: messageText.trim(),
        createdAt: serverTimestamp(),
      });

      await updateDoc(appRef, {
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: userProfile.id,
        lastMessageSenderRole: role,
        unreadForProfessor: role !== "professor",
        unreadForStudent: role !== "student",
      });

      setMessageText("");

      if (isProfessor && !(application?.messagingEnabled ?? false)) {
        setShowEnablePrompt(true);
      }
    } catch (messageError) {
      setError("Failed to send message. Please try again.");
    } finally {
      setMessageSending(false);
    }
  };

  const handleWithdrawApplication = async () => {
    if (!applicationId || !application) return;
    setIsStudentDeleting(true);
    try {
      const messagesSnap = await getDocs(
        collection(db, "applications", applicationId, "messages")
      );
      for (const m of messagesSnap.docs) {
        await deleteDoc(m.ref);
      }

      await deleteDoc(doc(db, "applications", applicationId));

      navigate("/dashboard/projects", { replace: true });
    } catch (err) {
      console.error("Error withdrawing application:", err);
      setError("Failed to withdraw application: " + err.message);
    } finally {
      setIsStudentDeleting(false);
      setShowWithdrawModal(false);
    }
  };

  const renderMessageTime = (createdAt) => {
    if (!createdAt) return "";
    return new Date(createdAt.toDate?.() || createdAt).toLocaleString();
  };

  const messagingEnabled = application?.messagingEnabled ?? false;

  return (
    <>
      <AppShell showSearch={false}>
        <div className="shell-page application-page">
          <div className="application-page-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate("/dashboard/projects")}
              style={{ padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '8px', border: '1px solid var(--app-border)', color: 'var(--app-muted)' }}
            >
              <span style={{ fontSize: '16px' }}>&larr;</span> Back
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '700', color: 'var(--app-ink)', letterSpacing: '-0.02em' }}>
                Application Details
              </h1>
              {project && <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--app-muted)' }}>Project: {project.title}</p>}
            </div>
          </div>

          {loading ? (
            <div className="empty-state-panel">Loading application...</div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : application ? (
            <div className="application-dashboard-layout" style={{ justifyContent: 'center' }}>
              {/* ── Main Content Panel ── */}
              <section className="application-dashboard-main" style={{ maxWidth: '800px', margin: '0 auto', flex: 'none', width: '100%' }}>
                <div className="app-header-dash">
                  <div className="app-header-title-row">
                    <h2>{application.studentName || "Student Application"}</h2>
                    <span className={`status-badge status-${application.status}`}>
                      {application.status}
                    </span>
                    {application.adminApprovalStatus && (
                      <span
                        className={`status-badge admin-approval-badge admin-approval-${application.adminApprovalStatus}`}
                        style={{ marginLeft: "8px" }}
                      >
                        Admin: {application.adminApprovalStatus}
                      </span>
                    )}
                  </div>

                  {/* Student Withdraw Application Button */}
                  {!isProfessor && userProfile && application.studentId === userProfile.id && (
                    <div style={{ marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => setShowWithdrawModal(true)}
                        className="btn-secondary"
                        style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '8px 14px', fontSize: '13px', fontWeight: '500' }}
                      >
                        Withdraw Application
                      </button>
                    </div>
                  )}

                  {/* Professor Dropdown for Taking Action */}
                  {isProfessor && application.adminApprovalStatus === "approved" && (
                    <div className="take-action-dropdown-container">
                      <button
                        type="button"
                        className="take-action-btn"
                        onClick={() => setIsActionDropdownOpen(!isActionDropdownOpen)}
                      >
                        Take Action
                        <span style={{ fontSize: '10px', display: 'inline-block', transform: isActionDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                      </button>
                      {isActionDropdownOpen && (
                        <div className="take-action-dropdown-menu">
                          {[
                            { value: "shortlisted", label: "Shortlist" },
                            { value: "selected", label: "Select" },
                            { value: "rejected", label: "Reject" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setActionPendingConfirm(option.value);
                                setIsActionDropdownOpen(false);
                              }}
                              className={`dropdown-item option-${option.value} ${application.status === option.value ? 'active-status' : ''}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="project-info-grid" style={{ marginBottom: '32px' }}>
                  <div className="project-info-item">
                    <div className="project-info-body">
                      <span className="project-info-label">Project</span>
                      <span className="project-info-value">
                        {project ? project.title : application.projectId ? "Loading…" : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="project-info-item">
                    <div className="project-info-body">
                      <span className="project-info-label">CPI</span>
                      <span className="project-info-value">{application.cpi || "Not specified"}</span>
                    </div>
                  </div>
                  <div className="project-info-item">
                    <div className="project-info-body">
                      <span className="project-info-label">Experience</span>
                      <span className="project-info-value">{application.experience || "N/A"}</span>
                    </div>
                  </div>
                  <div className="project-info-item">
                    <div className="project-info-body">
                      <span className="project-info-label">Applied On</span>
                      <span className="project-info-value">{renderMessageTime(application.createdAt) || "Not available"}</span>
                    </div>
                  </div>
                </div>

                {!isProfessor && (!application.adminApprovalStatus || application.adminApprovalStatus === "pending") && (
                  <div className="admin-approval-notice admin-approval-pending" style={{ margin: "0 0 24px" }}>
                    <div>
                      <strong>Pending Admin Review</strong>
                      <p>Your application is being reviewed by the admin before it is forwarded to the professor.</p>
                    </div>
                  </div>
                )}
                {!isProfessor && application.adminApprovalStatus === "rejected" && (
                  <div className="admin-approval-notice admin-approval-rejected" style={{ margin: "0 0 24px" }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="approval-notice-icon" style={{ fontSize: '18px', fontWeight: 'bold', color: '#b42318' }}>✕</span>
                      <div>
                        <strong>Rejected by Admin</strong>
                        <p style={{ margin: '4px 0 0' }}>Your application was not approved by the admin.</p>
                      </div>
                    </div>
                  </div>
                )}

                {application.coverNote && (
                  <div className="project-detail-section" style={{ marginBottom: '24px' }}>
                    <h3>Cover Note</h3>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{application.coverNote}</p>
                  </div>
                )}

                {/* Official Announcements / Notices */}
                {announcements.length > 0 && (
                  <div className="project-detail-section" style={{ marginBottom: '24px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>
                        Official Project Notices & Announcements
                      </h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {announcements.map((ann) => (
                        <div
                          key={ann.id}
                          style={{
                            padding: '16px',
                            backgroundColor: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderLeft: '4px solid #0284c7',
                            borderRadius: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                              {ann.subject}
                            </h4>
                            <span style={{ fontSize: '11.5px', color: '#64748b', backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '12px' }}>
                              {ann.createdAt ? new Date(ann.createdAt.toDate?.() || ann.createdAt).toLocaleDateString() : "Recent"}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-line' }}>
                            {ann.message}
                          </p>
                          <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                            Broadcasted by FEP Administration
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(application.resumeUrl || (application.documents && application.documents.length > 0)) && (
                  <div className="project-detail-section">
                    <h3>Attached Documents</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '6px' }}>
                      {application.resumeUrl && (
                        <a
                          href={application.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: '500' }}
                        >
                          📄 View Resume / CV
                        </a>
                      )}
                      {(application.documents || []).map((docItem, idx) => (
                        <a
                          key={idx}
                          href={docItem.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px', fontWeight: '500' }}
                        >
                          📎 View {docItem.name || docItem.fileName || `Document ${idx + 1}`}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* ── Floating Chat Widget ── */}
              <div className="floating-chat-container">
                <button
                  type="button"
                  className={`floating-chat-btn ${isChatOpen ? 'open' : ''}`}
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  aria-label="Toggle chat"
                  style={{ position: 'relative' }}
                >
                  {isChatOpen ? "✕" : (
                    <>
                      <span className="floating-chat-icon">💬</span>
                      <span className="floating-chat-text">Message the {isProfessor ? "Student" : "Professor"}</span>
                      {((role === "professor" && application?.unreadForProfessor) ||
                        (role === "student" && application?.unreadForStudent)) && (
                          <span className="floating-chat-badge">!</span>
                        )}
                    </>
                  )}
                </button>

                {isChatOpen && (
                  <div className="floating-chat-panel">
                    <div className="chat-header-dash" style={{ borderTopLeftRadius: '12px', borderTopRightRadius: '12px', background: 'var(--app-primary)', color: 'white', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, color: 'white', fontSize: '16px', fontWeight: '600' }}>Messages</h3>
                      {isProfessor && (
                        <label className="prof-messaging-switch">
                          <span className="prof-messaging-switch-label">{messagingEnabled ? "Replies On" : "Replies Off"}</span>
                          <div className={`prof-messaging-toggle ${messagingEnabled ? "enabled" : ""}`} onClick={handleToggleMessaging} style={{ opacity: togglingMessaging ? 0.6 : 1 }}>
                            <div className="prof-messaging-thumb" />
                          </div>
                        </label>
                      )}
                    </div>

                    {!isProfessor && !messagingEnabled && (
                      <div className="messaging-disabled-notice dash-disabled-notice" style={{ margin: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
                        <div>
                          <strong>Not available</strong>
                          <p style={{ margin: 0 }}>The professor hasn't enabled messaging yet.</p>
                        </div>
                      </div>
                    )}

                    <div className="application-chat-list dash-chat-list" style={{ borderRadius: 0, flex: 1, overflowY: 'auto' }}>
                      {messages.length === 0 ? (
                        <p className="empty-state">No messages yet.</p>
                      ) : (
                        <>
                          {messages.map((message) => {
                            const isMine = message.senderId === userProfile?.id;
                            return (
                              <div key={message.id} className={`message-bubble-wrapper ${isMine ? 'mine' : 'theirs'}`}>
                                <div className="message-bubble">
                                  {!isMine && <div className="message-sender" style={{ fontSize: '11px', opacity: 0.8, marginBottom: '2px', textTransform: 'capitalize' }}>{message.senderRole}</div>}
                                  <div className="message-content">{message.message}</div>
                                  <div className="message-time" style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px', textAlign: 'right' }}>
                                    {renderMessageTime(message.createdAt)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div ref={chatEndRef} />
                        </>
                      )}
                    </div>

                    {(isProfessor || messagingEnabled) && (
                      <div className="message-input-section dash-msg-input" style={{ borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                        <textarea
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          placeholder="Type a message..."
                          className="form-textarea"
                          style={{ minHeight: '60px', marginBottom: '12px' }}
                        />
                        <button
                          type="button"
                          onClick={handleSendMessage}
                          disabled={messageSending}
                          className="btn-primary"
                          style={{ width: '100%', padding: '10px' }}
                        >
                          {messageSending ? "Sending..." : "Send Message"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-state-panel">Application not found.</div>
          )}
        </div>
      </AppShell>

      {/* ── Enable Messaging Modal ── */}
      {isProfessor && showEnablePrompt && !messagingEnabled && (
        <div
          className="enable-msg-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setShowEnablePrompt(false); }}
        >
          <div className="enable-msg-modal">
            <h2>Allow Student to Reply?</h2>
            <p className="enable-msg-sub">You just sent a message, but <strong>messaging is currently off</strong>, so the student can only read your message.</p>
            <div className="enable-msg-actions">
              <button type="button" className="enable-msg-yes" onClick={handleToggleMessaging} disabled={togglingMessaging}>
                {togglingMessaging ? "Enabling…" : "✓ Yes, Enable Messaging"}
              </button>
              <button type="button" className="enable-msg-no" onClick={() => setShowEnablePrompt(false)}>
                No, Keep It Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Action Confirmation Advisory Modal ── */}
      {actionPendingConfirm && (
        <div className="action-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="action-confirm-title">
          <div className="action-confirm-modal">
            <h2 id="action-confirm-title" className={`action-title-${actionPendingConfirm}`}>
              {actionPendingConfirm === "selected" ? "Select Student?" : actionPendingConfirm === "shortlisted" ? "Shortlist Student?" : "Reject Student?"}
            </h2>
            <p className="action-confirm-name">“{application.studentName}”</p>
            <div style={{ fontSize: '14.5px', color: 'var(--app-muted, #5a6a85)', margin: '0 0 24px', lineHeight: '1.5' }}>
              Are you sure you want to mark this application as <strong>{actionPendingConfirm}</strong>?
            </div>
            <div className="action-confirm-actions">
              <button
                type="button"
                className="action-confirm-cancel-btn"
                onClick={() => setActionPendingConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`action-confirm-btn confirm-btn-${actionPendingConfirm}`}
                onClick={async () => {
                  const targetStatus = actionPendingConfirm;
                  setActionPendingConfirm(null);
                  await handleUpdateApplicationStatus(targetStatus);
                }}
              >
                {actionPendingConfirm === "selected" ? "Yes, Select Student" : actionPendingConfirm === "shortlisted" ? "Yes, Shortlist Student" : "Yes, Reject Student"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Student Withdraw Confirmation Modal ── */}
      {showWithdrawModal && (
        <div className="action-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="withdraw-confirm-title">
          <div className="action-confirm-modal">
            <h2 id="withdraw-confirm-title" style={{ color: "#dc2626", margin: "0 0 12px", fontSize: "20px", fontWeight: "700" }}>
              Withdraw Application?
            </h2>
            <div style={{ fontSize: '14.5px', color: 'var(--app-muted, #5a6a85)', margin: '0 0 24px', lineHeight: '1.5' }}>
              Are you sure you want to withdraw and permanently delete your application for <strong>“{project?.title || "this project"}”</strong>? This will remove all your attached documents and messages. This action cannot be undone.
            </div>
            <div className="action-confirm-actions">
              <button
                type="button"
                className="action-confirm-cancel-btn"
                onClick={() => setShowWithdrawModal(false)}
                disabled={isStudentDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{
                  background: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 18px",
                  fontWeight: "600",
                  cursor: isStudentDeleting ? "not-allowed" : "pointer",
                  opacity: isStudentDeleting ? 0.7 : 1,
                }}
                onClick={handleWithdrawApplication}
                disabled={isStudentDeleting}
              >
                {isStudentDeleting ? "Withdrawing…" : "Yes, Withdraw Application"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ApplicationDetails;