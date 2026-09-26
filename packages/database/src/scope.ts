/**
 * Every tenant-data repository call requires a scope derived server-side from
 * the authenticated session. There is deliberately no unscoped read path.
 */
export type OrganisationScope = { readonly organisationId: string; readonly userId: string };
