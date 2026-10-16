import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, signInWithEmailAndPassword } from "../firebase";
import { loginCheckEmail } from "../services/api";

import "../styles/auth.css";
import "../styles/auth-animations.css";
import "../styles/loading-animations.css";

// Import your actual logos from the assets folder
import fepLogo from "../assets/fep-logo.png";
import Footer from "../components/Footer";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const redirect = queryParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [success, setSuccess] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) return;

    try {
      setLoading(true);

      const res = await loginCheckEmail({
        email,
      });

      if (res.data.status === "not_found") {
        setError("No account found.");
        setLoading(false);
        return;
      } else if (res.data.status === "unverified") {
        setTimeout(() => {
          navigate(`/verify-email${location.search}`, { state: { email } });
        }, 500);
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
      setSuccess(true);

      setTimeout(() => {
        const from = redirect || location.state?.from?.pathname || "/dashboard";
        navigate(from, { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || "Invalid credentials.");
      setLoading(false);
    }
  };

  const handleChangePassword = () => {
    const resetPath = email
      ? `/reset-password?email=${encodeURIComponent(email)}`
      : "/reset-password";
    navigate(resetPath);
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
        <div className="fep-auth-card">
          
<div className="fep-card-icon" style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}>
  <img 
    src={fepLogo} 
    alt="FEP Card Logo" 
    style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
  />
</div>

          <h2 className="fep-card-title">FEP Portal</h2>
          <p className="fep-card-subtitle">Academics & Career Council</p>

          {error && <div className="fep-error-msg">{error}</div>}

          <form className="fep-form" onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Institute Email Address"
              className="fep-input"
              value={email}
              onChange={(e) => setEmail(e.target.value.toLowerCase())}
              disabled={loading}
              required
            />
            
            <div className="fep-password-group">
              <input
                type="password"
                placeholder="Password"
                className="fep-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <div className="fep-forgot-link-container">
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={loading}
                  className="fep-forgot-link"
                >
                  Forgot password?
                </button>
              </div>
            </div>
            
            <button type="submit" disabled={!email || !password || loading} className="fep-btn-primary">
              {loading ? "Logging in..." : "Login"}
            </button>
            
            <div className="fep-signup-prompt">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => navigate('/signup')}
                disabled={loading}
                className="fep-signup-link"
              >
                Sign up
              </button>
            </div>
          </form>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Login;