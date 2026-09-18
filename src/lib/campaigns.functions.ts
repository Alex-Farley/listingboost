-
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bindings } from "./bindings.server";
import { createServerFnf } from "./fnf.server";
import { assertCampaignTransition, CAMPAIGN_STATES, deriveCampaignState, normalizeCampaignAssetState, normalizeCampaignState, type CampaignAssetState, type CampaignState } from "./campaign-state";

async function getAuthorizedSourceImage(mediaId: string) {
  const media = await createServerFnf().adapter.getMedia({ id: mediaId, type: "image" });
  if (!media || media.id !== mediaId) throw new Error("Source image not found.");
  return { id: media.id, type: media.type };
}

async function getAuthorizedGeneration(generationId: string, expectedMediaType: "image" | "video") {
  const generation = await createServerFnf().adapter.getJob(generationId) as {
    id?: string;
    type?: string;
  };
  if (generation.id !== generationId || generation.type !== expectedMediaType) {
    throw new Error("Generation not found.");
  }
  return generation;
}

const events = ["New listing", "Price reduction", "Open house", "Under offer", "Sold"] as const;
const sourceImage = z.object({id:z.string().min(1),type:z.string().optional()});

export type CampaignSummary = {
  id: string; listingUrl: string; eventType: string; brandName: string;
  status: CampaignState; assetCount: number; createdAt: string; updatedAt: string;
};
export type PersistedCampaignAsset = {
  id: string; title: string; description: string; generationId: string;
  mediaType: "image" | "video"; aspectRatio: string;
  previewUrl: string | null; rawUrl: string | null; status: string;
};
export type PersistedCampaign = {
  id: string; listingUrl: string; details: string; eventType: string;
  brandName: string; cta: string; sourceImages: {id:string;type?:string}[]; copy: string;
  plan: string; status: CampaignState; createdAt: string; updatedAt: string;
  assets: PersistedCampaignAsset[];
};
export type CreateCampaignInput = {
  listingUrl: string; details: string; eventType: (typeof events)[number];
  brandName: string; cta: string; sourceImages: {id:string;type?:string}[];
};
export type SaveCampaignAssetInput = {
  campaignId: string; title: string; description: string; generationId: string;
  mediaType: "image" | "video"; aspectRatio: string;
};
export type UpdateCampaignInput = {
  campaignId: string; status?: CampaignState;
  copy?: string; plan?: string;
};

