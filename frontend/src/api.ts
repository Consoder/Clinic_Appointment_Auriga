import type {
  Appointment,
  ApiError,
  ClockState,
  Doctor,
  OutboxNotification,
  Patient,
  TodaysAppointment,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    // Surface the backend's error message (e.g. "overlapping appointment")
    // instead of a generic "request failed", so the front desk sees why.
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listDoctors: () => request<Doctor[]>("/doctors"),

  getDoctorDay: (doctorId: string, date: string) =>
    request<Appointment[]>(`/doctors/${doctorId}/day?date=${date}`),

  findByPatientName: (name: string) =>
    request<Appointment[]>(`/patients/search?name=${encodeURIComponent(name)}`),

  searchPatients: (name: string) =>
    request<Patient[]>(`/patients?name=${encodeURIComponent(name)}`),

  createPatient: (data: { name: string; phone?: string }) =>
    request<Patient>("/patients", { method: "POST", body: JSON.stringify(data) }),

  bookAppointment: (data: {
    doctorId: string;
    patientId: string;
    startsAt: string;
    endsAt: string;
  }) => request<Appointment>("/appointments", { method: "POST", body: JSON.stringify(data) }),

  cancelAppointment: (id: string) =>
    request<Appointment>(`/appointments/${id}/cancel`, { method: "POST" }),

  rescheduleAppointment: (id: string, data: { startsAt: string; endsAt: string }) =>
    request<Appointment>(`/appointments/${id}/reschedule`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  completeAppointment: (id: string) =>
    request<Appointment>(`/appointments/${id}/complete`, { method: "POST" }),

  getClock: () => request<ClockState>("/clock"),

  setClock: (now: string) =>
    request<ClockState>("/clock", { method: "POST", body: JSON.stringify({ now }) }),

  advanceClock: (advanceMinutes: number) =>
    request<ClockState>("/clock", { method: "POST", body: JSON.stringify({ advanceMinutes }) }),

  getOutbox: () => request<OutboxNotification[]>("/outbox"),

  getTodaysReminders: () => request<TodaysAppointment[]>("/reminders/today"),

  sendReminder: (appointmentId: string) =>
    request<OutboxNotification>(`/reminders/${appointmentId}/send`, { method: "POST" }),
};
