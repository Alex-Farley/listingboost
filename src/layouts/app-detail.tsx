import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SubmitInputFor } from "@higgsfield/fnf/client";
import type { Generation } from "@higgsfield/fnf";
import {
  flattenFeedPages,
  jobsFeedQueryOptions,
  prependGenerations,
  useFnfJobClient,
  useFnfMediaClient,
  useFnfProfileClient,
  useFnfScopeKey,
  useLiveFeedGenerations,
} from "@higgsfield/fnf-react";
import { ImagePlus as IconAddPhoto } from "lucide-react";
import { Download as IconDownload } from "lucide-react";
import { Proportions as IconAspectRatio } from "lucide-react";
import { Maximize as IconFullScreen } from "lucide-react";
import { BadgeCheck as IconHighQuality } from "lucide-react";
import { Sun as IconLightMode } from "lucide-react";
import { Palette as IconPalette } from "lucide-react";
import { SlidersHorizontal as IconTune } from "lucide-react";
import { Folder as IconMyGenerations } from "lucide-react";
import { Newspaper as IconHowItWorks } from "lucide-react";
import { Newspaper as IconNewspaper } from "lucide-react";
import Sparkles from "@/assets/icon-sparkles-soft.svg?react";
import { Accordion } from "@higgsfield/quanta/accordion";
import { Button } from "@higgsfield/quanta/button";
import { Card } from "@higgsfield/quanta/card";
import { Icon } from "@higgsfield/quanta/icon";
import { Loader } from "@higgsfield/quanta/loader";
import { Modal } from "@higgsfield/quanta/modal";
import { Media } from "@higgsfield/quanta/media";
import { Select } from "@higgsfield/quanta/select";
import { Tabs } from "@higgsfield/quanta/tabs";
import { Typography } from "@higgsfield/quanta/typography";
import { AssetLibraryModal } from "@/components/asset-library";
import type {
  AssetLibraryItem,
  AssetLibraryPagination,
  AssetSelection,
} from "@/components/asset-library";
import { DropzonePreview } from "@/components/dropzone";
import { GenerationTile } from "@/components/generation-card";
import type { CardAction } from "@/components/generation-card";
import { SettingTrigger } from "@/components/setting-trigger";
import { downloadMedia } from "@/lib/download-media";
import { UploadField } from "@/components/upload-field";
import { UserGenerations } from "@/components/user-generations";
import { ScreenEmptyState } from "@/components/screen-empty-state";
import { SignInModal } from "@/components/sign-in-modal";
import { APP_DETAIL_JOBS, GUEST_SCOPE_KEY, generateCampaignCopy, getSignInUrl, uploadAsset } from "@/lib/fnf.browser";
import { createCampaignRecord, duplicateCampaign, getCampaign, listCampaigns, saveCampaignAsset, updateCampaignRecord } from "@/lib/campaigns.browser";
import type { CampaignSummary } from "@/lib/campaigns.browser";
import { flattenMediaPages, getNextCursor } from "@/lib/cursor-pages";
import {
  generationToAssetItem,
  generationToGalleryItem,
  getGenerationFailureLabel,
  mediaRefToAssetItem,
  selectGenerationMedia,
} from "@/lib/higgsfield-generation-results";

/**
 * App-detail screen template (Figma Apps / Animal App, node 3309:86269). The
 * public landing page for a single Higgsfield "app": a two-column generator hero
 * (inputs on the left, a large preview on the right) and a "how it works in 3
 * steps" explainer. Quanta components + tokens only; the app-specific inputs
 * (`Dropzone`) are a small composition in `@/components`. No app header — the
 * Higgsfield host owns that.
 */

const HERO_PREVIEW = "/assets/landing/listingboost-example-campaign.jpg";

type AppDetailGenerationInput = SubmitInputFor<typeof APP_DETAIL_JOBS>;
type CampaignAsset = {
  id: string; title: string; description: string; generationId: string;
  generation?: Generation; mediaType: "image" | "video"; aspectRatio: string;
  previewUrl?: string | null; rawUrl?: string | null;
};
type Campaign = {
  id?: string; listingUrl: string; details: string; assets: CampaignAsset[];
  copy: string; plan: string; eventType: string; brandName: string; cta: string;
  sourceImages: {id:string;type?:string}[];
};
type CampaignProgress = { phase: "idle" | "brief" | "visuals" | "reel" | "copy" | "complete" | "error"; completed: number; total: number; label?: string };
type CampaignConfirmation = { credits: number; generations: number; balance: number | null };
const HISTORY_QUERY = { type: "image" as const, size: 40 };
const VIDEO_HISTORY_QUERY = { type: "video" as const, size: 40 };
const CAMPAIGN_EVENTS = ["New listing","Price reduction","Open house","Under offer","Sold"];

function useRequiredFnfScopeKey(): string {
  const scopeKey = useFnfScopeKey();
  if (scopeKey == null) throw new Error("ListingBoost requires a user/workspace cache scope.");
  return scopeKey;
}

const RESULT_ACTIONS: CardAction[] = [{id:"download",label:"Download",icon:IconDownload},{id:"fullscreen",label:"Full screen",icon:IconFullScreen}];
const COVERS = ["/assets/landing/listingboost-example-campaign.jpg","/assets/landing/listingboost-campaign-types.jpg","/assets/landing/listingboost-showcase-detail.jpg"] as const;
const RATIOS = [{value:"1:1",title:"1:1",subtitle:"Square"},{value:"16:9",title:"16:9",subtitle:"Landscape"},{value:"9:16",title:"9:16",subtitle:"Reel / Story"}];
const STYLES = ["Premium editorial","Cinematic","Bright & natural"];
const QUALITIES = ["Standard","High","Ultra"];
const LIGHTING = ["Natural","Warm interior","Golden hour","Crisp daylight"];
const PICKER_POPUP = {size:"picker",surface:"solid",side:"bottom",align:"start",sideOffset:8,collisionPadding:16} satisfies Partial<Parameters<typeof Select.Content>[0]>;

function SettingSelect({label,icon, value,onChange,options}:{label:string;icon:typeof IconAspectRatio;value:string;onChange:(v:string)=>void;options:string[]}) { return <Select.Root value={value} onValueChange={v=>onChange(String(v))}><Select.Trigger bare render={<SettingTrigger label={label} start={<Icon size="sm" as={icon} />} />}><Select.Value /></Select.Trigger><Select.Content {...PICKER_POPUP}>{options.map(x=><Select.Item key={x} value={x}><Select.ItemText>{x}</Select.ItemText><Select.ItemIndicator /></Select.Item>)}</Select.Content></Select.Root>; }

interface HeroProps { libraryItems: AssetLibraryItem[]; libraryPagination: AssetLibraryPagination; onUpload: (file: File) => Promise<AssetSelection>; }

