import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing, Check, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { OutboxNotification, TodaysAppointment } from "../types";

const QUICK_ADVANCES = [
  { label: "+30 min", minutes: 30 },
  { label: "+1 hour", minutes: 60 },
  { label: "+1 day", minutes: 24 * 60 },
] as const;

/**
 * Lets the desk drive the server's virtual clock instead of waiting on
 * real time, review who has an appointment today, and manually send them a
 * reminder. Deliberately does NOT display a "current server time" readout:
 * that value is in-memory on the backend and resets on every server
 * restart, so showing it live risked looking wrong/stale at the exact
 * moments it'd matter most. The result of each action (sweep counts) is
 * shown instead, which is always accurate for what just happened.
 */
export function ClockPanel() {
  const [lastSweep, setLastSweep] = useState<{ noShowCount: number; reminderCount: number } | null>(null);
  const [todaysAppointments, setTodaysAppointments] = useState<TodaysAppointment[]>([]);
  const [outbox, setOutbox] = useState<OutboxNotification[]>([]);
  const [customDateTime, setCustomDateTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshReminders() {
    const [today, notifications] = await Promise.all([api.getTodaysReminders(), api.getOutbox()]);
    setTodaysAppointments(today);
    setOutbox([...notifications].reverse());
  }

  useEffect(() => {
    refreshReminders().catch(() => {});
  }, []);

  async function afterClockAction(result: { noShowCount?: number; reminderCount?: number }) {
    setLastSweep({ noShowCount: result.noShowCount ?? 0, reminderCount: result.reminderCount ?? 0 });
    await refreshReminders();
  }

  async function handleAdvance(minutes: number) {
    setError(null);
    setBusy(true);
    try {
      await afterClockAction(await api.advanceClock(minutes));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not advance clock.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!customDateTime) return;
    setError(null);
    setBusy(true);
    try {
      await afterClockAction(await api.setClock(new Date(customDateTime).toISOString()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set clock.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReminder(appointmentId: string) {
    setError(null);
    setSendingId(appointmentId);
    try {
      await api.sendReminder(appointmentId);
      await refreshReminders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reminder.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="panel">
      <h2>
        <Clock3 size={18} style={{ verticalAlign: "-3px", marginRight: "0.4rem" }} />
        Clock &amp; Reminders
      </h2>

      <div className="clock-actions">
        {QUICK_ADVANCES.map((q) => (
          <button key={q.minutes} type="button" onClick={() => handleAdvance(q.minutes)} disabled={busy}>
            {q.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSetCustom} className="clock-custom">
        <input
          type="datetime-local"
          value={customDateTime}
          onChange={(e) => setCustomDateTime(e.target.value)}
        />
        <button type="submit" disabled={busy || !customDateTime}>
          Jump to time
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      <AnimatePresence>
        {lastSweep && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="clock-sweep"
          >
            Last tick: {lastSweep.noShowCount} appointment(s) auto-marked no-show,{" "}
            {lastSweep.reminderCount} morning reminder(s) auto-sent.
          </motion.div>
        )}
      </AnimatePresence>

      <div className="reminders-box">
        <h3>
          <BellRing size={15} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />
          Today's appointments ({todaysAppointments.length})
        </h3>
        {todaysAppointments.length === 0 && (
          <p className="outbox__empty">No booked appointments today (per the server's current clock).</p>
        )}
        <ul className="reminders-list">
          {todaysAppointments.map((a) => (
            <li key={a.id} className="reminders-list__item">
              <div className="reminders-list__info">
                <span className="reminders-list__time">
                  {new Date(a.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span>
                  <strong>{a.patient?.name}</strong> · {a.doctor?.name}
                </span>
              </div>
              {a.reminderSent ? (
                <span className="reminders-list__sent">
                  <Check size={14} /> Reminded
                </span>
              ) : (
                <button type="button" onClick={() => handleSendReminder(a.id)} disabled={sendingId === a.id}>
                  {sendingId === a.id ? "Sending..." : "Send reminder"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="outbox">
        <h3>
          <Bell size={15} style={{ verticalAlign: "-2px", marginRight: "0.35rem" }} />
          Outbox log ({outbox.length})
        </h3>
        {outbox.length === 0 && <p className="outbox__empty">No notifications sent yet.</p>}
        <ul className="outbox__list">
          {outbox.map((n) => (
            <li key={n.id} className="outbox__item">
              {/* n.message is written TO the patient (second person) -- label
                  the recipient explicitly so it doesn't read as addressed to
                  whoever's looking at this screen. */}
              <span className="outbox__recipient">To {n.patientName}</span>
              <span className="outbox__message">&ldquo;{n.message}&rdquo;</span>
              <span className="outbox__meta">sent {new Date(n.sentAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
