/**
 * Virtual clock so time-based behavior (BR2's 24h cutoff, T2's no-show
 * sweep, T1's morning reminders) can be driven deterministically via
 * POST /clock instead of waiting on real time to pass. Until /clock is
 * ever called, now() just returns the real system time -- normal usage is
 * unaffected.
 */
let virtualNow: Date | null = null;

export const clock = {
  now(): Date {
    return virtualNow ?? new Date();
  },

  /** Jump straight to an absolute time. */
  set(date: Date): Date {
    virtualNow = date;
    return virtualNow;
  },

  /** Move forward by a duration, relative to the current effective time
   *  (virtual if already set, real otherwise) -- not always relative to
   *  real time, so repeated advances compose correctly. */
  advance(ms: number): Date {
    virtualNow = new Date(clock.now().getTime() + ms);
    return virtualNow;
  },
};
