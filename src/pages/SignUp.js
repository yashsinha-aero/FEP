import { useState } from "react";
import { signupUser } from "../services/api";
import { useNavigate } from "react-router-dom";

// CSS Imports
import "../styles/auth.css";
import "../styles/auth-animations.css";
import "../styles/loading-animations.css";

// Asset Imports (Verify these match your exact filenames)
import fepLogo from "../assets/fep-logo.png";
import Footer from "../components/Footer";

const STUDENT_EMAIL_DOMAIN = "iitk.ac.in";
const ALLOWED_INSTITUTE_DOMAIN_LABELS = [
  "edu",
  "ac",
  "int",
  "dk",
  "de",
  "ch",
  "se",
  "no",
  "fi",
  "nl",
  "be",
  "fr",
  "ca",
  "it",
  "es",
  "at",
];
const MBA_DEPARTMENT = "MBA";
const STUDENT_DEPARTMENTS = [
  "Aerospace Engineering",
  "Biological Sciences and Bioengineering",
  "Chemical Engineering",
  "Chemistry",
  "Civil Engineering",
  "Cognitive Science",
  "Computer Science and Engineering",
  "Design",
  "Earth Sciences",
  "Economics",
  "Electrical Engineering",
  "Humanities and Social Sciences",
  "Industrial Management and Engineering",
  "Intelligent Systems",
  "Materials Science & Engineering",
  "Mathematics and Statistics",
  "Mechanical Engineering",
  "Physics",
  "Space, Planetary & Astronomical Sciences & Engineering",
  "Statistics and Data Sciences",
  "Sustainable Energy Engineering",
];

const getEmailDomain = (email = "") => {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "";
  return parts[1];
};

const getSignupEmailError = (email, role) => {
  const normalizedEmail = email.trim().toLowerCase();

  // Backdoor check for test accounts
  const isBackdoorEmail = (() => {
    const parts = normalizedEmail.split("@");
    if (parts.length !== 2) return false;
    const localPart = parts[0].split("+")[0];
    const domainPart = parts[1];
    return localPart === "yash.sinha2006" && domainPart === "gmail.com";
  })();

  if (isBackdoorEmail) {
    return ""; // Bypass domain verification for testing
  }

  const domain = getEmailDomain(email);
  if (!email || !role) return "";
  if (role === "student") {
    return domain === STUDENT_EMAIL_DOMAIN
      ? ""
      : "Students can sign up only with @iitk.ac.in.";
  }
  if (role === "professor") {
    const parts = domain.split(".");
    const isEducational = parts.some((part) =>
      ALLOWED_INSTITUTE_DOMAIN_LABELS.includes(part)
    );
    return isEducational
      ? ""
      : "Professors can sign up only with an institutional email (e.g. .edu, .ac, .dk).";
  }
  return "";
};

