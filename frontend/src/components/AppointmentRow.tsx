import { useState } from "react";
import { api } from "../api";
import type { Appointment } from "../types";

interface Props {
  appointment: Appointment;
  showDoctor?: boolean;
  onCancelled?: (updated: Appointment) => void;
}

const STATUS_LABEL: Record<Appointment["status"], string> = {
  BOOKED: "Booked",
  CANCELLED_FREE: "Cancelled (free)",
  CANCELLED_LATE: "Cancelled (fee charged)",
};

export function AppointmentRow({ appointment, showDoctor, onCancelled }: Props) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setError(null);
    setCancelling(true);
    try {
      const updated = await api.cancelAppointment(appointment.id);
      onCancelled?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed.");
    } finally {
      setCancelling(false);
    }
  }

  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);

  return (
    <li className={`appointment-row appointment-row--${appointment.status.toLowerCase()}`}>
      <div className="appointment-row__time">
        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
        {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="appointment-row__details">
        <strong>{appointment.patient?.name ?? "Unknown patient"}</strong>
        {showDoctor && appointment.doctor ? ` · ${appointment.doctor.name}` : ""}
        <span className="appointment-row__status">{STATUS_LABEL[appointment.status]}</span>
      </div>
      {appointment.status === "BOOKED" && (
        <button type="button" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? "Cancelling..." : "Cancel"}
        </button>
      )}
      {error && <p className="error-text">{error}</p>}
    </li>
  );
}
