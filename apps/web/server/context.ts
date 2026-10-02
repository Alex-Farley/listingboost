import type { SqlDatabase } from "@listingboost/database";
import type { BrandAssetProcessor, ProviderRegistry } from "@listingboost/ai";
import type { JobQueue, PresetFontSource } from "@listingboost/generation";
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
  queue: JobQueue;
  /** Only configured capabilities are present; the rest are reported as unavailable. */
  providers: ProviderRegistry;
  /** Converts and checks uploaded logos and fonts with the renderer's own libraries. */
  brandAssets: BrandAssetProcessor;
  /** Reads bundled preset fonts from the site's static files. */
  presetFonts: PresetFontSource;
  config: AppConfig;
  now: () => Date;
};
