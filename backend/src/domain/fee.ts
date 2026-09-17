/**
 * Cancellation fee rule. Numbers here are placeholders until the real
 * clinic policy is confirmed — change them in one place.
 */
export const CANCELLATION_POLICY = {
  freeCancellationCutoffHours: 24,
  lateFeeAmountCents: 2000, // $20.00
} as const;

export type CancellationOutcome =
  | { kind: "FREE" }
  | { kind: "LATE_FEE"; feeCents: number };

/**
 * Pure function: given "now" and when the appointment was scheduled to
 * start, decide whether the cancellation is free or incurs the late fee.
 * Cancelling AT EXACTLY the cutoff boundary counts as free (the patient
 * gets the benefit of the boundary instant).
 */
export function decideCancellationFee(
  now: Date,
  appointmentStart: Date,
  policy: typeof CANCELLATION_POLICY = CANCELLATION_POLICY
): CancellationOutcome {
  const hoursNotice =
    (appointmentStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursNotice >= policy.freeCancellationCutoffHours) {
    return { kind: "FREE" };
  }
  return { kind: "LATE_FEE", feeCents: policy.lateFeeAmountCents };
}
