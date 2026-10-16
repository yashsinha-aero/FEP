import axios from "axios";

export const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5001/api";

const API = axios.create({
  baseURL: API_BASE_URL,
});

// Automatically inject JWT token into Authorization header for all requests
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("fep_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 token expiration gracefully
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const isAuthEndpoint =
        error.config.url.includes("/login") ||
        error.config.url.includes("/signup") ||
        error.config.url.includes("/verify-otp");
      if (!isAuthEndpoint) {
        // If session expired during authenticated operation
        // Don't auto-redirect abruptly, let callers handle or clear
      }
    }
    return Promise.reject(error);
  }
);

// ─── AUTH ENDPOINTS ───────────────────────────────────────────────────────────
export const signupUser = (data) => API.post("/signup", data);
export const verifyOtp = (data) => API.post("/verify-otp", data);
export const resendOtp = (data) => API.post("/resend-otp", data);
export const loginCheckEmail = (data) => API.post("/login-check-email", data);
export const loginUser = (data) => API.post("/login", data);
export const adminLoginUser = (data) => API.post("/admin-login", data);
export const getMe = () => API.get("/auth/me");

export const requestResetOtp = (data) => API.post("/request-reset-otp", data);
export const verifyResetOtp = (data) => API.post("/verify-reset-otp", data);
export const executeResetPassword = (data) => API.post("/execute-reset-password", data);

export const requestDeleteCode = (token) =>
  API.post(
    "/request-delete-code",
    {},
    token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  );

export const deleteAccount = (token, code) =>
  API.post(
    "/delete-account",
    { code },
    token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  );

// ─── PROJECT ENDPOINTS ────────────────────────────────────────────────────────
export const getProjects = (params) => API.get("/projects", { params });
export const getProject = (id) => API.get(`/projects/${id}`);
export const createProject = (data) => API.post("/projects", data);
export const updateProject = (id, data) => API.put(`/projects/${id}`, data);
export const deleteProject = (id) => API.delete(`/projects/${id}`);

export const getProjectAnnouncements = (projectId) =>
  API.get(`/projects/${projectId}/announcements`);
export const createProjectAnnouncement = (projectId, data) =>
  API.post(`/projects/${projectId}/announcements`, data);

// ─── APPLICATION ENDPOINTS ────────────────────────────────────────────────────
export const getApplications = (params) => API.get("/applications", { params });
export const getApplication = (id) => API.get(`/applications/${id}`);
export const submitApplication = (data) => API.post("/applications", data);
export const updateApplicationStatus = (id, status) =>
  API.put(`/applications/${id}/status`, { status });
export const updateAdminApproval = (id, adminApprovalStatus) =>
  API.put(`/applications/${id}/admin-approval`, { adminApprovalStatus });
export const deleteApplication = (id) => API.delete(`/applications/${id}`);

export const getApplicationMessages = (appId) =>
  API.get(`/applications/${appId}/messages`);
export const sendApplicationMessage = (appId, message) =>
  API.post(`/applications/${appId}/messages`, { message });
export const markApplicationMessagesRead = (appId) =>
  API.post(`/applications/${appId}/messages/read`);

// ─── USER & NOTIFICATION ENDPOINTS ───────────────────────────────────────────
export const getUsers = (params) => API.get("/users", { params });
export const getUser = (id) => API.get(`/users/${id}`);
export const updateUser = (id, data) => API.put(`/users/${id}`, data);
export const getUserNotifications = (id) => API.get(`/users/${id}/notifications`);
export const markNotificationRead = (id, notifId) =>
  API.put(`/users/${id}/notifications/${notifId}/read`);

// ─── FILE UPLOAD ENDPOINTS ───────────────────────────────────────────────────
export const uploadResumeFile = (formData) =>
  API.post("/upload/resume", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const deleteResumeFile = (payload) =>
  API.delete("/upload/resume", { data: payload });

export const uploadDocumentFile = (formData) =>
  API.post("/upload/document", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

export const deleteDocumentFile = (payload) =>
  API.delete("/upload/document", { data: payload });

// ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────────────
export const notifyApplicationSubmitted = (token, data) =>
  API.post("/notify-application", data, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

export const broadcastAnnouncement = (token, data) =>
  API.post("/broadcast-announcement", data, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

export const adminCreateProfessor = (token, data) =>
  API.post("/admin-create-professor", data, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

export const adminResetProfessorPassword = (token, data) =>
  API.post("/admin-reset-professor-password", data, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

export const adminUpdateProfessor = (token, data) =>
  API.post("/admin-update-professor", data, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

export default API;
