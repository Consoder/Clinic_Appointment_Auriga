import { useState } from "react";
import { api } from "../api";
import type { Appointment } from "../types";
import { AppointmentRow } from "./AppointmentRow";

// BR4: find a patient's appointment(s) by name across all doctors.
export function PatientSearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Appointment[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const appointments = await api.findByPatientName(query.trim());
      setResults(appointments);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleCancelled(updated: Appointment) {
    setResults((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  return (
    <div className="panel">
      <h2>Find patient's appointment</h2>
      <form onSubmit={handleSearch} className="search-row">
        <input
          type="text"
          placeholder="Patient name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}
      {searched && !loading && results.length === 0 && <p>No matching appointments.</p>}

      <ul className="appointment-list">
        {results.map((a) => (
          <AppointmentRow key={a.id} appointment={a} showDoctor onCancelled={handleCancelled} />
        ))}
      </ul>
    </div>
  );
}