function CampaignPreview({ compact = false }: { compact?: boolean }) {
  const assets = [
    ["01", "Hero creative", "4:5", "Lead visual"],
    ["02", "Social posts", "1:1 · 4:5", "Feed-ready"],
    ["03", "Stories / Reels", "9:16", "Vertical"],
    ["04", "Just Listed", "4:5", "Launch asset"],
    ["05", "Social copy", "Ready to post", "Verified facts"],
  ];
  return (
    <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-5"}>
      {assets.map(([number, title, meta, description]) => (
        <Card key={number} surface="solid" className="overflow-hidden rounded-q-400 border border-q-border-subtle bg-q-background-primary">
          <div className="aspect-[4/5] p-3 md:p-4">
            <div className="flex h-full flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <Typography as="span" variant="caption-sm-semi-bold" color="secondary">{number}</Typography>
                <span className="rounded-q-200 border border-q-border-subtle px-2 py-1 text-[10px] font-medium uppercase tracking-[0.1em] text-q-text-secondary">{meta}</span>
              </div>
              <div>
                <div className="mb-3 h-16 rounded-q-300 bg-q-background-secondary">
                  <div className="flex h-full items-center justify-center"><div className="h-8 w-8 rounded-full border border-q-border-subtle" /></div>
                </div>
                <Typography as="p" variant="body-sm-semi-bold" color="primary">{title}</Typography>
                <Typography as="p" variant="caption-sm-regular" color="secondary">{description}</Typography>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function MarketingIntro({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-col gap-8 md:gap-10">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="flex flex-col gap-5">
          <Typography as="p" variant="caption-sm-semi-bold" color="secondary" className="uppercase tracking-[0.22em]">
            Property marketing, automated
          </Typography>
          <Typography as="h1" variant="accent-xl-bold" color="primary" className="max-w-3xl text-5xl leading-[0.98] md:text-7xl">
            One listing.<br />
            <span className="text-q-text-secondary">A complete social campaign.</span>
          </Typography>
          <Typography as="p" variant="body-lg-regular" color="secondary" className="max-w-2xl">
            ListingBoost turns your property listing and photography into ready-to-use social creatives, a Property Reel, launch copy and a practical marketing plan — all from one verified property brief.
          </Typography>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="marketingPrimary" size="md" onClick={onCreate}>Create your first campaign</Button>
            <Typography as="p" variant="caption-sm-regular" color="secondary">From £49 per month · Cancel anytime</Typography>
          </div>
        </div>
        <Card surface="solid" className="overflow-hidden rounded-q-600 border border-q-border-subtle bg-q-background-secondary p-2">
          <div className="relative overflow-hidden rounded-q-500">
            <img
              src="/assets/landing/listingboost-cover.png"
              alt="Example ListingBoost campaign showing property creatives, a Property Reel, launch copy and a marketing plan"
              className="h-full w-full object-cover"
            />
            <div className="absolute left-3 top-3 rounded-q-300 border border-white/20 bg-black/70 px-3 py-2 backdrop-blur-sm">
              <Typography as="p" variant="caption-sm-semi-bold" color="primary">EXAMPLE CAMPAIGN</Typography>
              <Typography as="p" variant="caption-sm-regular" color="secondary">One property brief → a complete launch pack</Typography>
            </div>
          </div>
        </Card>
      </div>
      <div className="grid gap-px overflow-hidden rounded-q-500 border border-q-border-subtle bg-q-border-subtle md:grid-cols-3">
        {[
          ["One brief", "Use the listing information and photography you already have."],
          ["Five creatives", "Hero, Square, Story, Just Listed and a Property Reel from one campaign."],
          ["Ready to use", "Get launch copy and a practical marketing plan alongside the creative."],
        ].map(([title, description], index) => (
          <div key={title} className="bg-q-background-primary p-5 md:p-6">
            <Typography as="p" variant="caption-sm-semi-bold" color="secondary">{String(index + 1).padStart(2, "0")}</Typography>
            <Typography as="h2" variant="body-md-semi-bold" color="primary" className="mt-3">{title}</Typography>
            <Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">{description}</Typography>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-q-600 border border-q-border-subtle bg-q-background-secondary">
        <div className="flex flex-col gap-2 border-b border-q-border-subtle p-5 md:flex-row md:items-end md:justify-between md:p-6">
          <div>
            <Typography as="p" variant="caption-sm-semi-bold" color="secondary">SEE IT IN PRACTICE</Typography>
            <Typography as="h2" variant="headline-md-bold" color="primary" className="mt-2">From property photography to campaign assets.</Typography>
          </div>
          <Typography as="p" variant="caption-sm-regular" color="secondary" className="max-w-md">An illustrative example of the campaign ListingBoost is designed to create.</Typography>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-3 md:p-4">
          {[
            ["The property", "Property-led hero creative", "/assets/landing/listingboost-campaign-types.jpg", "Full-size ListingBoost campaign example"],
            ["Social assets", "Hero · Square · Story · Just Listed · Reel", "/assets/landing/listingboost-showcase-practice.jpg", "Full-size ListingBoost social campaign artwork"],
            ["Launch copy & marketing plan", "Ready-to-post caption and a practical plan for results", "/assets/landing/listingboost-showcase-detail.jpg", "Full-size ListingBoost campaign detail artwork"],
          ].map(([title, description, src, alt]) => (
            <div key={title} className="overflow-hidden rounded-q-400 border border-q-border-subtle bg-q-background-primary">
              <div className="overflow-hidden bg-q-background-secondary">
                <img src={src} alt={alt} className="block h-auto w-full" />
              </div>
              <div className="p-4">
                <Typography as="p" variant="body-sm-semi-bold" color="primary">{title}</Typography>
                <Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">{description}</Typography>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Hero({libraryItems,libraryPagination,onUpload,openCampaignId,onNewCampaign}:{libraryItems:AssetLibraryItem[];libraryPagination:AssetLibraryPagination;onUpload:(file:File)=>Promise<AssetSelection>;openCampaignId:string|null;onNewCampaign:()=>void}){
 const jobClient=useFnfJobClient<typeof APP_DETAIL_JOBS>(); const profileClient=useFnfProfileClient(); const scopeKey=useRequiredFnfScopeKey(); const queryClient=useQueryClient();
 const [photos,setPhotos]=useState<AssetSelection[]>([]); const [listingUrl,setListingUrl]=useState(""); const [details,setDetails]=useState(""); const [eventType,setEventType]=useState<string>(CAMPAIGN_EVENTS[0]); const [brandName,setBrandName]=useState(""); const [cta,setCta]=useState("Arrange a viewing"); const [style,setStyle]=useState(STYLES[0]); const [quality,setQuality]=useState("High"); const [lighting,setLighting]=useState("Natural"); const [pendingSignInUrl,setPendingSignInUrl]=useState<string|null>(null);
 const [campaign,setCampaign]=useState<Campaign|null>(null); const [campaignId,setCampaignId]=useState<string|null>(null); const [campaignPlan,setCampaignPlan]=useState<string|null>(null); const [progress,setProgress]=useState<CampaignProgress>({phase:"idle",completed:0,total:5}); const [busy,setBusy]=useState(false); const [preflighting,setPreflighting]=useState(false); const [confirmation,setConfirmation]=useState<CampaignConfirmation|null>(null); const [completedAssets,setCompletedAssets]=useState<CampaignAsset[]>([]); const [campaignCopy,setCampaignCopy]=useState<string|null>(null); const [error,setError]=useState<string|null>(null);
 useEffect(()=>{ if(!openCampaignId)return; let cancelled=false;
   void getCampaign(openCampaignId).then(saved=>{ if(cancelled)return;
     const mapped:Campaign={id:saved.id,listingUrl:saved.listingUrl,details:saved.details,eventType:saved.eventType,brandName:saved.brandName,cta:saved.cta,sourceImages:saved.sourceImages,copy:saved.copy,plan:saved.plan,assets:saved.assets.map(asset=>({id:asset.generationId,title:asset.title,description:asset.description,generationId:asset.generationId,mediaType:asset.mediaType,aspectRatio:asset.aspectRatio,previewUrl:asset.previewUrl,rawUrl:asset.rawUrl}))};
     setCampaignId(saved.id); setCompletedAssets(mapped.assets); setCampaignCopy(saved.copy); setCampaignPlan(saved.plan); setProgress({phase:"complete",completed:5,total:5}); setCampaign(mapped);
   }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"We couldn't open that campaign.");}).finally(()=>{if(!cancelled)setBusy(false);});
   return ()=>{cancelled=true;};
 },[openCampaignId]);
 const photoRefs=photos.flatMap(p=>p.ref?[p.ref]:[]); const buildVideoInput=()=>({model:"seedance_2_5",prompt:{instruction:"Create a polished 5-second estate-agent property reel from the supplied property photography. Preserve the exact architecture, layout, materials, proportions and visible property features. Use subtle premium camera movement and natural environmental motion only. Do not add, remove or invent property features, text, logos, prices or addresses. Campaign event: "+eventType+". "+(brandName.trim()?"Agency brand: "+brandName.trim()+". ":"")+"CTA: "+cta.trim()+". Verified property facts: "+details.trim()},media:{image:photoRefs},settings:{duration:5,resolution:"720p",aspectRatio:"9:16",generateAudio:true,bitrateMode:"high",batchSize:1,model:"default"}}) as AppDetailGenerationInput; const canGenerate=photoRefs.length>0&&details.trim().length>=20&&/^https?:\/\//i.test(listingUrl.trim());
 const addPhoto=(selection:AssetSelection)=>setPhotos(current=>current.some(p=>p.ref?.id===selection.ref?.id)?current:current.length>=6?current:[...current,selection]);
 const removePhoto=(id:string|undefined)=>setPhotos(current=>current.filter(p=>p.ref?.id!==id));
 const buildImageInput=(prompt:string,ratio:"1:1"|"4:5"|"9:16")=>({model:"nano_banana_2",prompt:{instruction:`Create a premium estate-agent marketing creative for a real property. Use the supplied property photographs as the visual source. Preserve real architecture, layout, materials, proportions and visible property features. You may make subtle presentation improvements such as natural lighting, exposure and tasteful staging, but do not invent rooms or structural features. ${prompt} Visual direction: ${style}. Lighting: ${lighting}. Verified property facts: ${details.trim()}. Listing URL is reference context only: ${listingUrl.trim()}. Do not add logos, agency branding, prices, addresses or text unless explicitly requested.`},media:{image:photoRefs},settings:{aspectRatio:ratio,resolution:quality==="Ultra"?"4k":quality==="High"?"2k":"1k",batchSize:1}}) as AppDetailGenerationInput;
 const specs=[
   ["Hero","Main hero image: premium, realistic presentation of the property, editorial estate-agent photography.","4:5"],
   ["Square","Square feed creative for Instagram and Facebook, property-first with subtle marketing polish.","1:1"],
   ["Story","Vertical story creative: immersive, uncluttered and immediately understandable as a property listing.","9:16"],
   ["Just Listed","Distinct announcement creative for a new listing. Keep the property visually dominant and use restrained visual hierarchy; do not add text.","4:5"]] as const;
 const preflightCampaign=async()=>{
   if(!canGenerate||busy||preflighting)return;
   const signInUrl=getSignInUrl(scopeKey,`${window.location.pathname}${window.location.search}${window.location.hash}`); if(signInUrl!=null){setPendingSignInUrl(signInUrl);return;}
   setPreflighting(true); setError(null);
   try{
     const remaining=specs.slice(completedAssets.length);
     if(remaining.length===0){ setConfirmation({credits:0,generations:0,balance:null}); return; }
     const [estimates,balance]=await Promise.all([
       Promise.all(remaining.map(([,prompt,ratio])=>jobClient.cost(buildImageInput(prompt,ratio)))),
       profileClient.getCredits({includeOnDemand:true}).catch(()=>null),
     ]);
     const videoEstimate=completedAssets.length===4?await jobClient.cost(buildVideoInput()):null; const credits=estimates.reduce((sum,item)=>sum+Number(item.credits||0),0)+(videoEstimate?.credits??0);
     setConfirmation({credits,generations:remaining.length+(completedAssets.length===4?1:0),balance:balance?.totalAvailableCredits??null});
   }catch(e){setError(e instanceof Error?e.message:"We couldn't calculate the campaign cost. No campaign has been started.");}
   finally{setPreflighting(false);}
 };
 const runCampaign=async()=>{
   if(busy)return;
   setConfirmation(null); setBusy(true); setError(null); setProgress({phase:"brief",completed:completedAssets.length,total:5});
   try{
     let savedId=campaignId;
     if(!savedId){
       const created=await createCampaignRecord({listingUrl:listingUrl.trim(),details:details.trim(),eventType:eventType as "New listing" | "Price reduction" | "Open house" | "Under offer" | "Sold",brandName:brandName.trim(),cta:cta.trim()||"Arrange a viewing",sourceImages:photoRefs.map(ref=>({id:ref.id,type:ref.type}))});
       savedId=created.id; setCampaignId(savedId);
     }
     const assets=[...completedAssets];
     for(let i=assets.length;i<specs.length;i++){
       setProgress({phase:"visuals",completed:i,total:5,label:"Creating "+specs[i][0]+" · "+(i+1)+" of "+specs.length});
       const submitted=await jobClient.submit(buildImageInput(specs[i][1],specs[i][2]));
       const settled=await jobClient.wait(submitted.generations); const generation=settled[0];
       if(!generation)throw new Error(specs[i][0]+" did not return an image.");
       const asset={id:generation.id,title:specs[i][0],description:specs[i][1],generationId:generation.id,mediaType:"image" as const,aspectRatio:specs[i][2],generation};
       await saveCampaignAsset({campaignId:savedId,title:asset.title,description:asset.description,generationId:asset.generationId,mediaType:asset.mediaType,aspectRatio:asset.aspectRatio});
       assets.push(asset); setCompletedAssets([...assets]); prependGenerations(queryClient,HISTORY_QUERY,[generation],{scopeKey});
     }
     const hasReel=assets.some(asset=>asset.title==="Property Reel");
     if(!hasReel){
       setProgress({phase:"reel",completed:4,total:5,label:"Creating Property Reel · 5 of 5"});
       const reelSubmitted=await jobClient.submit(buildVideoInput()); const reelSettled=await jobClient.wait(reelSubmitted.generations); const reel=reelSettled[0];
       if(!reel)throw new Error("Property Reel did not return a video.");
       const reelAsset={id:reel.id,title:"Property Reel",description:"5-second vertical property reel.",generationId:reel.id,mediaType:"video" as const,aspectRatio:"9:16",generation:reel};
       await saveCampaignAsset({campaignId:savedId,title:reelAsset.title,description:reelAsset.description,generationId:reelAsset.generationId,mediaType:reelAsset.mediaType,aspectRatio:reelAsset.aspectRatio});
       assets.push(reelAsset); setCompletedAssets(assets); prependGenerations(queryClient,VIDEO_HISTORY_QUERY,[reel],{scopeKey});
     }
     setProgress({phase:"copy",completed:5,total:5});
     const copy=campaignCopy??await generateCampaignCopy("Write a polished launch caption for this UK estate-agent property. Use only the verified facts below. Keep it around 70-110 words. Start with a natural headline, describe the strongest factual features, and end with a clear invitation to arrange a viewing. Do not mention AI. Do not invent a price, location, room count or feature.\n\nVerified facts: "+details.trim());
     const plan=campaignPlan??await generateCampaignCopy("Create a concise practical social marketing plan for a UK estate agent promoting this property campaign. Include campaign objective, posting sequence for four image creatives and the Property Reel, suggested timing, channel adaptation notes and an agent checklist. Use only verified property facts. Do not invent performance claims, prices, locations or features.\n\nVerified facts: "+details.trim());
     setCampaignCopy(copy); setCampaignPlan(plan); await updateCampaignRecord({campaignId:savedId,status:"ready",copy,plan});
     setProgress({phase:"complete",completed:5,total:5});
     setCampaign({id:savedId,listingUrl:listingUrl.trim(),details:details.trim(),assets,copy,plan,eventType,brandName:brandName.trim(),cta:cta.trim()||"Arrange a viewing",sourceImages:photoRefs});
     void queryClient.invalidateQueries({queryKey:["listingboost","campaigns",scopeKey]});
   }catch(e){
     if(campaignId)void updateCampaignRecord({campaignId,status:"failed"}).catch(()=>undefined);
     setError(e instanceof Error?e.message:"The campaign could not be completed. Completed creatives have been kept; retry will resume from the point of failure.");
     setProgress(p=>({...p,phase:"error"}));
   }finally{setBusy(false);}
 };
 const createCampaign=async()=>{await preflightCampaign();};
 const resetCampaign=()=>{setCampaign(null);setCampaignId(null);setPhotos([]);setListingUrl("");setDetails("");setCompletedAssets([]);setCampaignCopy(null);setCampaignPlan(null);setEventType(CAMPAIGN_EVENTS[0]);setBrandName("");setCta("Arrange a viewing");setConfirmation(null);setError(null);setProgress({phase:"idle",completed:0,total:5});onNewCampaign();};
 if(campaign)return <CampaignWorkspace campaign={campaign} onNew={resetCampaign}/>;
 return <><MarketingIntro onCreate={()=>document.getElementById("create-campaign")?.scrollIntoView({behavior:"smooth",block:"start"})}/><div id="create-campaign" className="scroll-mt-6"><Card surface="solid" className="flex flex-col gap-2 rounded-q-600 border border-q-border-subtle p-2 lg:h-[680px] lg:flex-row"><SignInModal open={pendingSignInUrl!=null} signInUrl={pendingSignInUrl} onOpenChange={open=>{if(!open)setPendingSignInUrl(null)}}/>
 <Modal.Root open={confirmation!=null} onOpenChange={open=>{if(!open&&!busy)setConfirmation(null)}}><Modal.Content size="sm"><Modal.Header><Modal.Title>Before you create the campaign</Modal.Title><Modal.CloseButton/></Modal.Header><Modal.Body><div className="flex flex-col gap-4"><Typography as="p" variant="body-md-regular" color="primary">ListingBoost uses {confirmation?.generations ?? 0} paid generations for this campaign — four images and one Property Reel — using your Higgsfield credits. It will not publish anything to your social accounts.</Typography><div className="rounded-q-300 border border-q-border-subtle bg-q-background-secondary p-4"><div className="flex items-baseline justify-between gap-4"><Typography as="p" variant="body-sm-semi-bold" color="primary">Estimated credit use</Typography><Typography as="p" variant="headline-sm-bold" color="primary">{confirmation?.credits.toFixed(2)} credits</Typography></div>{confirmation?.balance!=null?<Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">Available balance: {confirmation.balance.toFixed(2)} credits</Typography>:<Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">Your exact balance is managed by Higgsfield.</Typography>}</div><Typography as="p" variant="caption-sm-regular" color="secondary">This is a cost estimate for the four image generations and the Property Reel. The launch caption and marketing plan are created separately. If a generation fails, ListingBoost keeps completed creatives and retry starts from the remaining step rather than rerunning completed generations.</Typography></div></Modal.Body><Modal.Footer><Modal.FooterActions full><Button variant="tertiary" size="md" onClick={()=>setConfirmation(null)}>Cancel</Button><Button variant="marketingPrimary" size="md" onClick={()=>void runCampaign()} disabled={busy}>{confirmation?.generations===0?"Finish campaign":"Use credits & create campaign"}</Button></Modal.FooterActions></Modal.Footer></Modal.Content></Modal.Root>
 <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-q-background-secondary px-4 py-5 lg:h-full"><div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1 lg:pb-28">
  <div className="flex flex-col gap-2"><Typography as="p" variant="caption-sm-semi-bold" color="secondary" className="uppercase tracking-[0.18em]">Create a campaign</Typography><Typography as="h2" variant="headline-md-bold" color="primary">Turn your listing into marketing content.</Typography><Typography as="p" variant="body-sm-regular" color="secondary">Add your listing information and photography. ListingBoost creates platform-ready campaign assets and launch copy for you.</Typography></div>
  <div className="flex flex-col gap-3"><div className="flex items-center justify-between"><Typography as="p" variant="body-sm-semi-bold" color="primary">1. Add the property</Typography><Typography as="p" variant="caption-sm-regular" color="secondary">Verified facts only</Typography></div><input aria-label="Listing URL" type="url" value={listingUrl} onChange={e=>setListingUrl(e.target.value)} placeholder="Rightmove / Zoopla listing URL" className="min-h-12 rounded-q-300 border border-q-border-subtle bg-q-background-primary px-4 text-q-body-md-regular text-q-text-primary outline-none focus-visible:ring-2 focus-visible:ring-q-border-focus"/><Typography as="p" variant="caption-sm-regular" color="secondary">For the beta, the URL is reference only — enter the verified property facts below.</Typography><textarea aria-label="Verified property facts" value={details} onChange={e=>setDetails(e.target.value)} placeholder="Verified facts: 4-bed home, kitchen extension, south-facing garden, £650,000…" rows={3} className="resize-none rounded-q-300 border border-q-border-subtle bg-q-background-primary px-4 py-3 text-q-body-md-regular text-q-text-primary outline-none focus-visible:ring-2 focus-visible:ring-q-border-focus"/></div>
  <div className="grid gap-3 sm:grid-cols-2"><div className="flex flex-col gap-2"><Typography as="p" variant="body-sm-semi-bold" color="primary">2. Campaign event</Typography><SettingSelect label="Event" icon={IconNewspaper} value={eventType} onChange={setEventType} options={CAMPAIGN_EVENTS}/></div><div className="flex flex-col gap-2"><Typography as="p" variant="body-sm-semi-bold" color="primary">3. Agency brand & CTA</Typography><input aria-label="Agency name" value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder="Agency name (optional)" className="min-h-12 rounded-q-300 border border-q-border-subtle bg-q-background-primary px-4"/><input aria-label="Campaign CTA" value={cta} onChange={e=>setCta(e.target.value)} placeholder="Arrange a viewing" className="min-h-12 rounded-q-300 border border-q-border-subtle bg-q-background-primary px-4"/></div></div>
  <div className="flex flex-col gap-3"><div className="flex items-center justify-between"><div><Typography as="p" variant="body-sm-semi-bold" color="primary">4. Add property photography</Typography><Typography as="p" variant="caption-sm-regular" color="secondary">Up to 6 photos · the strongest set is used across the campaign</Typography></div><Typography as="p" variant="caption-sm-semi-bold" color="secondary">{photos.length}/6</Typography></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">{photos.map(photo=><div key={photo.ref?.id??photo.src} className="group relative aspect-[4/3] overflow-hidden rounded-q-300 border border-q-border-subtle bg-q-background-primary"><img src={photo.src} alt={photo.name} className="h-full w-full object-cover"/><button type="button" aria-label={`Remove ${photo.name}`} onClick={()=>removePhoto(photo.ref?.id)} className="absolute right-2 top-2 hidden h-7 w-7 place-items-center rounded-full bg-black/70 text-white group-hover:grid">×</button></div>)}{photos.length<6?<AssetLibraryModal imageOnly items={libraryItems} pagination={libraryPagination} onUpload={onUpload} onSelect={addPhoto} trigger={<UploadField render={<button type="button"/>} icon={IconAddPhoto} title="Add photos" subtitle="Upload or choose from your library"/>}/>:null}</div></div>
  <Accordion.Root multiple={false} variant="list"><Accordion.Item value="settings"><Accordion.Trigger start={<Icon size="sm" as={IconTune}/>}>Advanced creative settings</Accordion.Trigger><Accordion.Panel><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><SettingSelect label="Visual direction" icon={IconPalette} value={style} onChange={setStyle} options={STYLES}/><SettingSelect label="Quality" icon={IconHighQuality} value={quality} onChange={setQuality} options={QUALITIES}/><SettingSelect label="Lighting" icon={IconLightMode} value={lighting} onChange={setLighting} options={LIGHTING}/></div></Accordion.Panel></Accordion.Item></Accordion.Root>
  <div className="mt-1 flex flex-col gap-3 rounded-q-400 border border-q-border-subtle bg-q-background-primary p-4"><div className="flex flex-col gap-2"><Typography as="p" variant="caption-sm-regular" color="secondary">Only verified facts are used. Subtle enhancement may improve presentation, but ListingBoost does not invent property details.</Typography><Typography as="p" variant="caption-sm-regular" color="secondary">A campaign uses five paid generations: four images and one Property Reel. You'll see the estimated credit use before anything is generated.</Typography></div>{error?<div className="flex flex-col gap-2 rounded-q-300 border border-q-border-error bg-q-state-error-bg p-3"><Typography as="p" variant="caption-sm-regular" color="danger" role="alert">{error}</Typography><Button variant="tertiary" size="xs" onClick={()=>void preflightCampaign()}>Review remaining cost & retry</Button></div>:null}</div></div><div className="relative shrink-0 pt-2 lg:pointer-events-none lg:absolute lg:inset-x-4 lg:bottom-5"><Button variant="marketingPrimary" size="lg" className="pointer-events-auto relative w-full" disabled={!canGenerate||busy||preflighting} onClick={()=>void createCampaign()} end={busy||preflighting?<Loader size="xs" color="neutral"/>:<Sparkles width={18} height={18}/>}>{busy?"Creating your campaign":preflighting?"Checking credit use…":photos.length===0?"Add photography to continue":completedAssets.length>0?"Review remaining cost & retry":"Review cost & create campaign"}</Button></div></div>
  <div className="relative flex min-h-[420px] flex-1 flex-col justify-center gap-5 rounded-q-500 bg-q-background-primary p-5"><CampaignProgress progress={progress} busy={busy}/><Typography as="p" variant="caption-sm-regular" color="secondary">Four image generations plus one Property Reel, then AI-written launch copy and a marketing plan. Nothing is published automatically.</Typography></div></Card></div></>;
}
function CampaignProgress({progress,busy}:{progress:CampaignProgress;busy:boolean}){const rows=["Reading property brief","Creating image creatives","Creating Property Reel","Writing launch copy","Campaign ready"];const active=progress.phase==="brief"?0:progress.phase==="visuals"?1:progress.phase==="reel"?2:progress.phase==="copy"?3:progress.phase==="complete"?4:-1;return <div className="flex flex-col gap-4"><div><Typography as="p" variant="caption-sm-semi-bold" color="secondary">CAMPAIGN BUILDER</Typography><Typography as="h3" variant="headline-md-bold" color="primary" className="mt-2">{busy?"Building your campaign":"Ready to create"}</Typography></div><div className="flex flex-col gap-2">{rows.map((label,i)=><div key={label} className="flex items-center gap-3 rounded-q-300 border border-q-border-subtle bg-q-background-secondary px-3 py-3"><div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs ${i<active||(i===4&&progress.phase==="complete")?"border-q-border-success text-q-text-success":"border-q-border-subtle text-q-text-secondary"}`}>{i<active||(i===4&&progress.phase==="complete")?"✓":i===active?"…":i+1}</div><Typography as="p" variant="body-sm-regular" color={i<=active?"primary":"secondary"}>{label}</Typography></div>)}</div>{busy?<Typography as="p" variant="caption-sm-regular" color="secondary">{progress.label??"Working through the campaign steps…"}</Typography>:null}</div>}

function CampaignWorkspace({campaign,onNew}:{campaign:Campaign;onNew:()=>void}){
 const jobClient=useFnfJobClient<typeof APP_DETAIL_JOBS>(); const profileClient=useFnfProfileClient(); const scopeKey=useRequiredFnfScopeKey(); const queryClient=useQueryClient();
 const [current,setCurrent]=useState(campaign);
 const [copied,setCopied]=useState(false); const [refineAssetId,setRefineAssetId]=useState<string|null>(null); const [refineInstruction,setRefineInstruction]=useState(""); const [refineCost,setRefineCost]=useState<number|null>(null); const [refineBalance,setRefineBalance]=useState<number|null>(null); const [refinePreflighting,setRefinePreflighting]=useState(false); const [refineBusy,setRefineBusy]=useState(false); const [refineError,setRefineError]=useState<string|null>(null);
 const selected=current.assets.find(asset=>asset.id===refineAssetId)??null;
 const copyCaption=async()=>{try{await navigator.clipboard?.writeText(current.copy);setCopied(true);}catch{setCopied(false);}};
 const ratioFor=(title:string)=>title.startsWith("Square")?"1:1":title.startsWith("Story")||title==="Property Reel"?"9:16":"4:5";
 const buildRefineInput=(asset:CampaignAsset)=>{
   const instruction=refineInstruction.trim()||"Refresh this creative while keeping the same overall property presentation and campaign role.";
   if(asset.title==="Property Reel") return {model:"seedance_2_5",prompt:{instruction:`Create a polished 5-second estate-agent property reel from the supplied property photography. Preserve the exact architecture, layout, materials, proportions and visible property features. Apply this requested refinement: ${instruction} Do not add, remove or invent property features, text, logos, prices or addresses. Campaign event: ${current.eventType}. CTA: ${current.cta}. Verified property facts: ${current.details}`},media:{image:current.sourceImages},settings:{duration:5,resolution:"720p",aspectRatio:"9:16",generateAudio:true,bitrateMode:"high",batchSize:1,model:"default"}} as AppDetailGenerationInput;
   return {model:"nano_banana_2",prompt:{instruction:`Create a premium estate-agent marketing creative for a real property. Use the supplied property photography as the visual source. Preserve real architecture, layout, materials, proportions and visible property features. Apply this requested refinement: ${instruction} Keep the creative role as ${asset.title}. Do not invent rooms or structural features, and do not add logos, prices, addresses or unsupported text. Verified property facts: ${current.details}`},media:{image:current.sourceImages},settings:{aspectRatio:ratioFor(asset.title),resolution:"2k",batchSize:1}} as AppDetailGenerationInput;
 };
 const openRefine=async(asset:CampaignAsset)=>{setRefineAssetId(asset.id);setRefineInstruction("");setRefineCost(null);setRefineBalance(null);setRefineError(null);setRefinePreflighting(true);try{const input=buildRefineInput(asset);const [estimate,balance]=await Promise.all([jobClient.cost(input),profileClient.getCredits({includeOnDemand:true}).catch(()=>null)]);setRefineCost(Number(estimate.credits||0));setRefineBalance(balance?.totalAvailableCredits??null);}catch(e){setRefineError(e instanceof Error?e.message:"We couldn't calculate the regeneration cost.");}finally{setRefinePreflighting(false);}};
 const closeRefine=()=>{if(!refineBusy){setRefineAssetId(null);setRefineInstruction("");setRefineCost(null);setRefineError(null);}};
 const regenerate=async()=>{if(!selected||refineBusy)return;setRefineBusy(true);setRefineError(null);try{const submitted=await jobClient.submit(buildRefineInput(selected));const settled=await jobClient.wait(submitted.generations);const generation=settled[0];if(!generation)throw new Error(`${selected.title} did not return a result.`);const replacement={...selected,id:generation.id,generationId:generation.id,generation,mediaType:selected.title==="Property Reel"?"video" as const:"image" as const,aspectRatio:ratioFor(selected.title)};
   if(current.id)await saveCampaignAsset({campaignId:current.id,title:selected.title,description:selected.description,generationId:generation.id,mediaType:replacement.mediaType,aspectRatio:replacement.aspectRatio});
   setCurrent(previous=>({...previous,assets:previous.assets.map(asset=>asset.id===selected.id?replacement:asset)}));
   prependGenerations(queryClient,selected.title==="Property Reel"?VIDEO_HISTORY_QUERY:HISTORY_QUERY,[generation],{scopeKey});
   if(current.id)void queryClient.invalidateQueries({queryKey:["listingboost","campaigns",scopeKey]});
   closeRefine();}catch(e){setRefineError(e instanceof Error?e.message:"The creative could not be regenerated. Your existing creative has been kept.");}finally{setRefineBusy(false);}};
 return <div className="flex flex-col gap-6">
  <Modal.Root open={selected!=null} onOpenChange={open=>{if(!open)closeRefine();}}><Modal.Content size="sm"><Modal.Header><Modal.Title>Refine {selected?.title}</Modal.Title><Modal.CloseButton/></Modal.Header><Modal.Body><div className="flex flex-col gap-4"><Typography as="p" variant="body-sm-regular" color="secondary">Describe the change you want. ListingBoost keeps the verified property facts and regenerates only this creative.</Typography><textarea aria-label="Refinement instructions" value={refineInstruction} onChange={e=>setRefineInstruction(e.target.value)} placeholder="e.g. Brighter natural light, less cinematic, make the garden feel more prominent…" rows={4} className="resize-none rounded-q-300 border border-q-border-subtle bg-q-background-primary px-4 py-3 text-q-body-md-regular text-q-text-primary outline-none focus-visible:ring-2 focus-visible:ring-q-border-focus"/>{refinePreflighting?<div className="flex items-center gap-2"><Loader size="xs" color="neutral"/><Typography as="p" variant="caption-sm-regular" color="secondary">Checking regeneration cost…</Typography></div>:refineCost!=null?<div className="rounded-q-300 border border-q-border-subtle bg-q-background-secondary p-4"><div className="flex items-baseline justify-between gap-4"><Typography as="p" variant="body-sm-semi-bold" color="primary">Estimated credit use</Typography><Typography as="p" variant="headline-sm-bold" color="primary">{refineCost.toFixed(2)} credits</Typography></div>{refineBalance!=null?<Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">Available balance: {refineBalance.toFixed(2)} credits</Typography>:null}</div>:null}{refineError?<Typography as="p" variant="caption-sm-regular" color="danger" role="alert">{refineError}</Typography>:null}<Typography as="p" variant="caption-sm-regular" color="secondary">Only this asset is regenerated. Your other campaign assets remain unchanged.</Typography></div></Modal.Body><Modal.Footer><Modal.FooterActions full><Button variant="tertiary" size="md" onClick={closeRefine} disabled={refineBusy}>Cancel</Button><Button variant="marketingPrimary" size="md" onClick={()=>void regenerate()} disabled={refinePreflighting||refineBusy||refineCost==null}>{refineBusy?"Regenerating…":`Use ${refineCost?.toFixed(2)??"—"} credits & regenerate`}</Button></Modal.FooterActions></Modal.Footer></Modal.Content></Modal.Root>
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><Typography as="p" variant="caption-sm-semi-bold" color="secondary">YOUR CAMPAIGN · {current.eventType.toUpperCase()}</Typography><Typography as="h2" variant="headline-lg-bold" color="primary">Your campaign is ready.</Typography><Typography as="p" variant="body-sm-regular" color="secondary" className="mt-1">Download the creatives, refine individual assets and use the launch copy in your social workflow.</Typography></div><Button variant="tertiary" size="sm" onClick={onNew}>New campaign</Button></div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{current.assets.map(asset=><CampaignAssetCard key={asset.id} asset={asset} onRefine={()=>void openRefine(asset)}/>)}</div>
  <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]"><Card surface="solid" className="rounded-q-500 border border-q-border-subtle p-5"><Typography as="p" variant="caption-sm-semi-bold" color="secondary">AI-WRITTEN COPY</Typography><Typography as="h3" variant="headline-sm-bold" color="primary" className="mt-1">Launch caption</Typography><Typography as="p" variant="body-md-regular" color="secondary" className="mt-4 whitespace-pre-wrap">{current.copy}</Typography><Button className="mt-4" variant="ghost" size="xs" onClick={()=>void copyCaption()}>{copied?"Copied ✓":"Copy caption"}</Button></Card><Card surface="solid" className="rounded-q-500 border border-q-border-subtle p-5"><Typography as="p" variant="caption-sm-semi-bold" color="secondary">MARKETING PLAN</Typography><Typography as="h3" variant="headline-sm-bold" color="primary" className="mt-1">What to do next</Typography><Typography as="p" variant="body-sm-regular" color="secondary" className="mt-3 whitespace-pre-wrap">{current.plan}</Typography><div className="mt-5 rounded-q-300 border border-q-border-subtle bg-q-background-secondary p-3"><Typography as="p" variant="caption-sm-semi-bold" color="primary">NEXT</Typography><Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">Event: {current.eventType} · CTA: {current.cta}{current.brandName?" · "+current.brandName:""}. Review before publishing; ListingBoost does not publish automatically.</Typography></div></Card></div>
 </div>;
}
function CampaignAssetCard({asset,onRefine}:{asset:CampaignAsset;onRefine:()=>void}){
 const generated=asset.generation?selectGenerationMedia(asset.generation):null;
 const isVideo=asset.mediaType==="video";
 const previewUrl=generated?.kind==="image"||generated?.kind==="video"?generated.rawUrl:asset.previewUrl??asset.rawUrl??null;
 const rawUrl=generated?.kind==="image"||generated?.kind==="video"?generated.rawUrl:asset.rawUrl??null;
 const generationId=asset.generation?.id??asset.generationId;
 return <Card surface="solid" className="overflow-hidden rounded-q-500 border border-q-border-subtle">
  <div className="grid place-items-center overflow-hidden bg-q-background-secondary" style={{aspectRatio:asset.aspectRatio.replace(":", " / ")}}>{isVideo&&rawUrl?<video src={rawUrl} controls playsInline className="h-full w-full object-cover"/>:!isVideo&&previewUrl?<img src={previewUrl} alt={asset.title} className="h-full w-full object-cover"/>:<div className="p-4"><Typography as="p" variant="caption-sm-regular" color="secondary">Media unavailable</Typography></div>}</div>
  <div className="flex flex-col gap-2 p-4"><Typography as="h3" variant="body-md-semi-bold" color="primary">{asset.title}</Typography><Typography as="p" variant="caption-sm-regular" color="secondary">{isVideo?"5-second vertical property reel.":"Ready-to-use campaign creative."}</Typography>
   <div className="grid grid-cols-2 gap-2"><Button variant="tertiary" size="sm" onClick={onRefine}>Refine</Button><Button variant="tertiary" size="sm" disabled={!rawUrl} onClick={()=>rawUrl&&void downloadMedia(rawUrl,"listingboost-"+asset.title.toLowerCase().replaceAll(" ","-").replaceAll("/","-")+"."+(isVideo?"mp4":"jpg"),generationId,isVideo?"video":"image")}>Download</Button></div>
  </div>
 </Card>;
}

function CampaignLibrary({campaigns,onOpen,onDuplicate}:{campaigns:CampaignSummary[];onOpen:(id:string)=>void;onDuplicate:(id:string)=>Promise<void>}){
 const [duplicatingId,setDuplicatingId]=useState<string|null>(null);
 if(campaigns.length===0)return <ScreenEmptyState images={[COVERS[0],COVERS[1],COVERS[2]]} title="No campaigns yet" description="Create your first property campaign and it will stay here, ready to reopen or duplicate." />;
 return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{campaigns.map(campaign=>{
   const host=campaign.listingUrl.replace(/^https?:\/\//i,"").split("/")[0];
   return <Card key={campaign.id} surface="solid" className="flex min-h-56 flex-col justify-between rounded-q-500 border border-q-border-subtle p-5">
    <div className="flex flex-col gap-3"><div className="flex items-center justify-between gap-3"><Typography as="p" variant="caption-sm-semi-bold" color="secondary">{campaign.eventType.toUpperCase()}</Typography><Typography as="p" variant="caption-sm-regular" color="secondary">{campaign.updatedAt.slice(0,10)}</Typography></div>
    <div><Typography as="h3" variant="headline-sm-bold" color="primary">{host}</Typography><Typography as="p" variant="body-sm-regular" color="secondary" className="mt-1">{campaign.assetCount} campaign assets{campaign.brandName?" · "+campaign.brandName:""}</Typography></div></div>
    <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="tertiary" size="sm" onClick={()=>onOpen(campaign.id)}>Open</Button><Button variant="tertiary" size="sm" disabled={duplicatingId===campaign.id} onClick={async()=>{setDuplicatingId(campaign.id);try{await onDuplicate(campaign.id)}finally{setDuplicatingId(null)}}}>{duplicatingId===campaign.id?"Duplicating…":"Duplicate"}</Button></div>
   </Card>;
 })}</div>;
}

export function AppDetailTemplate() {
  const jobClient = useFnfJobClient<typeof APP_DETAIL_JOBS>();
  const mediaClient = useFnfMediaClient();
  const scopeKey = useRequiredFnfScopeKey();
  const queryClient = useQueryClient();
  const [localUploads, setLocalUploads] = useState<AssetLibraryItem[]>([]);
  const [activeTab, setActiveTab] = useState("how-it-works");
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null);
  const [pendingSignInUrl, setPendingSignInUrl] = useState<string | null>(null);

  const handleTabChange = (tab:string) => {
    if(tab==="my-campaigns"){
      const returnPath=window.location.pathname+window.location.search+window.location.hash;
      const signInUrl=getSignInUrl(scopeKey,returnPath);
      if(signInUrl!=null){setPendingSignInUrl(signInUrl);return;}
    }
    setActiveTab(tab);
  };

  const history = useInfiniteQuery({
    ...jobsFeedQueryOptions(jobClient,HISTORY_QUERY,{scopeKey}),
    getNextPageParam:getNextCursor,
    select:flattenFeedPages,
  });
  const campaigns = useQuery({
    queryKey:["listingboost","campaigns",scopeKey],
    queryFn:listCampaigns,
    enabled:scopeKey!==GUEST_SCOPE_KEY && activeTab==="my-campaigns",
    staleTime:15_000,
  });
  const persistedUploads = useInfiniteQuery({
    queryKey:["fnf","scope",scopeKey,"media","image"],
    queryFn:({pageParam})=>mediaClient.list({type:"image",size:40,...(pageParam!==undefined?{cursor:pageParam}:{})}),
    initialPageParam:undefined as string|number|undefined,
    getNextPageParam:getNextCursor,
    select:flattenMediaPages,
    staleTime:30_000,
    refetchOnWindowFocus:false,
  });
  const historySnapshots=useMemo(()=>history.data??[],[history.data]);
  useLiveFeedGenerations(jobClient,historySnapshots,{scopeKey});
  const generations=historySnapshots;
  const libraryItems=useMemo(()=>{
    const localIds=new Set(localUploads.map(item=>item.ref?.id));
    return [...localUploads,...(persistedUploads.data??[]).filter(ref=>!localIds.has(ref.id)).map(mediaRefToAssetItem).filter((item):item is AssetLibraryItem=>item!=null),...generations.map(generationToAssetItem).filter((item):item is AssetLibraryItem=>item!=null)];
  },[generations,localUploads,persistedUploads.data]);

  const loadMoreUploads=persistedUploads.data==null || (persistedUploads.error!=null && !persistedUploads.isFetchNextPageError) ? persistedUploads.refetch : persistedUploads.fetchNextPage;
  const loadMoreHistory=history.data==null || (history.error!=null && !history.isFetchNextPageError) ? history.refetch : history.fetchNextPage;
  const libraryPagination=useMemo<AssetLibraryPagination>(()=>({
    uploads:{hasMore:persistedUploads.hasNextPage===true,loading:persistedUploads.isPending||persistedUploads.isFetchingNextPage,...(persistedUploads.error instanceof Error?{error:persistedUploads.error.message}:{}),onLoadMore:loadMoreUploads},
    image:{hasMore:history.hasNextPage===true,loading:history.isPending||history.isFetchingNextPage,...(history.error instanceof Error?{error:history.error.message}:{}),onLoadMore:loadMoreHistory},
  }),[history.error,history.hasNextPage,history.isFetchingNextPage,history.isPending,loadMoreHistory,loadMoreUploads,persistedUploads.error,persistedUploads.hasNextPage,persistedUploads.isFetchingNextPage,persistedUploads.isPending]);

  const handleUpload=async(file:File):Promise<AssetSelection>=>{
    const uploaded=await uploadAsset(file);
    const item={...uploaded,kind:"upload" as const,personal:true};
    setLocalUploads(current=>[item,...current.filter(candidate=>candidate.ref?.id!==uploaded.ref?.id)]);
    return item;
  };

  return <div className="min-h-dvh bg-q-background-primary">
    <SignInModal open={pendingSignInUrl!=null} signInUrl={pendingSignInUrl} onOpenChange={open=>{if(!open)setPendingSignInUrl(null)}}/>
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-6 md:gap-14 md:px-8 md:py-8">
      <div id="app"><Hero libraryItems={libraryItems} libraryPagination={libraryPagination} onUpload={handleUpload} openCampaignId={openCampaignId} onNewCampaign={()=>setOpenCampaignId(null)}/></div>
      <Tabs.Root variant="segmented" value={activeTab} onValueChange={value=>handleTabChange(String(value))} className="flex! min-h-0 w-full flex-col gap-5">
        <Tabs.List className="self-start" items={[
          {value:"how-it-works",label:"How it works",start:<Icon size="sm" as={IconHowItWorks}/>},
          {value:"my-campaigns",label:"My campaigns",start:<Icon size="sm" as={IconMyGenerations}/>}
        ]}/>
        <Tabs.Panel value="how-it-works" className="pt-0">
          <div className="grid gap-px overflow-hidden rounded-q-500 border border-q-border-subtle bg-q-border-subtle md:grid-cols-3">
            {[["01","Add your listing","Paste the listing URL and provide the verified facts you want reflected."],["02","Add your photography","Upload the property photography you already use for the listing."],["03","Get your campaign","Create a coordinated set of social creatives and copy in minutes."]].map(([number,title,description])=>
              <div key={number} className="bg-q-background-secondary p-6"><Typography as="p" variant="caption-sm-semi-bold" color="secondary">{number}</Typography><Typography as="h3" variant="body-md-semi-bold" color="primary" className="mt-4">{title}</Typography><Typography as="p" variant="body-sm-regular" color="secondary" className="mt-2">{description}</Typography></div>
            )}
          </div>
        </Tabs.Panel>
        <Tabs.Panel value="my-campaigns" className="pt-0">
          <section className="min-h-[480px]">
            {campaigns.isPending ? <div className="flex min-h-[480px] items-center justify-center"><Loader size="md" color="neutral" aria-label="Loading campaigns"/></div>
            : campaigns.error ? <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 text-center"><Typography as="p" variant="body-sm-regular" color="danger">{campaigns.error instanceof Error?campaigns.error.message:"We couldn't load your campaigns."}</Typography><Button variant="tertiary" size="sm" onClick={()=>void campaigns.refetch()}>Retry</Button></div>
            : <CampaignLibrary campaigns={campaigns.data??[]} onOpen={id=>{setOpenCampaignId(id);setActiveTab("how-it-works")}} onDuplicate={async id=>{const result=await duplicateCampaign(id);await queryClient.invalidateQueries({queryKey:["listingboost","campaigns",scopeKey]});setOpenCampaignId(result.id);setActiveTab("how-it-works")}}/>}
          </section>
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  </div>;
}
