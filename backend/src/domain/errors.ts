export class BookingConflictError extends Error {
  constructor(message = "This doctor already has an overlapping appointment in that time range.") {
    super(message);
    this.name = "BookingConflictError";
  }
}

export class InvalidRangeError extends Error {
  constructor(message = "Appointment start must be before its end.") {
    super(message);
    this.name = "InvalidRangeError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class AlreadyCancelledError extends Error {
  constructor(message = "This appointment is already cancelled.") {
    super(message);
    this.name = "AlreadyCancelledError";
  }
}

export class AppointmentNotBookedError extends Error {
  constructor(message = "Only a currently booked appointment can be rescheduled.") {
    super(message);
    this.name = "AppointmentNotBookedError";
  }
}

/** Postgres error code for a unique/exclusion constraint violation. */
export const PG_EXCLUSION_VIOLATION = "23P01";
