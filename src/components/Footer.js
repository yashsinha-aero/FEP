import React from "react";
import logoOld from "../assets/logo.jpg";
import logoNew from "../assets/logo_new.jpeg";
import "../styles/layout.css";

const Footer = ({ theme = "dark", fullWidth = false }) => {
  const isLight = theme === "light";
  
  return (
    <footer id="contact" className={`border-t relative z-20 w-full mt-auto ${isLight ? "border-slate-200 bg-white text-slate-600" : "border-white/10 bg-[#0f172a]/80 backdrop-blur-xl text-blue-100"}`}>
      <div className={`py-4 md:py-6 flex flex-row flex-wrap justify-between items-start md:items-center text-sm gap-4 md:gap-6 w-full ${fullWidth ? "max-w-none px-4 md:px-8" : "max-w-7xl mx-auto px-4 md:px-6"}`}>
        
        {/* Left Section: Logos + FEP Branding */}
        <div className="flex flex-col items-start max-w-md w-full md:w-auto">
          <div className="flex items-center gap-2 md:gap-3 mb-2 justify-start">
            <img src={logoNew} alt="FEP Logo Academic" className="h-8 md:h-9 bg-white rounded-xl p-1 object-contain transition-transform hover:scale-105" />
            <img src={logoOld} alt="FEP Logo Globe" className="h-8 md:h-9 bg-white rounded-xl p-1 object-contain transition-transform hover:scale-105" />
            <p className={`font-extrabold text-sm md:text-base tracking-wide ${isLight ? "text-slate-800" : "text-white"}`}>Foreign Exposure Programme</p>
          </div>
          
          <div className={`leading-relaxed font-medium text-left flex flex-col gap-0.5 text-xs md:text-sm ${isLight ? "text-slate-500 opacity-90" : "text-blue-100 opacity-80"}`}>
            <span>International Relations Wing</span>
            <span>Academics and Career Council</span>
            <span>IIT Kanpur</span>
          </div>

          <div className={`text-[10px] md:text-xs mt-2 text-left flex flex-row flex-wrap gap-x-3 gap-y-1 font-medium ${isLight ? "text-slate-500" : "text-slate-300 opacity-70"}`}>
            <span>
              Contact:{" "}
              <a href="mailto:fep@iitk.ac.in" className={`transition-colors ${isLight ? "text-slate-700 hover:text-cyan-600" : "text-white hover:text-cyan-300"}`}>
                fep@iitk.ac.in
              </a>
            </span>
          </div>
        </div>

        {/* Right Section: Contact Us & Socials */}
        <div className="flex flex-col items-start md:items-end text-left md:text-right w-full md:w-auto">
          <p className={`font-extrabold mb-1 md:mb-2 text-xs md:text-base ${isLight ? "text-slate-800" : "text-white"}`}>Contact Us</p>
          
          <a
            href="mailto:fep@iitk.ac.in"
            className={`transition-colors block mb-1 md:mb-1.5 font-medium flex items-center gap-2 justify-start md:justify-end group text-xs md:text-sm ${isLight ? "text-slate-700 hover:text-cyan-600" : "text-blue-100 hover:text-cyan-300"}`}
          >
            <div className={`p-1 rounded-md transition-colors ${isLight ? "bg-slate-100 group-hover:bg-cyan-50" : "bg-white/5 group-hover:bg-cyan-500/20"}`}>
              <svg className={`w-3 h-3 md:w-3.5 md:h-3.5 ${isLight ? "text-slate-500 group-hover:text-cyan-600" : "text-cyan-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            fep@iitk.ac.in
          </a>
          
          <div className="font-medium flex items-center gap-2 justify-start md:justify-end text-slate-500 mb-2 md:mb-3 text-xs md:text-sm">
            <div className={`p-1 rounded-md ${isLight ? "bg-slate-100" : "bg-white/5"}`}>
              <svg className={`w-3 h-3 md:w-3.5 md:h-3.5 ${isLight ? "text-slate-500" : "text-purple-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
              </svg>
            </div>
            IIT Kanpur, Uttar Pradesh, India
          </div>

          <div className="flex items-center gap-3 justify-start md:justify-end">
            <a
              href="https://www.instagram.com/iitkinternationalrelations/"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-1 md:p-1.5 rounded-md transition-all transform hover:-translate-y-0.5 ${isLight ? "bg-slate-100 hover:bg-cyan-50 text-slate-600 hover:text-cyan-600" : "bg-white/5 hover:bg-cyan-500/20 text-cyan-400 hover:text-white"}`}
              aria-label="Instagram"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/company/international-relations-wing-iitk/?originalSubdomain=in"
              target="_blank"
              rel="noopener noreferrer"
              className={`p-1 md:p-1.5 rounded-md transition-all transform hover:-translate-y-0.5 ${isLight ? "bg-slate-100 hover:bg-cyan-50 text-slate-600 hover:text-cyan-600" : "bg-white/5 hover:bg-cyan-500/20 text-cyan-400 hover:text-white"}`}
              aria-label="LinkedIn"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                <rect x="2" y="9" width="4" height="12"></rect>
                <circle cx="4" cy="4" r="2"></circle>
              </svg>
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;