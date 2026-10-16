import { Link, useLocation } from "react-router-dom";
import "../styles/layout.css";
import logo from "../assets/logo.jpg";

const Navbar = () => {
  const location = useLocation();

  const isLoginPage = location.pathname === "/login";
  const isSignUpPage = location.pathname === "/signup";
  const isAuthActionPage = location.pathname === "/auth-action";
  const isPasswordResetPage = location.pathname === "/reset-password";

  return (
    <nav className="app-nav navbar">
      <Link to="/signup" className="app-nav-brand logo-link">
        <img src={logo} alt="FEP IIT Kanpur" className="navbar-logo" />
        <span className="app-nav-brand-text">
          FEP<span>·</span>IITK
        </span>
      </Link>

      <div className="app-nav-links auth-nav-tagline">
        <span>Foreign Exposure Programme</span>
      </div>

      <div className="app-nav-actions navbar-right">
        {isSignUpPage && (
          <Link to="/login" className="nav-button nav-button-primary">
            Log In
          </Link>
        )}

        {isLoginPage && (
          <Link to="/signup" className="nav-button nav-button-primary">
            Sign Up
          </Link>
        )}

        {(isAuthActionPage || isPasswordResetPage) && (
          <Link to="/login" className="nav-button nav-button-primary">
            Log In
          </Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
