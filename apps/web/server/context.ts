import type { SqlDatabase } from "@listingboost/database";
import type { ObjectStore } from "@listingboost/storage";

export type AppConfig = {
  /** Exact origin of the web app, e.g. https://app.listingboost.co.uk. Used for CSRF origin checks. */
  appOrigin: string;
  /** HMAC key for signed media URLs. Must be a Worker secret. */
  mediaSigningSecret: string;
};

export type AppContext = {
  db: SqlDatabase;
  storage: ObjectStore;
  config: AppConfig;
  now: () => Date;
};
