import AppSidebar from "./AppSidebar";
import AppTopbar from "./AppTopbar";
import Footer from "./Footer";
import { useState } from "react";

const AppShell = ({
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  showSearch = true,
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="app-shell-layout">
      <div className="app-shell">
        <AppSidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <div className="app-shell-main">
          <AppTopbar
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            showSearch={showSearch}
            onMobileMenuOpen={() => setMobileNavOpen(true)}
          />
          <main className="app-shell-content">{children}</main>
        </div>
      </div>
      <Footer theme="light" fullWidth={true} />
    </div>
  );
};

export default AppShell;