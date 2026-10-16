import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import LandingPage from "./pages/LandingPage"; // Added LandingPage import
import SignUp from "./pages/SignUp";
import VerifyEmail from "./pages/VerifyEmail";
import Login from "./pages/Login";
import PasswordReset from "./pages/PasswordReset";
import AuthAction from "./pages/AuthAction";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import './styles/mobile.css';
import Projects from "./pages/Projects";
import ApplicationDetails from "./pages/ApplicationDetails";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";

function App() {
  const basename = process.env.NODE_ENV === "production" ? "/fep" : undefined;

  return (
    <Router basename={basename}>
      <Routes>
        {/* Default Route - Now set to LandingPage */}
        <Route path="/" element={<LandingPage />} />

        {/* Auth Routes */}
        <Route path="/signup" element={<SignUp />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<PasswordReset />} />
        <Route path="/auth-action" element={<AuthAction />} />
        
        <Route
          path="/dashboard/projects"
          element={
            <ProtectedRoute>
              <Projects />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/applications/:applicationId"
          element={
            <ProtectedRoute>
              <ApplicationDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Fallback - Redirects unknown URLs back to the landing page */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;