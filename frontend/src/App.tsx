import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CalendarPlus, Search } from "lucide-react";
import { useState } from "react";
import { AuroraBackground } from "./components/AuroraBackground";
import { BookingForm } from "./components/BookingForm";
import { DoctorDayView } from "./components/DoctorDayView";
import { GradientText } from "./components/GradientText";
import { PatientSearchView } from "./components/PatientSearchView";

const TABS = [
  { id: "book", label: "Book", icon: CalendarPlus, render: () => <BookingForm /> },
  { id: "day", label: "Doctor's Day", icon: CalendarDays, render: () => <DoctorDayView /> },
  { id: "find", label: "Find Patient", icon: Search, render: () => <PatientSearchView /> },
] as const;

function App() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("book");
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="app-shell">
      <AuroraBackground />

      <div className="app">
        <header className="app__header">
          <span className="app__eyebrow">Front Desk</span>
          <h1>
            <GradientText>Clinic Appointments</GradientText>
          </h1>
          <p className="app__subtitle">
            Conflict-free booking, fair cancellations, fast lookups.
          </p>
        </header>

        <nav className="app__tabs" role="tablist">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                className={isActive ? "active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-pill"
                    className="app__tab-pill"
                    transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
                  />
                )}
                <Icon size={16} strokeWidth={2.25} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="app__content">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {active.render()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default App;
