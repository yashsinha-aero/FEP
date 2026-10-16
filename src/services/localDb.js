import API, {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getApplications,
  getApplication,
  submitApplication,
  updateApplicationStatus,
  updateAdminApproval,
  deleteApplication,
  getApplicationMessages,
  sendApplicationMessage,
  getUsers,
  getUser,
  updateUser,
  getProjectAnnouncements,
  createProjectAnnouncement,
  uploadResumeFile,
  deleteResumeFile,
  uploadDocumentFile,
  deleteDocumentFile,
  API_BASE_URL,
} from "./api";

// ─── QUERY BUILDER HELPERS ───────────────────────────────────────────────────
export const doc = (dbInstance, collectionName, id) => ({
  type: "doc",
  collection: collectionName,
  id: String(id),
  ref: { id: String(id), path: `${collectionName}/${id}` },
});

export const collection = (dbInstance, ...segments) => {
  if (segments.length === 1) {
    return {
      type: "collection",
      name: segments[0],
      path: segments[0],
    };
  }
  // Subcollections: e.g. collection(db, "applications", id, "messages")
  return {
    type: "subcollection",
    parentCollection: segments[0],
    parentId: segments[1],
    name: segments[2],
    path: segments.join("/"),
  };
};

export const query = (target, ...clauses) => ({
  type: "query",
  target,
  clauses: clauses.filter(Boolean),
});

export const where = (field, op, value) => ({
  type: "where",
  field,
  op,
  value,
});

export const orderBy = (field, direction = "asc") => ({
  type: "orderBy",
  field,
  direction,
});

export const limit = (count) => ({
  type: "limit",
  count,
});

export const setDoc = async (docRef, data, options = {}) => {
  return updateDoc(docRef, data);
};

export const serverTimestamp = () => new Date().toISOString();

// Helper to normalize query parameters
const extractQueryParams = (clauses = []) => {
  const params = {};
  clauses.forEach((c) => {
    if (c.type === "where") {
      if (c.field === "createdBy") params.createdBy = c.value;
      if (c.field === "status") params.status = c.value;
      if (c.field === "publishingStatus") params.publishingStatus = c.value;
      if (c.field === "projectId") params.projectId = c.value;
      if (c.field === "studentId") params.studentId = c.value;
      if (c.field === "professorId") params.professorId = c.value;
      if (c.field === "adminApprovalStatus") params.adminApprovalStatus = c.value;
      if (c.field === "role") params.role = c.value;
    }
  });
  return params;
};

// ─── GET SINGLE DOC ──────────────────────────────────────────────────────────
export const getDoc = async (docRef) => {
  const { collection: col, id } = docRef;
  try {
    let data = null;
    if (col === "users") {
      const res = await getUser(id);
      data = res.data;
    } else if (col === "projects") {
      const res = await getProject(id);
      data = res.data;
    } else if (col === "applications") {
      const res = await getApplication(id);
      data = res.data;
    }

    return {
      exists: () => Boolean(data && data.id),
      data: () => data || {},
      id: docRef.id,
      ref: docRef,
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return {
        exists: () => false,
        data: () => ({}),
        id: docRef.id,
        ref: docRef,
      };
    }
    throw error;
  }
};

// ─── GET MULTIPLE DOCS ────────────────────────────────────────────────────────
export const getDocs = async (queryOrCol) => {
  const target = queryOrCol.target || queryOrCol;
  const clauses = queryOrCol.clauses || [];
  const params = extractQueryParams(clauses);

  let items = [];

  if (target.type === "collection") {
    const colName = target.name;
    if (colName === "projects") {
      const res = await getProjects(params);
      items = res.data || [];
    } else if (colName === "applications") {
      const res = await getApplications(params);
      items = res.data || [];
    } else if (colName === "users") {
      const res = await getUsers(params);
      items = res.data || [];
    }
  } else if (target.type === "subcollection") {
    if (target.name === "messages") {
      const res = await getApplicationMessages(target.parentId);
      items = res.data || [];
    } else if (target.name === "announcements") {
      const res = await getProjectAnnouncements(target.parentId);
      items = res.data || [];
    }
  }

  // Client-side filtering fallback for exact equality
  clauses.forEach((c) => {
    if (c.type === "where" && c.op === "==") {
      items = items.filter((item) => {
        const val = item[c.field];
        return val === c.value;
      });
    }
  });

  const docs = items.map((item) => ({
    id: item.id,
    data: () => item,
    exists: () => true,
    ref: doc(null, target.name || target.parentCollection, item.id),
  }));

  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb) => docs.forEach(cb),
  };
};

