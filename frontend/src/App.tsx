import { useState } from "react";
import { BookingForm } from "./components/BookingForm";
import { DoctorDayView } from "./components/DoctorDayView";
import { PatientSearchView } from "./components/PatientSearchView";

const TABS = [
  { id: "book", label: "Book", render: () => <BookingForm /> },
  { id: "day", label: "Doctor's Day", render: () => <DoctorDayView /> },
  { id: "find", label: "Find Patient", render: () => <PatientSearchView /> },
] as const;

function App() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("book");
  const active = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Clinic Front Desk</h1>
      </header>

      <nav className="app__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={tab.id === activeTab ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="app__content">{active.render()}</main>
    </div>
  );
}

export default App;
