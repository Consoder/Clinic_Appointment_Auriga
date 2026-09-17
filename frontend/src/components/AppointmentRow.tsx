import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { api } from "../api";
import type { Appointment } from "../types";

interface Props {
  appointment: Appointment;
  showDoctor?: boolean;
  onUpdated?: (updated: Appointment) => void;
}

const STATUS_LABEL: Record<Appointment["status"], string> = {
  BOOKED: "Booked",
  CANCELLED_FREE: "Cancelled (free)",
  CANCELLED_LATE: "Cancelled (fee charged)",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}
function toTimeInput(iso: string) {
  return new Date(iso).toTimeString().slice(0, 5);
}

export function AppointmentRow({ appointment, showDoctor, onUpdated }: Props) {
  const [busy, setBusy] = useState<"cancel" | "complete" | "reschedule" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(toDateInput(appointment.startsAt));
  const [startTime, setStartTime] = useState(toTimeInput(appointment.startsAt));
  const [endTime, setEndTime] = useState(toTimeInput(appointment.endsAt));

  async function handleCancel() {
    setError(null);
    setBusy("cancel");
    try {
      onUpdated?.(await api.cancelAppointment(appointment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleComplete() {
    setError(null);
    setBusy("complete");
    try {
      onUpdated?.(await api.completeAppointment(appointment.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark completed.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("reschedule");
    try {
      const updated = await api.rescheduleAppointment(appointment.id, {
        startsAt: new Date(`${date}T${startTime}`).toISOString(),
        endsAt: new Date(`${date}T${endTime}`).toISOString(),
      });
      onUpdated?.(updated);
      setRescheduling(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reschedule failed.");
    } finally {
      setBusy(null);
    }
  }

  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  const isBooked = appointment.status === "BOOKED";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`appointment-row appointment-row--${appointment.status.toLowerCase()}`}
    >
      <div className="appointment-row__main">
        <div className="appointment-row__time">
          {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
          {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="appointment-row__details">
          <strong>{appointment.patient?.name ?? "Unknown patient"}</strong>
          {showDoctor && appointment.doctor ? ` · ${appointment.doctor.name}` : ""}
          <span className={`appointment-row__status appointment-row__status--${appointment.status.toLowerCase()}`}>
            {STATUS_LABEL[appointment.status]}
          </span>
        </div>
        {isBooked && (
          <div className="appointment-row__actions">
            <button type="button" className="ghost" onClick={() => setRescheduling((v) => !v)} disabled={busy !== null}>
              Reschedule
            </button>
            <button type="button" className="ghost" onClick={handleComplete} disabled={busy !== null}>
              {busy === "complete" ? "..." : "Complete"}
            </button>
            <button type="button" className="danger" onClick={handleCancel} disabled={busy !== null}>
              {busy === "cancel" ? "..." : "Cancel"}
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {rescheduling && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleReschedule}
            className="appointment-row__reschedule"
          >
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <button type="submit" disabled={busy !== null}>
              {busy === "reschedule" ? "Saving..." : "Confirm"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {error && <p className="error-text">{error}</p>}
    </motion.li>
  );
}
