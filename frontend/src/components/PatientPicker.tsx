import { useEffect, useState } from "react";
import { api } from "../api";
import type { Patient } from "../types";

interface Props {
  selected: Patient | null;
  onSelect: (patient: Patient | null) => void;
}

/**
 * Lets the front desk find an existing patient by name, or register a new
 * one inline, without leaving the booking form. Debounced so every
 * keystroke doesn't hit the API.
 */
export function PatientPicker({ selected, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      api.searchPatients(query.trim()).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, selected]);

  if (selected) {
    return (
      <div className="patient-picker patient-picker--selected">
        <span>
          <strong>{selected.name}</strong>
          {selected.phone ? ` · ${selected.phone}` : ""}
        </span>
        <button type="button" onClick={() => onSelect(null)}>
          Change
        </button>
      </div>
    );
  }

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const patient = await api.createPatient({ name: query.trim(), phone: newPhone.trim() || undefined });
      onSelect(patient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create patient.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="patient-picker">
      <input
        type="text"
        placeholder="Search patient by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="patient-picker__results">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onSelect(p)}>
                {p.name}
                {p.phone ? ` · ${p.phone}` : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim().length >= 2 && (
        <div className="patient-picker__new">
          <span>No match? Register new patient:</span>
          <input
            type="text"
            placeholder="Phone (optional)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
          />
          <button type="button" onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : `Add "${query.trim()}"`}
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