const SignUp = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [step, setStep] = useState(1);
  const [touched, setTouched] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [apiErrors, setApiErrors] = useState({});

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "student",
    institute: "",
    roll: "",
    programme: "",
    department1: "",
    department2: "",
    interest: "",
    phone: "",
  });
  const [interestInput, setInterestInput] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const getInterestList = () =>
    form.interest
      .split(",")
      .map((interest) => interest.trim())
      .filter(Boolean);

  const getMergedInterests = (value) => {
    const existingInterests = getInterestList();
    const normalizedExisting = new Set(
      existingInterests.map((interest) => interest.toLowerCase())
    );
    const newInterests = value
      .split(",")
      .map((interest) => interest.trim())
      .filter(Boolean)
      .filter((interest) => {
        const normalizedInterest = interest.toLowerCase();
        if (normalizedExisting.has(normalizedInterest)) return false;
        normalizedExisting.add(normalizedInterest);
        return true;
      });
    return [...existingInterests, ...newInterests];
  };

  const setInterestList = (interests) => {
    setForm({ ...form, interest: interests.join(", ") });
  };

  const addInterests = (value) => {
    const mergedInterests = getMergedInterests(value);
    if (mergedInterests.length === getInterestList().length) {
      if (value.trim()) setInterestInput("");
      return;
    }
    setInterestList(mergedInterests);
    setInterestInput("");
  };

  const removeInterest = (interestToRemove) => {
    setInterestList(
      getInterestList().filter((interest) => interest !== interestToRemove)
    );
  };

  const handleInterestKeyDown = (e) => {
    if (e.key !== "Enter" && e.key !== ",") return;
    e.preventDefault();
    addInterests(interestInput);
  };

  const handleRoleToggle = (newRole) => {
    setForm({
      ...form,
      role: newRole,
      programme: "",
      department1: "",
      department2: "",
      institute: "",
      roll: "",
      interest: "",
      email: "",
    });
    setInterestInput("");
    setTouched({});
    setIsSubmitted(false);
    setApiErrors({});
    setStep(1);
  };

  const handleProgrammeChange = (e) => {
    const programme = e.target.value;
    setForm({
      ...form,
      programme,
      department1: programme === "MBA" ? MBA_DEPARTMENT : "",
      department2:
        programme === "Dual Degree" || form.department2 !== MBA_DEPARTMENT
          ? form.department2
          : "",
    });
  };

  const isStudent = form.role === "student";
  const isProfessor = form.role === "professor";
  const emailError = getSignupEmailError(form.email, form.role);
  const interests = getInterestList();
  const department2Options =
    form.programme === "Dual Degree"
      ? [...STUDENT_DEPARTMENTS, MBA_DEPARTMENT]
      : STUDENT_DEPARTMENTS;

  const getErrors = () => {
    const currentErrors = {};

    // Full Name
    if (!form.fullName || !form.fullName.trim()) {
      currentErrors.fullName = "Full name is required";
    } else if (!/^[A-Za-z\s]+$/.test(form.fullName)) {
      currentErrors.fullName = "Full name can only contain letters and spaces";
    }

    // Email
    if (!form.email || !form.email.trim()) {
      currentErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      currentErrors.email = "Invalid email address format";
    } else if (emailError) {
      currentErrors.email = emailError;
    } else if (apiErrors.email) {
      currentErrors.email = apiErrors.email;
    }

    // Password
    if (!form.password) {
      currentErrors.password = "Password is required";
    } else if (form.password.length < 8) {
      currentErrors.password = "Password must be at least 8 characters long";
    }

    // Confirm Password
    if (!form.confirmPassword) {
      currentErrors.confirmPassword = "Confirm password is required";
    } else if (form.password !== form.confirmPassword) {
      currentErrors.confirmPassword = "Passwords do not match";
    }

    // Role-specific fields
    if (isStudent) {
      if (!form.roll) {
        currentErrors.roll = "Roll number is required";
      } else if (!/^\d+$/.test(form.roll)) {
        currentErrors.roll = "Roll number must contain only numbers";
      }
      if (!form.programme) {
        currentErrors.programme = "Please select a programme";
      }
      if (!form.department1) {
        currentErrors.department1 = "Please select a department";
      }
    } else if (isProfessor) {
      if (!form.institute || !form.institute.trim()) {
        currentErrors.institute = "Institute name is required";
      }
      if (!form.department1 || !form.department1.trim()) {
        currentErrors.department1 = "Department is required";
      }
      if (interests.length === 0) {
        currentErrors.interest = "Please add at least one research interest";
      }
    }


    return currentErrors;
  };

  const errors = getErrors();

  const shouldShowError = (fieldName) => {
    return (touched[fieldName] || isSubmitted) && !!errors[fieldName];
  };

  const handleBlur = (fieldName) => {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
  };

  const validateStep1 = () => {
    const step1Touched = { fullName: true, email: true, password: true, confirmPassword: true };
    setTouched((prev) => ({ ...prev, ...step1Touched }));

    const allErrors = getErrors();
    const step1Errors = {};
    if (allErrors.fullName) step1Errors.fullName = allErrors.fullName;
    if (allErrors.email) step1Errors.email = allErrors.email;
    if (allErrors.password) step1Errors.password = allErrors.password;
    if (allErrors.confirmPassword) step1Errors.confirmPassword = allErrors.confirmPassword;

    if (Object.keys(step1Errors).length > 0) {
      const formOrder = ["fullName", "email", "password", "confirmPassword"];
      const firstErrorKey = formOrder.find((key) => step1Errors[key]);
      if (firstErrorKey) {
        const element = document.getElementsByName(firstErrorKey)[0];
        if (element) element.focus();
      }
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const step2Fields = isStudent
      ? ["roll", "programme", "department1"]
      : ["institute", "department1", "interest"];
    const step2Touched = {};
    step2Fields.forEach((field) => {
      step2Touched[field] = true;
    });
    setTouched((prev) => ({ ...prev, ...step2Touched }));

    const allErrors = getErrors();
    const step2Errors = {};
    step2Fields.forEach((field) => {
      if (allErrors[field]) step2Errors[field] = allErrors[field];
    });

    if (Object.keys(step2Errors).length > 0) {
      const formOrder = isStudent
        ? ["roll", "programme", "department1"]
        : ["institute", "department1", "interest"];
      const firstErrorKey = formOrder.find((key) => step2Errors[key]);
      if (firstErrorKey) {
        let element = document.getElementsByName(firstErrorKey)[0];
        if (firstErrorKey === "interest") {
          element = document.getElementsByName("interestInput")[0];
        }
        if (element) element.focus();
      }
      return false;
    }
    return true;
  };

  const handleStepClick = (targetStep) => {
    if (targetStep === 1) {
      setStep(1);
    } else if (targetStep === 2) {
      if (validateStep1()) {
        setStep(2);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!validateStep2()) {
      setStep(2);
      return;
    }

    setIsSubmitted(true);

    const submissionForm = {
      ...form,
      interest: isProfessor
        ? getMergedInterests(interestInput).join(", ")
        : form.interest,
    };

    try {
      setLoading(true);
      setForm(submissionForm);
      setInterestInput("");
      await signupUser(submissionForm);

      setSuccess(true);

      setTimeout(() => {
        navigate("/verify-email", {
          state: {
            email: form.email,
            signupData: submissionForm,
          },
        });
      }, 2000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || "Signup failed";
      if (errorMsg.toLowerCase().includes("already in use")) {
        setApiErrors({ email: errorMsg });
        setStep(1);
        setTimeout(() => {
          const element = document.getElementsByName("email")[0];
          if (element) element.focus();
        }, 50);
      } else {
        alert(errorMsg);
      }
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
            <img
              src={fepLogo}
              alt="FEP Logo"
            />
          </div>
          <span className="fep-header-title">Foreign Exposure Programme</span>
        </div>
        <div className="fep-header-right">IIT Kanpur</div>
      </header>

      {/* Main Content Area */}
      <main className="fep-main">
        {loading && (
          <div className={`loading-overlay ${success ? "success" : ""} absolute inset-0 z-50 flex items-center justify-center bg-[#0D203A]/60 backdrop-blur-sm rounded-2xl`}>
            <div className="loading-content">
              {!success ? (
                <>
                  <div className="spinner"></div>
                  <p className="loading-text text-white mt-4 font-semibold">Creating your account...</p>
                </>
              ) : (
                <>
                  <div className="success-checkmark">
                    <svg className="checkmark" viewBox="0 0 52 52">
                      <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
                      <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
                    </svg>
                  </div>
                  <p className="success-text text-white mt-4 font-semibold">Account Created!</p>
                  <p className="redirect-text text-white/70 text-sm mt-1">Redirecting to verification...</p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="fep-auth-card">
          <h2 className="fep-card-title mt-2">Create Account</h2>
          <p className="fep-card-subtitle mt-1 mb-4">Join the FEP Portal</p>

          {/* Stepper Header */}
          <div className="fep-stepper">
            <div className={`fep-step-node ${step === 1 ? "active" : ""}`} onClick={() => handleStepClick(1)}>
              <div className="fep-step-number">1</div>
              <span className="fep-step-label">Account</span>
            </div>
            <div className={`fep-step-line ${step > 1 ? "active" : ""}`} />
            <div className={`fep-step-node ${step === 2 ? "active" : ""}`} onClick={() => handleStepClick(2)}>
              <div className="fep-step-number">2</div>
              <span className="fep-step-label">Details</span>
            </div>
          </div>

          <form className="fep-form" onSubmit={handleSubmit}>

            {/* Scrollable Form Container */}
            <div className="fep-scrollable-form">
              
              {/* STEP 1: Account setup */}
              {step === 1 && (
                <div className="step-fade-in flex flex-col gap-3">
                  {/* Modern Role Toggle */}
                  <div className="fep-role-toggle">
                    <button
                      type="button"
                      className={`fep-role-btn ${isStudent ? "active" : ""}`}
                      onClick={() => handleRoleToggle("student")}
                      disabled={loading}
                    >
                      Student
                    </button>
                    <button
                      type="button"
                      className={`fep-role-btn ${isProfessor ? "active" : ""}`}
                      onClick={() => handleRoleToggle("professor")}
                      disabled={loading}
                    >
                      Professor
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 w-full text-left">
                    <input
                      name="fullName"
                      placeholder="Full Name"
                      className={`fep-input ${shouldShowError("fullName") ? "fep-input-error" : ""}`}
                      value={form.fullName}
                      onChange={(e) => {
                        const value = e.target.value.replace(/^\s+/, "").replace(/\s{2,}/g, " ");
                        setForm({ ...form, fullName: value.toUpperCase() });
                      }}
                      onBlur={(e) => {
                        setForm({ ...form, fullName: e.target.value.trim().toUpperCase() });
                        handleBlur("fullName");
                      }}
                      disabled={loading}
                    />
                    {shouldShowError("fullName") && (
                      <span className="fep-field-error-text">{errors.fullName}</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 w-full text-left">
                    <input
                      type="email"
                      name="email"
                      placeholder={isStudent ? "Institute Email (@iitk.ac.in)" : "Institute Email Address"}
                      className={`fep-input ${shouldShowError("email") ? "fep-input-error" : ""}`}
                      onChange={(e) => {
                        setForm({ ...form, email: e.target.value.toLowerCase() });
                        setApiErrors((prev) => ({ ...prev, email: null }));
                      }}
                      onBlur={() => handleBlur("email")}
                      disabled={loading}
                    />
                    {shouldShowError("email") && (
                      <span className="fep-field-error-text">{errors.email}</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 w-full text-left">
                    <input
                      type="password"
                      name="password"
                      placeholder="Password (Min 8 characters)"
                      className={`fep-input ${shouldShowError("password") ? "fep-input-error" : ""}`}
                      value={form.password}
                      onChange={handleChange}
                      onBlur={() => handleBlur("password")}
                      disabled={loading}
                    />
                    {shouldShowError("password") && (
                      <span className="fep-field-error-text">{errors.password}</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 w-full text-left">
                    <input
                      type="password"
                      name="confirmPassword"
                      placeholder="Confirm Password"
                      className={`fep-input ${shouldShowError("confirmPassword") ? "fep-input-error" : ""}`}
                      value={form.confirmPassword}
                      onChange={handleChange}
                      onBlur={() => handleBlur("confirmPassword")}
                      disabled={loading}
                    />
                    {shouldShowError("confirmPassword") && (
                      <span className="fep-field-error-text">{errors.confirmPassword}</span>
                    )}
                    {!errors.confirmPassword && form.confirmPassword && form.password === form.confirmPassword && (
                      <p className="text-green-600 text-[11px] font-semibold mt-1">Passwords match ✓</p>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: Profile Details */}
              {step === 2 && (
                <div className="step-fade-in flex flex-col gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    {isStudent ? "Student Profile Details" : "Professor Profile Details"}
                  </h3>
                  
                  {isStudent && (
                    <>
                      <div className="flex flex-col gap-1 w-full text-left">
                        <input
                          name="roll"
                          placeholder="Roll Number"
                          className={`fep-input ${shouldShowError("roll") ? "fep-input-error" : ""}`}
                          value={form.roll}
                          onChange={handleChange}
                          onBlur={() => handleBlur("roll")}
                          type="number"
                          disabled={loading}
                        />
                        {shouldShowError("roll") && (
                          <span className="fep-field-error-text">{errors.roll}</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 w-full text-left">
                        <select
                          name="programme"
                          className={`fep-input ${shouldShowError("programme") ? "fep-input-error" : ""}`}
                          value={form.programme}
                          onChange={(e) => {
                            handleProgrammeChange(e);
                            handleBlur("programme");
                          }}
                          onBlur={() => handleBlur("programme")}
                          disabled={loading}
                        >
                          <option value="">Select Programme</option>
                          <option value="BTech">BTech</option>
                          <option value="BS">BS</option>
                          <option value="BCyber">BCyber</option>
                          <option value="MTech">MTech</option>
                          <option value="MS">MS</option>
                          <option value="PhD">PhD</option>
                          <option value="MBA">MBA</option>
                          <option value="Dual Degree">Dual Degree</option>
                        </select>
                        {shouldShowError("programme") && (
                          <span className="fep-field-error-text">{errors.programme}</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 w-full text-left">
                        <select
                          name="department1"
                          className={`fep-input ${shouldShowError("department1") ? "fep-input-error" : ""}`}
                          value={form.department1}
                          onChange={(e) => {
                            handleChange(e);
                            handleBlur("department1");
                          }}
                          onBlur={() => handleBlur("department1")}
                          disabled={loading || form.programme === "MBA"}
                        >
                          <option value="">Select Department</option>
                          {form.programme === "MBA" ? (
                            <option value={MBA_DEPARTMENT}>{MBA_DEPARTMENT}</option>
                          ) : (
                            STUDENT_DEPARTMENTS.map((department) => (
                              <option key={department} value={department}>{department}</option>
                            ))
                          )}
                        </select>
                        {shouldShowError("department1") && (
                          <span className="fep-field-error-text">{errors.department1}</span>
                        )}
                      </div>

                      <select name="department2" className="fep-input" value={form.department2} onChange={handleChange} disabled={loading}>
                        <option value="">Select Department 2 (Optional)</option>
                        {department2Options.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                    </>
                  )}

                  {isProfessor && (
                    <>
                      <div className="flex flex-col gap-1 w-full text-left">
                        <input
                          name="institute"
                          placeholder="Institute Name"
                          className={`fep-input ${shouldShowError("institute") ? "fep-input-error" : ""}`}
                          value={form.institute}
                          onChange={handleChange}
                          onBlur={() => handleBlur("institute")}
                          disabled={loading}
                        />
                        {shouldShowError("institute") && (
                          <span className="fep-field-error-text">{errors.institute}</span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 w-full text-left">
                        <input
                          name="department1"
                          placeholder="Department"
                          className={`fep-input ${shouldShowError("department1") ? "fep-input-error" : ""}`}
                          value={form.department1}
                          onChange={(e) => {
                            const value = e.target.value.replace(/^\s+/, "").replace(/\s{2,}/g, " ");
                            setForm({ ...form, department1: value.toUpperCase() });
                          }}
                          onBlur={(e) => {
                            setForm({ ...form, department1: e.target.value.trim().toUpperCase() });
                            handleBlur("department1");
                          }}
                          disabled={loading}
                        />
                        {shouldShowError("department1") && (
                          <span className="fep-field-error-text">{errors.department1}</span>
                        )}
                      </div>

                      {/* Dynamic Chips for Professor Interests */}
                      <div className="flex flex-col gap-1 w-full text-left">
                        {interests.length > 0 && (
                          <div className="fep-chip-list mb-2">
                            {interests.map((interest) => (
                              <span className="fep-chip" key={interest}>
                                {interest}
                                <button type="button" className="fep-chip-remove" onClick={() => removeInterest(interest)} disabled={loading}>&times;</button>
                              </span>
                            ))}
                          </div>
                        )}
                        <input
                          name="interestInput"
                          placeholder="Research Interest (Press Enter)"
                          className={`fep-input ${shouldShowError("interest") ? "fep-input-error" : ""}`}
                          value={interestInput}
                          onChange={(e) => setInterestInput(e.target.value)}
                          onKeyDown={handleInterestKeyDown}
                          onBlur={() => {
                            addInterests(interestInput);
                            handleBlur("interest");
                          }}
                          disabled={loading}
                        />
                        {shouldShowError("interest") && (
                          <span className="fep-field-error-text">{errors.interest}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>

            {/* Stepper Navigation Buttons */}
            <div className="fep-step-actions">
              {step > 1 && (
                <button type="button" onClick={() => setStep((prev) => prev - 1)} disabled={loading} className="fep-btn-secondary">
                  Back
                </button>
              )}
              
              {step < 2 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1 && validateStep1()) {
                      setStep(2);
                    }
                  }}
                  disabled={loading}
                  className="fep-btn-primary"
                >
                  Next
                </button>
              ) : (
                <button type="submit" disabled={loading} className="fep-btn-primary">
                  {loading ? "Processing..." : "Sign Up"}
                </button>
              )}
            </div>

            <div className="fep-signup-prompt mt-2">
              Already have an account?{" "}
              <button type="button" onClick={() => navigate('/login')} disabled={loading} className="fep-signup-link">
                Log in
              </button>
            </div>
          </form>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SignUp;