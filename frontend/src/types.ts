export interface Doctor {
  id: string;
  name: string;
  specialty: string | null;
}

export interface Patient {
  id: string;
  name: string;
  phone: string | null;
}

export type AppointmentStatus =
  | "BOOKED"
  | "CANCELLED_FREE"
  | "CANCELLED_LATE"
  | "COMPLETED"
  | "NO_SHOW";

export interface Appointment {
  id: string;
  doctorId: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  cancelledAt: string | null;
  feeCharged: boolean;
  doctor?: Doctor;
  patient?: Patient;
}

export interface ApiError {
  error: string;
}

export interface OutboxNotification {
  id: string;
  type: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorName: string;
  appointmentStartsAt: string;
  message: string;
  sentAt: string;
}

export interface ClockState {
  now: string;
  noShowCount?: number;
  reminderCount?: number;
}

export interface TodaysAppointment extends Appointment {
  reminderSent: boolean;
}
