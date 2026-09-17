import { useEffect, useState } from "react";
import { api } from "../api";
import type { Appointment, Doctor } from "../types";
import { AppointmentRow } from "./AppointmentRow";

// BR3: front desk views one doctor's full day, sorted by time.
export function DoctorDayView() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState("");
  // Starts empty, not the browser's real today -- if the server's virtual
  // clock (see the Clock tab) has been moved elsewhere, defaulting to the
  // browser's actual date would silently show the wrong day. Set once the
  // server tells us what day it currently is.
  const [date, setDate] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listDoctors().then((list) => {
      setDoctors(list);
      if (list.length > 0) setDoctorId((current) => current || list[0].id);
    });
    api.getClock().then((c) => setDate((current) => current || c.now.slice(0, 10)));
  }, []);

  useEffect(() => {
    if (!doctorId || !date) return;
    setLoading(true);
    setError(null);
    api
      .getDoctorDay(doctorId, date)
      .then(setAppointments)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load day."))
      .finally(() => setLoading(false));
  }, [doctorId, date]);

  function handleUpdated(updated: Appointment) {
    // A reschedule can move an appointment off this day entirely -- drop it
    // from view rather than show it under the wrong date.
    const stillToday = updated.startsAt.slice(0, 10) === date;
    setAppointments((prev) =>
      stillToday
        ? prev.map((a) => (a.id === updated.id ? updated : a))
        : prev.filter((a) => a.id !== updated.id)
    );
  }

  return (
    <div className="panel">
      <h2>Doctor's day</h2>
      <div className="filters">
        <label>
          Doctor
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && appointments.length === 0 && <p>No appointments that day.</p>}

      <ul className="appointment-list">
        {appointments.map((a) => (
          <AppointmentRow key={a.id} appointment={a} onUpdated={handleUpdated} />
        ))}
      </ul>
    </div>
  );
}
