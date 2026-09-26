import { useId, useState } from "react";
import { api, ApiError } from "../api";
import type { AssetView, VersionView } from "../types";

const COPY_TITLES: Record<string, string> = {
  headline: "Headline",
  supporting_copy: "Supporting copy",
  instagram_caption: "Instagram caption",
  facebook_copy: "Facebook post",
  linkedin_copy: "LinkedIn post",
  hashtags: "Hashtags",
  cta: "Call to action",
};

export function assetTitle(asset: AssetView, index: number): string {
  const slot = asset.slotKey.split(":")[1] ?? "";
  switch (asset.assetType) {
    case "enhanced_photo":
      return `Enhanced photo ${index + 1}`;
    case "social_post":
      return `Social post ${asset.aspectRatio}`;
    case "story":
      return `Story ${asset.aspectRatio}`;
    case "reel":
      return `Reel ${asset.aspectRatio}`;
    default:
      return COPY_TITLES[slot] ?? slot;
  }
}

const STATE_LABELS: Record<string, string> = {
  queued: "Generating…",
  processing: "Generating…",
  completed: "Generating…",
  needs_review: "Ready for review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  cancelled: "Cancelled",
};
const ACTIVE = new Set(["queued", "processing", "completed"]);

function Preview({ version, title }: { version: VersionView; title: string }) {
  if (version.media?.contentType.startsWith("video/")) {
    return <video className="asset__media" src={version.media.url} controls preload="metadata" aria-label={title} />;
  }
  if (version.media) {
    return <img className="asset__media" src={version.media.url} alt={title} width={version.media.width ?? undefined} height={version.media.height ?? undefined} />;
  }
  if (version.text !== null) return <p className="asset__text">{version.text}</p>;
  return null;
}

type Props = { campaignId: string; asset: AssetView; title: string; onChange: () => Promise<void> };

export function AssetCard({ campaignId, asset, title, onChange }: Props) {
  const titleId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/campaigns/${campaignId}/assets/${asset.id}`;
  const latest = asset.versions[0];
  const older = asset.versions.slice(1);
  const final = asset.versions.find((v) => v.id === asset.finalVersionId);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await onChange();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    setBusy(true);
    try {
      const result = await api<{ warnings: Array<{ category: string }> }>(`${base}/text`, { method: "PUT", json: { text: draft } });
      setEditing(false);
      setMessage(
        result.warnings.length
          ? {
              kind: "warning",
              text: `Saved as a new version for review. Some statements are not supported by the recorded facts: ${[
                ...new Set(result.warnings.map((w) => w.category.replace(/_/g, " "))),
              ].join(", ")}.`,
            }
          : null,
      );
      await onChange();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  async function download(version: VersionView) {
    const { url } = await api<{ url: string }>(`${base}/versions/${version.id}/download`);
    window.location.assign(url);
  }

  const active = latest ? ACTIVE.has(latest.state) : false;
  return (
    <article className={`asset asset--${asset.assetType}`} aria-labelledby={titleId}>
      <header className="asset__header">
        <h3 id={titleId}>{title}</h3>
        {latest && <span className={`status status--${latest.state}`}>{STATE_LABELS[latest.state] ?? latest.state}</span>}
      </header>
      {latest && (
        <p className="asset__version">
          Version {latest.versionNumber}
          {latest.origin === "manual_edit" ? " · edited" : ""}
        </p>
      )}
      {latest?.disclosureLabel && <p className="asset__disclosure">{latest.disclosureLabel}</p>}
      {editing ? (
        <div className="asset__edit">
          <textarea aria-label={`${title} text`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} />
          <div className="asset__actions">
            <button className="button button--primary" type="button" disabled={busy} onClick={() => void saveText()}>
              Save as new version
            </button>
            <button className="button" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : latest ? (
        <Preview version={latest} title={title} />
      ) : (
        <p className="asset__empty">{asset.available ? "Not generated yet." : "Not available yet."}</p>
      )}
      {latest?.errorMessage && <p className="asset__error">{latest.errorMessage}</p>}
      {final && latest && final.id !== latest.id && (
        <p className="asset__note">Approved version {final.versionNumber} stays final until you approve a newer one.</p>
      )}
      {message && (
        <p className={`banner banner--${message.kind === "error" ? "error" : "warning"}`} role="alert">
          {message.text}
        </p>
      )}
      {!editing && (
        <div className="asset__actions">
          {latest?.state === "needs_review" && (
            <>
              <button className="button button--primary" type="button" disabled={busy} onClick={() => void run(() => api(`${base}/versions/${latest.id}/approve`, { method: "POST" }))}>
                Approve
              </button>
              <button className="button" type="button" disabled={busy} onClick={() => void run(() => api(`${base}/versions/${latest.id}/reject`, { method: "POST" }))}>
                Reject
              </button>
            </>
          )}
          {asset.assetType === "copy" && !active && (
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(latest?.text ?? "");
                setEditing(true);
              }}
            >
              Edit text
            </button>
          )}
          {latest && !active && asset.available && (
            <button className="button" type="button" disabled={busy} onClick={() => void run(() => api(`${base}/regenerate`, { method: "POST" }))}>
              Regenerate
            </button>
          )}
          {latest?.media && !active && (
            <button className="button button--quiet" type="button" onClick={() => void download(latest)}>
              Download
            </button>
          )}
        </div>
      )}
      {older.length > 0 && (
        <details className="asset__history">
          <summary>Version history</summary>
          <ol>
            {older.map((v) => (
              <li key={v.id}>
                Version {v.versionNumber} · {STATE_LABELS[v.state] ?? v.state}
                {v.text !== null && <span className="asset__history-text"> — {v.text}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
