import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../api";
import { AssetCard, assetTitle } from "../components/AssetCard";
import type { AssetView, CampaignView } from "../types";
import { useWorkspace } from "./Workspace";

const STATUS: Record<string, { icon: string; text: string }> = {
  complete: { icon: "✓", text: "Complete" },
  approved: { icon: "✓", text: "Approved" },
  in_progress: { icon: "◌", text: "Generating" },
  needs_review: { icon: "●", text: "Ready for review" },
  failed: { icon: "!", text: "Needs attention" },
  unavailable: { icon: "○", text: "Not available yet" },
  not_started: { icon: "○", text: "Not started" },
};

export function CampaignPanel() {
  const { property, campaign, setCampaign } = useWorkspace();
  const [photoCount, setPhotoCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ items: unknown[] }>(`/api/properties/${property.id}/media`).then((r) => !cancelled && setPhotoCount(r.items.length), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [property.id]);

  async function run(action: () => Promise<CampaignView>) {
    setBusy(true);
    setError(null);
    try {
      setCampaign(await action());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (campaign === undefined || photoCount === null) return <p className="loading" role="status">Loading campaign…</p>;

  if (!campaign) {
    return (
      <section className="panel" aria-label="Campaign">
        <h2>Marketing campaign</h2>
        {photoCount === 0 ? (
          <p>
            Add at least one photo on the <Link to="images">Images</Link> tab to create a campaign.
          </p>
        ) : (
          <>
            <p>Create a campaign to prepare enhanced photos, social posts, Stories, a Reel and copy from this listing.</p>
            <button
              className="button button--primary"
              type="button"
              disabled={busy}
              onClick={() => void run(() => api<CampaignView>(`/api/properties/${property.id}/campaigns`, { json: {} }))}
            >
              Create campaign
            </button>
          </>
        )}
        {error && <p className="banner banner--error" role="alert">{error}</p>}
      </section>
    );
  }

  const canGenerate = campaign.assets.some((a) => a.versions.length === 0 && a.available);
  const nothingAvailable = campaign.assets.every((a) => !a.available);
  return (
    <section className="panel" aria-label="Campaign">
      <h2>{campaign.name}</h2>
      <ul className="progress" aria-label="Campaign progress">
        {campaign.progress.map((g) => (
          <li key={g.key} className={`progress__item progress__item--${g.status}`}>
            <span aria-hidden="true" className="progress__icon">{STATUS[g.status]?.icon ?? "○"}</span>
            <span className="progress__label">{g.label}</span>
            <span className="progress__status">{STATUS[g.status]?.text ?? g.status}</span>
          </li>
        ))}
      </ul>
      {nothingAvailable && (
        <p className="panel__note">
          Automatic generation isn't available yet. You can still write copy yourself on the <Link to="social">Social Posts</Link> tab.
        </p>
      )}
      {canGenerate && (
        <button
          className="button button--primary"
          type="button"
          disabled={busy}
          onClick={() => void run(() => api<CampaignView>(`/api/campaigns/${campaign.id}/generate`, { method: "POST" }))}
        >
          Generate marketing
        </button>
      )}
      {error && <p className="banner banner--error" role="alert">{error}</p>}
    </section>
  );
}

function AssetGrid({ types, empty }: { types: AssetView["assetType"][]; empty: string }) {
  const { campaign, reloadCampaign } = useWorkspace();
  if (campaign === undefined) return <p className="loading" role="status">Loading…</p>;
  if (!campaign) return <p className="empty">{empty}</p>;
  const assets = campaign.assets.filter((a) => types.includes(a.assetType));
  return (
    <div className="asset-grid">
      {assets.map((a) => (
        <AssetCard
          key={a.id}
          campaignId={campaign.id}
          asset={a}
          title={assetTitle(a, campaign.assets.filter((x) => x.assetType === a.assetType).indexOf(a))}
          onChange={reloadCampaign}
        />
      ))}
    </div>
  );
}

const NO_CAMPAIGN = "Create a campaign from the Overview tab first.";

export function EnhancedPhotos() {
  const { campaign } = useWorkspace();
  if (!campaign) return null;
  return (
    <section aria-label="Enhanced photographs" className="section">
      <h2>Enhanced photographs</h2>
      <p className="section__note">We enhance the photograph. We never change the property.</p>
      <AssetGrid types={["enhanced_photo"]} empty={NO_CAMPAIGN} />
    </section>
  );
}

export function SocialTab() {
  return (
    <>
      <AssetGrid types={["social_post"]} empty={NO_CAMPAIGN} />
      <h2 className="section__title">Captions and copy</h2>
      <AssetGrid types={["copy"]} empty={NO_CAMPAIGN} />
    </>
  );
}

export function StoriesTab() {
  return <AssetGrid types={["story"]} empty={NO_CAMPAIGN} />;
}

export function ReelsTab() {
  return <AssetGrid types={["reel"]} empty={NO_CAMPAIGN} />;
}

export function PackTab() {
  const { campaign } = useWorkspace();
  if (campaign === undefined) return <p className="loading" role="status">Loading…</p>;
  if (!campaign) return <p className="empty">{NO_CAMPAIGN}</p>;
  const approved = campaign.assets.filter((a) => a.finalVersionId).length;
  return (
    <section className="panel" aria-label="Marketing pack">
      <h2>Marketing pack</h2>
      <p>The pack contains the approved version of each asset, organised into Photography, Social, Stories, Reels and Copy folders.</p>
      {approved === 0 ? (
        <p className="empty">Approve at least one asset to download the marketing pack.</p>
      ) : (
        <>
          <p>
            {approved} approved asset{approved === 1 ? "" : "s"} included
            {approved < campaign.assets.length ? ` (${campaign.assets.length - approved} not yet approved)` : ""}.
          </p>
          <a className="button button--primary" href={`/api/campaigns/${campaign.id}/pack`} download>
            Download marketing pack
          </a>
        </>
      )}
    </section>
  );
}
