/**
 * ListingBoost property-image treatment is explicit because property
 * marketing must distinguish faithful photographic enhancement from a
 * generated visualisation of potential changes.
 *
 * Providers remain implementation details: this contract describes the
 * customer-visible meaning of an output, not how a provider produces it.
 */
export type PropertyImageTreatment =
  | {
      mode: "enhance";
      propertyFidelity: "preserved";
      disclosure: "none";
    }
  | {
      mode: "potential-visualisation";
      propertyFidelity: "transformed";
      disclosure: "potential-visualisation";
    };

/**
 * The disclosure shown with every potential visualisation. Keep this wording
 * deliberately explicit: the image is illustrative and is not a photograph
 * of the property as it exists.
 */
export const POTENTIAL_VISUALISATION_DISCLOSURE =
  "POTENTIAL VISUALISATION — Digitally generated — illustrative only. Not a photograph of the property." as const;

/**
 * Enforce the non-negotiable mapping between treatment mode, property
 * fidelity and customer-facing disclosure before an asset is persisted or
 * delivered.
 */
export function assertValidPropertyImageTreatment(
  treatment: PropertyImageTreatment,
): PropertyImageTreatment {
  if (treatment.mode === "enhance") {
    if (treatment.propertyFidelity !== "preserved" || treatment.disclosure !== "none") {
      throw new Error("Enhanced property photography must preserve property fidelity and have no visualisation disclosure.");
    }

    return treatment;
  }

  if (
    treatment.propertyFidelity !== "transformed" ||
    treatment.disclosure !== "potential-visualisation"
  ) {
    throw new Error("Potential visualisations must be marked as transformed and disclosed as potential visualisations.");
  }

  return treatment;
}

/**
 * Returns the disclosure required for a customer-facing image. A faithful
 * enhancement has no special disclosure; a potential visualisation always
 * receives the explicit disclosure text above.
 */
export function getPropertyImageDisclosure(
  treatment: PropertyImageTreatment,
): typeof POTENTIAL_VISUALISATION_DISCLOSURE | null {
  assertValidPropertyImageTreatment(treatment);
  return treatment.disclosure === "potential-visualisation"
    ? POTENTIAL_VISUALISATION_DISCLOSURE
    : null;
}