// ─── ADD DOC ─────────────────────────────────────────────────────────────────
export const addDoc = async (colRef, data) => {
  if (colRef.type === "collection") {
    if (colRef.name === "projects") {
      const res = await createProject(data);
      return { id: res.data.id };
    }
    if (colRef.name === "applications") {
      const res = await submitApplication(data);
      return { id: res.data.id };
    }
  }

  if (colRef.type === "subcollection") {
    if (colRef.name === "messages") {
      const res = await sendApplicationMessage(colRef.parentId, data.message);
      return { id: res.data.id };
    }
    if (colRef.name === "announcements") {
      const res = await createProjectAnnouncement(colRef.parentId, data);
      return { id: res.data.id };
    }
  }

  throw new Error(`Unsupported addDoc collection: ${colRef.name}`);
};

// ─── UPDATE DOC ──────────────────────────────────────────────────────────────
export const updateDoc = async (docRef, updates) => {
  const { collection: col, id } = docRef;

  if (col === "users") {
    return updateUser(id, updates);
  }
  if (col === "projects") {
    return updateProject(id, updates);
  }
  if (col === "applications") {
    if (updates.status !== undefined) {
      return updateApplicationStatus(id, updates.status);
    }
    if (updates.adminApprovalStatus !== undefined) {
      return updateAdminApproval(id, updates.adminApprovalStatus);
    }
  }

  // Fallback for general PUT
  return API.put(`/${col}/${id}`, updates);
};

// ─── DELETE DOC ──────────────────────────────────────────────────────────────
export const deleteDoc = async (docRef) => {
  const { collection: col, id } = docRef;
  if (col === "projects") return deleteProject(id);
  if (col === "applications") return deleteApplication(id);
  return API.delete(`/${col}/${id}`);
};

// ─── ON SNAPSHOT (Reactive polling listener) ──────────────────────────────────
export const onSnapshot = (targetRef, callback, errorCallback) => {
  let isMounted = true;
  let timerId = null;

  const poll = async () => {
    if (!isMounted) return;
    try {
      if (targetRef.type === "doc") {
        const snap = await getDoc(targetRef);
        if (isMounted) callback(snap);
      } else {
        const snap = await getDocs(targetRef);
        if (isMounted) callback(snap);
      }
    } catch (err) {
      if (isMounted && errorCallback) {
        errorCallback(err);
      }
    }
  };

  // Immediate fetch
  poll();

  // Polling interval: 4 seconds for responsive real-time experience
  timerId = setInterval(poll, 4000);

  return () => {
    isMounted = false;
    if (timerId) clearInterval(timerId);
  };
};

// ─── STORAGE ADAPTER ─────────────────────────────────────────────────────────
export const storage = {};

export const ref = (storageInstance, storagePath) => ({
  path: storagePath,
  name: storagePath.split("/").pop(),
});

export const uploadBytes = async (storageRef, file) => {
  const isResume = storageRef.path.startsWith("resumes/");
  const formData = new FormData();

  if (isResume) {
    formData.append("resume", file);
    formData.append("name", file.name);
    const res = await uploadResumeFile(formData);
    storageRef.url = res.data.resume.url;
    return res.data;
  } else {
    formData.append("document", file);
    formData.append("name", file.name);
    const res = await uploadDocumentFile(formData);
    storageRef.url = res.data.document.url;
    return res.data;
  }
};

export const getDownloadURL = async (storageRef) => {
  if (storageRef.url) {
    if (storageRef.url.startsWith("http")) return storageRef.url;
    const serverOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
    return `${serverOrigin}${storageRef.url}`;
  }
  const filename = storageRef.path.split("/").pop();
  const folder = storageRef.path.startsWith("resumes/") ? "resumes" : "documents";
  const serverOrigin = API_BASE_URL.replace(/\/api\/?$/, "");
  return `${serverOrigin}/api/files/${folder}/${filename}`;
};

export const deleteObject = async (storageRef) => {
  const isResume = storageRef.path.startsWith("resumes/");
  if (isResume) {
    return deleteResumeFile({ storagePath: storageRef.path });
  } else {
    return deleteDocumentFile({ storagePath: storageRef.path });
  }
};

export const db = {};

const localDb = {
  db,
  storage,
  doc,
  collection,
  query,
  where,
  orderBy,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
};

export default localDb;