async function requireUserId() {
  const response = await fetch("https://fnf.internal/user");
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new Error(response.status === 401 ? "Sign in to manage campaigns." : "We couldn't verify your account.");
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const nested = record.user && typeof record.user === "object" ? record.user as Record<string, unknown> : {};
  const id = record.id ?? record.userId ?? nested.id ?? nested.userId;
  if (typeof id !== "string" || !id) throw new Error("We couldn't verify your account.");
  return id;
}
function db() {
  const value = bindings().DB;
  if (!value) throw new Error("Campaign storage is not available.");
  return value;
}
const createSchema = z.object({
  listingUrl: z.string().url().max(2048).refine(v => /^https?:\/\//i.test(v)),
  details: z.string().min(20).max(12000),
  eventType: z.enum(events), brandName: z.string().max(200),
  cta: z.string().min(1).max(200), sourceImages: z.array(sourceImage).min(1).max(6),
});

export const createCampaignRecordFn = createServerFn({method:"POST"}).validator(createSchema).handler(async ({data}) => {
  const userId = await requireUserId(), database = db(), id = crypto.randomUUID(), now = new Date().toISOString();
  // Never persist browser-supplied media metadata as authoritative. Resolve every
  // source image through the authenticated FNF media scope and persist only the
  // server-resolved id/type.
  const sourceImages = await Promise.all(data.sourceImages.map((source) => getAuthorizedSourceImage(source.id)));
  const sql = "INSERT INTO campaigns (id,user_id,listing_url,details,event_type,brand_name,cta,source_images_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'draft',?,?)";
  await database.prepare(sql).bind(id,userId,data.listingUrl,data.details,data.eventType,data.brandName,data.cta,JSON.stringify(sourceImages),now,now).run();
  return {id, createdAt: now};
});

export const saveCampaignAssetFn = createServerFn({method:"POST"}).validator(z.object({
  campaignId:z.string().uuid(), title:z.string().min(1).max(100), description:z.string().min(1).max(1000),
  generationId:z.string().min(1), mediaType:z.enum(["image","video"]), aspectRatio:z.string().regex(/^\d+:\d+$/)
})).handler(async ({data}) => {
  const userId=await requireUserId(), database=db();
  if(!await database.prepare("SELECT id FROM campaigns WHERE id=? AND user_id=?").bind(data.campaignId,userId).first()) throw new Error("Campaign not found.");
  // FNF generation reads are authenticated to the current FNF user. Resolve the
  // generation through that scope before attaching it to an owned campaign.
  await getAuthorizedGeneration(data.generationId, data.mediaType);
  const now=new Date().toISOString();
  const sql = "INSERT INTO campaign_assets (id,campaign_id,title,description,generation_id,media_type,aspect_ratio,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM campaign_assets WHERE campaign_id=?),0),?,?) ON CONFLICT(campaign_id,title) DO UPDATE SET description=excluded.description,generation_id=excluded.generation_id,media_type=excluded.media_type,aspect_ratio=excluded.aspect_ratio,updated_at=excluded.updated_at";
  await database.prepare(sql).bind(crypto.randomUUID(),data.campaignId,data.title,data.description,data.generationId,data.mediaType,data.aspectRatio,data.campaignId,now,now).run();
  await database.prepare("UPDATE campaigns SET updated_at=? WHERE id=? AND user_id=?").bind(now,data.campaignId,userId).run();
  return {ok:true as const};
});

export const updateCampaignRecordFn = createServerFn({method:"POST"}).validator(z.object({
  campaignId:z.string().uuid(), status:z.enum(CAMPAIGN_STATES).optional(),
  copy:z.string().max(12000).optional(), plan:z.string().max(12000).optional()
})).handler(async ({data}) => {
  const userId=await requireUserId(), database=db();
  if(!await database.prepare("SELECT id FROM campaigns WHERE id=? AND user_id=?").bind(data.campaignId,userId).first()) throw new Error("Campaign not found.");
  const sets:string[]=[]; const values:unknown[]=[];
  if(data.status!==undefined){
    const current=await database.prepare("SELECT status FROM campaigns WHERE id=? AND user_id=?").bind(data.campaignId,userId).first() as {status?:unknown}|null;
    if(!current || typeof current.status!=="string") throw new Error("Campaign not found.");
    assertCampaignTransition(current.status,data.status);
    sets.push("status=?");values.push(data.status);
  }
  if(data.copy!==undefined){sets.push("copy=?");values.push(data.copy);}
  if(data.plan!==undefined){sets.push("plan=?");values.push(data.plan);}
  sets.push("updated_at=?");values.push(new Date().toISOString(),data.campaignId,userId);
  await database.prepare("UPDATE campaigns SET "+sets.join(",")+" WHERE id=? AND user_id=?").bind(...values).run();
  return {ok:true as const};
});

export const listCampaignsFn = createServerFn({method:"POST"}).handler(async () => {
  const userId=await requireUserId(), database=db();
  const sql = "SELECT c.id,c.listing_url,c.event_type,c.brand_name,c.status,c.created_at,c.updated_at,COUNT(a.id) asset_count FROM campaigns c LEFT JOIN campaign_assets a ON a.campaign_id=c.id WHERE c.user_id=? AND c.status=\"ready\" GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 50";
  const result=await database.prepare(sql).bind(userId).all();
  return (result.results??[]).map(row=>{
    const r=row as Record<string,unknown>;
    return {id:String(r.id),listingUrl:String(r.listing_url),eventType:String(r.event_type),brandName:String(r.brand_name??""),status:normalizeCampaignState(String(r.status)),assetCount:Number(r.asset_count??0),createdAt:String(r.created_at),updatedAt:String(r.updated_at)} satisfies CampaignSummary;
  });
});

function mediaFromGeneration(generation:unknown,fallback:"image"|"video"){
  const g=generation&&typeof generation==="object"?generation as Record<string,unknown>:{};
  const result=g.results&&typeof g.results==="object"?g.results as Record<string,unknown>:{};
  const rawUrl=typeof result.rawUrl==="string"?result.rawUrl:null;
  const previewUrl=typeof result.minUrl==="string"?result.minUrl:typeof result.thumbnailUrl==="string"?result.thumbnailUrl:rawUrl;
  return {previewUrl,rawUrl,status:typeof g.status==="string"?g.status:"unknown",mediaType:fallback};
}

export const getCampaignFn = createServerFn({method:"POST"}).validator(z.object({campaignId:z.string().uuid()})).handler(async ({data}) => {
  const userId=await requireUserId(), database=db();
  const campaign=await database.prepare("SELECT id,listing_url,details,event_type,brand_name,cta,source_images_json,copy,plan,status,created_at,updated_at FROM campaigns WHERE id=? AND user_id=?").bind(data.campaignId,userId).first();
  if(!campaign) throw new Error("Campaign not found.");
  const row=campaign as Record<string,unknown>;
  const rows=await database.prepare("SELECT id,title,description,generation_id,media_type,aspect_ratio FROM campaign_assets WHERE campaign_id=? ORDER BY sort_order ASC").bind(data.campaignId).all();
  const assets=await Promise.all((rows.results??[]).map(async entry=>{
    const a=entry as Record<string,unknown>, mediaType=a.media_type==="video"?"video":"image";
    let media={previewUrl:null as string|null,rawUrl:null as string|null,status:"unknown",mediaType};
    try{media=mediaFromGeneration(await createServerFnf().adapter.getJob(String(a.generation_id)),mediaType);}catch{}
    return {id:String(a.id),title:String(a.title),description:String(a.description),generationId:String(a.generation_id),mediaType,aspectRatio:String(a.aspect_ratio),previewUrl:media.previewUrl,rawUrl:media.rawUrl,status:media.status} satisfies PersistedCampaignAsset;
  }));
  const storedState=normalizeCampaignState(String(row.status));
  const assetStates=assets.map((asset): CampaignAssetState => normalizeCampaignAssetState(asset.status));
  const effectiveState = assetStates.length > 0 && ["generating","partial","ready","failed"].includes(storedState)
    ? deriveCampaignState(assetStates)
    : storedState;
  let sourceImages:{id:string;type?:string}[]=[]; try{const parsed=JSON.parse(String(row.source_images_json));if(Array.isArray(parsed))sourceImages=parsed.filter((item):item is {id:string;type?:string}=>!!item&&typeof item==="object"&&typeof item.id==="string"&&(!item.type||typeof item.type==="string"));}catch{}
  return {id:String(row.id),listingUrl:String(row.listing_url),details:String(row.details),eventType:String(row.event_type),brandName:String(row.brand_name??""),cta:String(row.cta),sourceImages,copy:String(row.copy??""),plan:String(row.plan??""),status:effectiveState,createdAt:String(row.created_at),updatedAt:String(row.updated_at),assets} satisfies PersistedCampaign;
});

export const duplicateCampaignFn = createServerFn({method:"POST"}).validator(z.object({campaignId:z.string().uuid()})).handler(async ({data}) => {
  const userId=await requireUserId(), database=db();
  const original=await database.prepare("SELECT listing_url,details,event_type,brand_name,cta,source_images_json,copy,plan FROM campaigns WHERE id=? AND user_id=?").bind(data.campaignId,userId).first();
  if(!original) throw new Error("Campaign not found.");
  const source=original as Record<string,unknown>, id=crypto.randomUUID(), now=new Date().toISOString();
  const insert = "INSERT INTO campaigns (id,user_id,listing_url,details,event_type,brand_name,cta,source_images_json,copy,plan,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'draft',?,?)";
  await database.prepare(insert).bind(id,userId,source.listing_url,source.details,source.event_type,source.brand_name,source.cta,source.source_images_json,source.copy,source.plan,now,now).run();
  const assets=await database.prepare("SELECT title,description,generation_id,media_type,aspect_ratio,sort_order FROM campaign_assets WHERE campaign_id=? ORDER BY sort_order ASC").bind(data.campaignId).all();
  for(const entry of assets.results??[]){
    const a=entry as Record<string,unknown>;
    await database.prepare("INSERT INTO campaign_assets (id,campaign_id,title,description,generation_id,media_type,aspect_ratio,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),id,a.title,a.description,a.generation_id,a.media_type,a.aspect_ratio,a.sort_order,now,now).run();
  }
  return {id};
});
