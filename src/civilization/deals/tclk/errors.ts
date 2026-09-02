/**
 * Technocore Lock Protocol (tclk/1) Deal Adapter Errors.
 *
 * Provides strongly-typed error definitions for deal lifecycle and protocol validation.
 */

export class TclkDealError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TclkDealError";
  }
}

export class TclkFrameValidationError extends TclkDealError {
  readonly frameType?: string;

  constructor(message: string, frameType?: string, cause?: unknown) {
    super(`Tclk Frame Validation Error: ${message}`, { cause });
    this.name = "TclkFrameValidationError";
    this.frameType = frameType;
  }
}

export class TclkStateTransitionError extends TclkDealError {
  readonly contractId: string;
  readonly currentStatus: string;
  readonly attemptedFrameType: string;
  readonly reason?: string;

  constructor(
    contractId: string,
    currentStatus: string,
    attemptedFrameType: string,
    reason?: string,
  ) {
    super(
      `Cannot transition contract "${contractId}" in state "${currentStatus}" with frame "${attemptedFrameType}"${
        reason ? `: ${reason}` : ""
      }`,
    );
    this.name = "TclkStateTransitionError";
    this.contractId = contractId;
    this.currentStatus = currentStatus;
    this.attemptedFrameType = attemptedFrameType;
    this.reason = reason;
  }
}

export class TclkSignerMismatchError extends TclkDealError {
  readonly frameFrom: string;
  readonly signerDid: string;

  constructor(frameFrom: string, signerDid: string) {
    super(
      `Signer mismatch: frame \`from\` is "${frameFrom}", but signing identity is "${signerDid}"`,
    );
    this.name = "TclkSignerMismatchError";
    this.frameFrom = frameFrom;
    this.signerDid = signerDid;
  }
}

export class TclkSecretNotFoundError extends TclkDealError {
  readonly identifier: string;
  readonly kind: "contract" | "statement";

  constructor(identifier: string, kind: "contract" | "statement") {
    super(
      `Secret not found in local vault for ${kind} "${identifier}". The local agent may not have minted this lock.`,
    );
    this.name = "TclkSecretNotFoundError";
    this.identifier = identifier;
    this.kind = kind;
  }
}

export class TclkInvalidSecretError extends TclkDealError {
  readonly statement: string;
  readonly lockKind: string;

  constructor(statement: string, lockKind: string) {
    super(
      `Invalid secret: provided secret fails verification against statement "${statement}" for ${lockKind} lock`,
    );
    this.name = "TclkInvalidSecretError";
    this.statement = statement;
    this.lockKind = lockKind;
  }
}

export class TclkExpiredError extends TclkDealError {
  readonly contractId: string;
  readonly deadlineKind: "expiresMs" | "claimByMs" | "refundAfterMs";
  readonly deadlineTime: number;
  readonly currentTime: number;

  constructor(
    contractId: string,
    deadlineKind: "expiresMs" | "claimByMs" | "refundAfterMs",
    deadlineTime: number,
    currentTime: number,
  ) {
    super(
      `Deal deadline exceeded for contract "${contractId}": ${deadlineKind} is ${deadlineTime}, current time is ${currentTime}`,
    );
    this.name = "TclkExpiredError";
    this.contractId = contractId;
    this.deadlineKind = deadlineKind;
    this.deadlineTime = deadlineTime;
    this.currentTime = currentTime;
  }
}

export class TclkRailError extends TclkDealError {
  readonly railId: string;

  constructor(railId: string, message: string, cause?: unknown) {
    super(`Settlement rail "${railId}" error: ${message}`, { cause });
    this.name = "TclkRailError";
    this.railId = railId;
  }
}
