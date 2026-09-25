import type { SqlDatabase } from "@listingboost/database";

export type AppConfig = {
  /** Exact origin of the web app, e.g. https://app.listingboost.co.uk. Used for CSRF origin checks. */
  appOrigin: string;
  /** HMAC key for signed media URLs. Must be a Worker secret. */
  mediaSigningSecret: string;
};

export type AppContext = {
  db: SqlDatabase;
  config: AppConfig;
  now: () => Date;
};
