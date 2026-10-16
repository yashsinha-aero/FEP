import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { requestResetOtp, verifyResetOtp, executeResetPassword } from "../services/api";

import "../styles/auth.css";
import "../styles/auth-animations.css";
import "../styles/loading-animations.css";

// Import your actual logos from the assets folder
import fepLogo from "../assets/fep-logo.png";
import Footer from "../components/Footer";

const PasswordReset = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [timer, setTimer] = useState(60);
  const [resetToken, setResetToken] = useState("");
  
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (step === 2 && timer > 0 && !loading && !success) {
      const interval = setInterval(() => {
        setTimer((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, timer, loading, success]);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email) return;

    try {
      setLoading(true);
      await requestResetOtp({ email: email.trim().toLowerCase() });
      setTimer(60);
      setStep(2);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to send verification code.");
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");

    if (otp.length !== 6) {
      setError("Enter valid 6 digit OTP");
      return;
    }

    try {
      setLoading(true);
      const res = await verifyResetOtp({ email: email.trim().toLowerCase(), otp });
      setResetToken(res.data.resetToken);
      setStep(3);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || "Invalid OTP");
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (timer > 0) return;

    try {
      setLoading(true);
      await requestResetOtp({ email: email.trim().toLowerCase() });
      setTimer(60);
      setError("");
      setOtp(""); // Clear OTP input
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || "Unable to resend OTP");
      setLoading(false);
    }
  };

  const handleExecuteReset = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

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
      await executeResetPassword({
        email: email.trim().toLowerCase(),
        resetToken,
        newPassword: password,
      });

      // Show success animation
      setSuccess(true);
      setMessage("Password successfully reset.");

      // Wait for animation to complete before navigating
      setTimeout(() => {
        setLoading(false);
        navigate("/login");
      }, 2500);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to update password.");
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <form className="fep-form" onSubmit={handleRequestOtp}>
            <input
              type="email"
              placeholder="Institute Email Address"
              className="fep-input"
              value={email}
              onChange={(e) => setEmail(e.target.value.toLowerCase())}
              disabled={loading}
              required
              autoFocus
            />
            
            <button type="submit" disabled={!email || loading} className="fep-btn-primary" style={{ marginTop: "8px" }}>
              {loading ? "Sending..." : "Send Reset Code"}
            </button>
            
            <div className="fep-signup-prompt">
              Remember your password?{" "}
              <button
                type="button"
                onClick={() => navigate('/login')}
                disabled={loading}
                className="fep-signup-link"
              >
                Login
              </button>
            </div>
          </form>
        );

      case 2:
        return (
          <form className="fep-form" onSubmit={handleVerifyOtp}>
            <p className="otp-subtext" style={{ fontSize: '13px', color: '#6B7280', textAlign: 'center', marginBottom: '8px', marginTop: '-12px' }}>
              Verification code sent to <strong>{email}</strong>
            </p>
            <input
              type="text"
              maxLength="6"
              placeholder="Enter 6 Digit OTP"
              className="fep-input"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              disabled={loading}
              autoFocus
              required
              style={
                otp
                  ? { textAlign: "center", letterSpacing: "8px", fontSize: "20px", fontWeight: "bold" }
                  : { textAlign: "center" }
              }
            />
            
            <button type="submit" disabled={otp.length !== 6 || loading} className="fep-btn-primary" style={{ marginTop: "8px" }}>
              {loading ? "Verifying..." : "Verify Code"}
            </button>

            <button
              type="button"
              className={`fep-signup-link ${timer > 0 ? "otp-btn-disabled" : ""}`}
              disabled={timer > 0 || loading}
              onClick={handleResendOtp}
              style={{
                marginTop: '12px',
                textAlign: 'center',
                width: '100%',
                fontSize: '13px',
                opacity: timer > 0 ? 0.5 : 1,
                cursor: timer > 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {timer > 0 ? `Resend Code in ${timer}s` : "Resend Code"}
            </button>

            <div className="fep-signup-prompt" style={{ marginTop: "16px" }}>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setOtp("");
                  setError("");
                }}
                disabled={loading}
                className="fep-signup-link"
                style={{ textDecoration: "underline" }}
              >
                ← Edit Email
              </button>
            </div>
          </form>
        );

      case 3:
        const passwordTooShort = password.length > 0 && password.length < 8;
        const passwordMismatch = confirmPassword && password !== confirmPassword;
        return (
          <form className="fep-form" onSubmit={handleExecuteReset}>
            <input
              type="password"
              placeholder="New Password (Min 8 characters)"
              className="fep-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              autoFocus
            />
            {passwordTooShort && (
              <p style={{ color: '#EF4444', fontSize: '11px', fontWeight: '600', marginTop: '-8px' }}>
                Password must be at least 8 characters.
              </p>
            )}

            <input
              type="password"
              placeholder="Confirm New Password"
              className="fep-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
            />
            {passwordMismatch && (
              <p style={{ color: '#EF4444', fontSize: '11px', fontWeight: '600', marginTop: '-8px' }}>
                Passwords do not match.
              </p>
            )}
            {confirmPassword && !passwordMismatch && !passwordTooShort && (
              <p style={{ color: '#10B981', fontSize: '11px', fontWeight: '600', marginTop: '-8px' }}>
                Passwords match ✓
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
              className="fep-btn-primary"
              style={{ marginTop: "8px" }}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fep-layout">
      
      {/* Background Animations */}
      <div className="orbit-system">
        <div className="orbit-ring orbit-1"></div>
        <div className="orbit-ring orbit-2"></div>
        <div className="orbit-ring orbit-3"></div>
      </div>

      <div className="globe-container">
        <div className="globe">
          <div className="globe-ring ring-g1"></div>
          <div className="globe-ring ring-g2"></div>
          <div className="globe-ring ring-g3"></div>
          <div className="globe-ring ring-g4"></div>
        </div>
      </div>

      <svg className="connection-network" width="100%" height="100%">
        <line x1="10%" y1="80%" x2="90%" y2="20%" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 6" />
        <line x1="20%" y1="10%" x2="80%" y2="90%" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 6" />
      </svg>
      <div className="node-pulse" style={{ top: "80%", left: "10%" }}></div>
      <div className="node-pulse" style={{ top: "20%", left: "90%", animationDelay: "1s" }}></div>
      <div className="node-pulse" style={{ top: "10%", left: "20%", animationDelay: "0.5s" }}></div>
      <div className="node-pulse" style={{ top: "90%", left: "80%", animationDelay: "1.5s" }}></div>

      <div className="flight-path flight-1">
        <div className="light-streak"></div>
        <svg className="plane-svg" width="28" height="28" viewBox="0 0 24 24" fill="white">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      </div>

      <div className="flight-path flight-2">
        <div className="light-streak" style={{ width: "200px" }}></div>
        <svg className="plane-svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      </div>

      {/* Header */}
      <header className="fep-header">
        <div className="fep-header-left" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
          <div className="fep-header-logo-wrapper">
            <img 
              src={fepLogo} 
              alt="FEP Logo" 
            />
          </div>
          <span className="fep-header-title">Foreign Exposure Programme</span>
        </div>
        <div className="fep-header-right">IIT Kanpur</div>
      </header>

      {/* Main Content */}
      <main className="fep-main">
        {loading && (
          <div className={`loading-overlay ${success ? "success" : ""} absolute inset-0 z-50 flex items-center justify-center bg-[#0D203A]/60 backdrop-blur-sm rounded-2xl`}>
            <div className="loading-content">
              {!success ? (
                <div className="spinner"></div>
              ) : (
                <>
                  <div className="success-checkmark">
                    <svg className="checkmark" viewBox="0 0 52 52">
                      <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                      <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                    </svg>
                  </div>
                  <p className="success-text text-white mt-4 font-semibold">{message}</p>
                  <p className="redirect-text text-white/70 text-sm mt-1">Redirecting to login...</p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="fep-auth-card">
          
          <div className="fep-card-icon" style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}>
            <img 
              src={fepLogo} 
              alt="FEP Card Logo" 
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
            />
          </div>

          <h2 className="fep-card-title">Reset Password</h2>
          <p className="fep-card-subtitle">Academics & Career Council</p>

          {error && <div className="fep-error-msg">{error}</div>}

          {renderStep()}

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PasswordReset;