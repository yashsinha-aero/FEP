import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, signInWithEmailAndPassword } from "../firebase";
import "../styles/auth.css";
import "../styles/auth-animations.css";
import "../styles/loading-animations.css";
import Footer from "../components/Footer";
import fepLogo from "../assets/fep-logo.png";

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    setLoading(true);

    try {

      // 1. Authenticate directly through Firebase Client SDK
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

      // 2. Retrieve token claims and verify isAdmin claim
      const idTokenResult = await userCredential.user.getIdTokenResult(true);
      const isAdmin = idTokenResult.claims.isAdmin === true;

      if (!isAdmin) {
        // Sign out immediately if not admin
        await auth.signOut();
        throw new Error("Access denied. You do not have administrator privileges.");
      }

      setSuccess(true);
      setTimeout(() => {
        navigate("/admin", { replace: true });
      }, 1500);
    } catch (err) {
      console.error("Admin login error:", err);
      setError(
        err.response?.data?.error ||
        err.message || 
        "Login failed. Please verify admin credentials."
      );
      setLoading(false);
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
            <img src={fepLogo} alt="FEP Logo" />
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
                <>
                  <div className="spinner"></div>
                  <p className="loading-text text-white mt-4 font-semibold">Authenticating Admin...</p>
                </>
              ) : (
                <>
                  <div className="success-checkmark">
                    <svg className="checkmark" viewBox="0 0 52 52">
                      <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                      <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                    </svg>
                  </div>
                  <p className="success-text text-white mt-4 font-semibold">Admin Access Granted!</p>
                  <p className="redirect-text text-white/70 text-sm mt-1">Redirecting to admin panel...</p>
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

          <h2 className="fep-card-title">Admin Login</h2>
          <p className="fep-card-subtitle">Secure Gateway</p>

          {error && <div className="fep-error-msg">{error}</div>}

          <form className="fep-form" onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Admin Email Address"
              className="fep-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              autoFocus
            />

            <input
              type="password"
              placeholder="Security Password"
              className="fep-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />

            <button type="submit" disabled={!email || !password || loading} className="fep-btn-primary">
              {loading ? "Verifying..." : "Secure Login"}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default AdminLogin;
