import { useEffect, useState } from "react";
import { api } from "../api";
import type { Doctor, Patient } from "../types";
import { PatientPicker } from "./PatientPicker";

/**
 * BR1: the backend is the source of truth for "no overlap" -- this form
 * just submits and surfaces whatever the API says (including a 409
 * conflict) rather than trying to duplicate the overlap check client-side.
 */
export function BookingForm() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.listDoctors().then(setDoctors).catch(() => setDoctors([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!doctorId || !patient || !date || !startTime || !endTime) {
      setMessage({ kind: "error", text: "Fill in doctor, patient, date, and both times." });
      return;
    }

    setSubmitting(true);
    try {
      await api.bookAppointment({
        doctorId,
        patientId: patient.id,
        startsAt: new Date(`${date}T${startTime}`).toISOString(),
        endsAt: new Date(`${date}T${endTime}`).toISOString(),
      });
      setMessage({ kind: "success", text: "Appointment booked." });
      setPatient(null);
      setStartTime("");
      setEndTime("");
    } catch (err) {
      // A 409 from the overlap constraint lands here with a clear message
      // from errorHandler.ts on the backend, e.g. "already has an
      // overlapping appointment" -- shown as-is, not swallowed.
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Booking failed." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel">
      <h2>Book an appointment</h2>

      <label>
        Doctor
        <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">Select a doctor...</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.specialty ? ` (${d.specialty})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label>
        Patient
        <PatientPicker selected={patient} onSelect={setPatient} />
      </label>

      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <div className="time-row">
        <label>
          Start
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label>
          End
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
      </div>

      <button type="submit" disabled={submitting}>
        {submitting ? "Booking..." : "Book appointment"}
      </button>

      {message && <p className={message.kind === "error" ? "error-text" : "success-text"}>{message.text}</p>}
    </form>
  );
}
