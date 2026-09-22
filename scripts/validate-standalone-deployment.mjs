const environment = process.env.LB_ENVIRONMENT?.trim();

if (environment !== "preview" && environment !== "production") {
  throw new Error("LB_ENVIRONMENT must be preview or production.");
}

const required = [
  "LB_WORKER_NAME",
  "LB_D1_DATABASE_ID",
  "LB_D1_DATABASE_NAME",
  "LB_BETTER_AUTH_URL",
];

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing required standalone deployment variable: ${name}`);
  }
}

const values = {
  worker: process.env.LB_WORKER_NAME.trim(),
  database: process.env.LB_D1_DATABASE_NAME.trim(),
  bucket: process.env.LB_R2_BUCKET_NAME?.trim() ?? "",
  queue: process.env.LB_QUEUE_NAME?.trim() ?? "",
  authUrl: process.env.LB_BETTER_AUTH_URL.trim(),
  route: process.env.LB_ROUTE?.trim() ?? "",
};

const productionMarkers = /(^|[-_.])(?:prod|production|live)(?:$|[-_.])/i;
const previewMarker = /(^|[-_.])preview(?:$|[-_.])/i;

function assertPreviewResource(name, value) {
  if (!value) return;
  if (productionMarkers.test(value)) {
    throw new Error(`Preview deployment cannot target a production resource: ${name}.`);
  }
  if (!value.toLowerCase().includes("preview")) {
    throw new Error(`Preview ${name} must identify the preview environment.`);
  }
}

function assertProductionResource(name, value) {
  if (!value) return;
  if (previewMarker.test(value)) {
    throw new Error(`Production deployment cannot target a preview resource: ${name}.`);
  }
}

if (environment === "preview") {
  assertPreviewResource("worker", values.worker);
  assertPreviewResource("D1 database", values.database);
  assertPreviewResource("R2 bucket", values.bucket);
  assertPreviewResource("Queue", values.queue);

  const authUrl = new URL(values.authUrl);
  if (authUrl.protocol !== "https:") {
    throw new Error("Preview BETTER_AUTH_URL must use HTTPS.");
  }
  if (!authUrl.hostname.includes("preview")) {
    throw new Error("Preview BETTER_AUTH_URL must identify the preview environment.");
  }

  if (values.route) {
    throw new Error("Preview deployments must not configure a production route; use the preview workers.dev URL instead.");
  }
} else {
  assertProductionResource("worker", values.worker);
  assertProductionResource("D1 database", values.database);
  assertProductionResource("R2 bucket", values.bucket);
  assertProductionResource("Queue", values.queue);

  const authUrl = new URL(values.authUrl);
  if (authUrl.protocol !== "https:") {
    throw new Error("Production BETTER_AUTH_URL must use HTTPS.");
  }
  if (previewMarker.test(authUrl.hostname)) {
    throw new Error("Production BETTER_AUTH_URL cannot identify the preview environment.");
  }
}

console.log(`Standalone ${environment} deployment resource isolation checks passed.`);
