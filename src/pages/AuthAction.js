import { useEffect, useState } from "react";
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
} from "../firebase";
import { useSearchParams, useNavigate } from "react-router-dom";
import "../styles/auth.css";
import "../styles/loading-animations.css";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const AuthAction = () => {
  const auth = getAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");
  const continueUrl = searchParams.get("continueUrl");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordMismatch = confirmPassword && password !== confirmPassword;

  useEffect(() => {
    if (!mode || !oobCode) {
      navigate("/login");
    }
  }, [mode, oobCode, navigate]);

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      
      await verifyPasswordResetCode(auth, oobCode);
      await confirmPasswordReset(auth, oobCode, password);

      setSuccess(true);
      setMessage("Password successfully reset.");
      
      setTimeout(() => {
        if (continueUrl) {
          window.location.href = continueUrl;
        } else {
          navigate("/login");
        }
      }, 2000);
    } catch {
      setError("Invalid or expired link.");
      setLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    try {
      setLoading(true);
      setError("");
      
      await applyActionCode(auth, oobCode);
      
      setSuccess(true);
      setMessage("Email verified successfully.");
      
      setTimeout(() => {
        if (continueUrl) {
          window.location.href = continueUrl;
        } else {
          navigate("/login");
        }
      }, 2000);
    } catch {
      setError("Invalid or expired link.");
      setLoading(false);
    }
  };

  const renderContent = () => {
    switch (mode) {
      case "resetPassword":
        return (
          <>
            <h2 className="auth-title">Reset Password</h2>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}

            <form className="auth-form" onSubmit={handleResetPassword}>
              <input
                type="password"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
              {passwordTooShort && (
                <p className="auth-helper auth-helper-error">
                  Password must be at least 8 characters.
                </p>
              )}
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
              {passwordMismatch && (
                <p className="auth-helper auth-helper-error">
                  Passwords do not match.
                </p>
              )}
              <button 
                type="submit"
                disabled={
                  !password ||
                  !confirmPassword ||
                  passwordTooShort ||
                  passwordMismatch ||
                  loading
                }
              >
                {loading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          </>
        );

      case "verifyEmail":
        return (
          <>
            <h2 className="auth-title">Verify Email</h2>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-success">{message}</div>}
            <div className="auth-form">
              <button 
                onClick={handleVerifyEmail}
                disabled={loading}
              >
                {loading ? "Verifying..." : "Confirm Email Verification"}
              </button>
            </div>
          </>
        );

      default:
        return <div>Invalid action.</div>;
    }
  };

  return (
    <div className="layout-container">
      <Navbar />
      <div className="layout-content">
        <div className="auth-wrapper">
          {/* Loading Overlay */}
          {loading && (
            <div className={`loading-overlay ${success ? 'success' : ''}`}>
              <div className="loading-content">
                {!success ? (
                  <>
                    <div className="spinner"></div>
                    <p className="loading-text">
                      {mode === "resetPassword" 
                        ? "Resetting your password..." 
                        : "Verifying your email..."}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="success-checkmark">
                      <svg className="checkmark" viewBox="0 0 52 52">
                        <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                        <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                      </svg>
                    </div>
                    <p className="success-text">
                      {mode === "resetPassword" 
                        ? "Password Reset Successfully!" 
                        : "Email Verified Successfully!"}
                    </p>
                    <p className="redirect-text">Redirecting to login...</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* LEFT SIDE */}
          <div className="auth-left">
            {/* Animated Background Elements */}
            <div className="animated-bg">
              {/* Globe/World Animation */}
              <div className="globe-container">
                <div className="globe">
                  <div className="globe-ring ring-1"></div>
                  <div className="globe-ring ring-2"></div>
                  <div className="globe-ring ring-3"></div>
                </div>
              </div>

              {/* Floating Planes */}
              <div className="plane plane-1">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="white" opacity="0.6"/>
                </svg>
              </div>
              <div className="plane plane-2">
                <svg width="35" height="35" viewBox="0 0 24 24" fill="none">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="white" opacity="0.5"/>
                </svg>
              </div>

              {/* Floating Dots/Particles */}
              {[...Array(15)].map((_, i) => (
                <div key={i} className={`particle particle-${i + 1}`}></div>
              ))}

              {/* Connection Lines */}
              <svg className="connection-lines" width="100%" height="100%">
                <line className="line line-1" x1="10%" y1="20%" x2="40%" y2="60%" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                <line className="line line-2" x1="60%" y1="30%" x2="90%" y2="70%" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                <line className="line line-3" x1="30%" y1="80%" x2="70%" y2="40%" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
              </svg>

              {/* Pulsing Circles */}
              <div className="pulse-circle pulse-1"></div>
              <div className="pulse-circle pulse-2"></div>
              <div className="pulse-circle pulse-3"></div>
            </div>

            {/* Content on top of animation */}
            <div className="auth-left-content">
              <h1>FOREIGN EXPOSURE PROGRAMME</h1>
              <p>ACADEMICS AND CAREER COUNCIL</p>
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div className="auth-right">
            <div className="auth-card">{renderContent()}</div>
          </div>
        </div>
      </div>
      <Footer theme="light" />
    </div>
  );
};

export default AuthAction;
