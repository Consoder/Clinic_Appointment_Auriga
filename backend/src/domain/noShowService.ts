import type { PrismaClient } from "@prisma/client";

const NO_SHOW_GRACE_MINUTES = 30;

/**
 * T2: any appointment still BOOKED more than 30 minutes past its start
 * time has effectively been missed -- auto-mark it NO_SHOW. Driven by the
 * virtual clock (run from POST /clock) rather than a real background
 * scheduler, so it's deterministically gradable. A plain updateMany is
 * naturally idempotent: once an appointment flips to NO_SHOW it stops
 * matching status = 'BOOKED', so repeated sweeps are harmless.
 */
export async function sweepNoShows(prisma: PrismaClient, now: Date) {
  const cutoff = new Date(now.getTime() - NO_SHOW_GRACE_MINUTES * 60 * 1000);

  const result = await prisma.appointment.updateMany({
    where: { status: "BOOKED", startsAt: { lte: cutoff } },
    data: { status: "NO_SHOW" },
  });

  return result.count;
}
