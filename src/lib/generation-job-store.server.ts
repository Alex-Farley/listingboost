import type { D1Database } from "@cloudflare/workers-types";
import type { GenerationFailure } from "./generation-provider";
import type { GenerationJobRecord } from "./generation-job";
import type { GenerationJobStore, GenerationJobUpdate } from "./generation-orchestrator";

type GenerationJobRow = Record<string, unknown>;

function failureFromRow(row: GenerationJobRow): GenerationFailure | undefined {
  if (typeof row.failure_code !== "string" || typeof row.failure_message !== "string") return undefined;
  return {
    code: row.failure_code,
    message: row.failure_message,
    retryable: row.failure_retryable === 1,
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function optionalJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function generationJobFromRow(row: GenerationJobRow): GenerationJobRecord {
  if (
    typeof row.id !== "string" ||
    typeof row.campaign_id !== "string" ||
    typeof row.campaign_asset_id !== "string" ||
    typeof row.asset_key !== "string" ||
    typeof row.state !== "string" ||
    typeof row.attempt !== "number" ||
    typeof row.idempotency_key !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    throw new Error("Invalid persisted generation job.");
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignAssetId: row.campaign_asset_id,
    assetKey: row.asset_key,
    state: row.state as GenerationJobRecord["state"],
    attempt: row.attempt,
    idempotencyKey: row.idempotency_key,
    specification: optionalJson<GenerationJobRecord["specification"]>(row.specification_json),
    strategy: optionalJson<GenerationJobRecord["strategy"]>(row.strategy_json),
    providerKey: optionalString(row.provider_key),
    providerModel: optionalString(row.provider_model),
    providerJobId: optionalString(row.provider_job_id),
    providerRequestId: optionalString(row.provider_request_id),
    promptVersion: optionalString(row.prompt_version),
    estimatedCostUsd: optionalNumber(row.estimated_cost_usd),
    actualCostUsd: optionalNumber(row.actual_cost_usd),
    failure: failureFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: optionalString(row.started_at),
    completedAt: optionalString(row.completed_at),
  };
}

const UPDATE_COLUMNS = {
  state: "state",
  attempt: "attempt",
  providerKey: "provider_key",
  providerModel: "provider_model",
  providerJobId: "provider_job_id",
  providerRequestId: "provider_request_id",
  estimatedCostUsd: "estimated_cost_usd",
  actualCostUsd: "actual_cost_usd",
  failure: "failure",
  startedAt: "started_at",
  completedAt: "completed_at",
} as const;

export function createD1GenerationJobStore(database: D1Database): GenerationJobStore {
  return {
    async findByIdempotencyKey(idempotencyKey) {
      const row = await database
        .prepare("SELECT * FROM generation_jobs WHERE idempotency_key=?")
        .bind(idempotencyKey)
        .first<GenerationJobRow>();
      return row ? generationJobFromRow(row) : null;
    },

    async create(job) {
      await database.prepare(
        `INSERT INTO generation_jobs (
          id,campaign_id,campaign_asset_id,asset_key,state,attempt,idempotency_key,
          provider_key,provider_model,provider_job_id,provider_request_id,prompt_version,
          estimated_cost_usd,actual_cost_usd,failure_code,failure_message,failure_retryable,
          specification_json,strategy_json,created_at,updated_at,started_at,completed_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        job.id,
        job.campaignId,
        job.campaignAssetId,
        job.assetKey,
        job.state,
        job.attempt,
        job.idempotencyKey,
        job.providerKey ?? null,
        job.providerModel ?? null,
        job.providerJobId ?? null,
        job.providerRequestId ?? null,
        job.promptVersion ?? null,
        job.estimatedCostUsd ?? null,
        job.actualCostUsd ?? null,
        job.failure?.code ?? null,
        job.failure?.message ?? null,
        job.failure ? (job.failure.retryable ? 1 : 0) : null,
        job.specification ? JSON.stringify(job.specification) : null,
        job.strategy ? JSON.stringify(job.strategy) : null,
        job.createdAt,
        job.updatedAt,
        job.startedAt ?? null,
        job.completedAt ?? null,
      ).run();
    },

    async update(id, update) {
      const entries = Object.entries(update) as [keyof typeof UPDATE_COLUMNS, unknown][];
      if (entries.length === 0) {
        const row = await database.prepare("SELECT * FROM generation_jobs WHERE id=?").bind(id).first<GenerationJobRow>();
        if (!row) throw new Error("Generation job not found.");
        return generationJobFromRow(row);
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of entries) {
        const column = UPDATE_COLUMNS[key];
        if (!column) continue;
        if (key === "failure") {
          const failure = value as GenerationFailure | undefined;
          sets.push("failure_code=?", "failure_message=?", "failure_retryable=?");
          values.push(
            failure?.code ?? null,
            failure?.message ?? null,
            failure ? (failure.retryable ? 1 : 0) : null,
          );
        } else {
          sets.push(`${column}=?`);
          values.push(value ?? null);
        }
      }

      sets.push("updated_at=?");
      values.push(new Date().toISOString(), id);
      const row = await database.prepare(
        `UPDATE generation_jobs SET ${sets.join(",")} WHERE id=? RETURNING *`,
      ).bind(...values).first<GenerationJobRow>();
      if (!row) throw new Error("Generation job not found.");
      return generationJobFromRow(row);
    },
  };
}
