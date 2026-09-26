export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super("invalid_transition", `Invalid asset version transition: ${from} -> ${to}`);
  }
}

export class ImmutableVersionError extends DomainError {
  constructor(versionId: string) {
    super("version_immutable", `Asset version ${versionId} is approved and cannot be changed`);
  }
}

export class PropertyTruthViolation extends DomainError {
  constructor(message: string) {
    super("property_truth_violation", message);
  }
}
