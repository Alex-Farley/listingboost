import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SubmitInputFor } from "@higgsfield/fnf/client";
import {
  costQueryOptions,
  flattenFeedPages,
  jobsFeedQueryOptions,
  prependGenerations,
  useFnfJobClient,
  useFnfMediaClient,
  useFnfScopeKey,
  useGenerationRun,
  useLiveFeedGenerations,
} from "@higgsfield/fnf-react";
import { ImagePlus as IconAddPhoto } from "lucide-react";
import { Proportions as IconAspectRatio } from "lucide-react";
import { Download as IconDownload } from "lucide-react";
import { Maximize as IconFullScreen } from "lucide-react";
import { BadgeCheck as IconHighQuality } from "lucide-react";
import { Sun as IconLightMode } from "lucide-react";
import { Palette as IconPalette } from "lucide-react";
import { SlidersHorizontal as IconTune } from "lucide-react";
import { Folder as IconMyGenerations } from "lucide-react";
import { Newspaper as IconHowItWorks } from "lucide-react";
import Sparkles from "@/assets/icon-sparkles-soft.svg?react";
import { Accordion } from "@higgsfield/quanta/accordion";
import { Button } from "@higgsfield/quanta/button";
import { Card } from "@higgsfield/quanta/card";
import { Icon } from "@higgsfield/quanta/icon";
import { Loader } from "@higgsfield/quanta/loader";
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
import { UploadField } from "@/components/upload-field";
import { UserGenerations } from "@/components/user-generations";
import { ScreenEmptyState } from "@/components/screen-empty-state";
import { SignInModal } from "@/components/sign-in-modal";
import { APP_DETAIL_JOBS, getSignInUrl, uploadAsset } from "@/lib/fnf.browser";
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

// PLACEHOLDER ASSETS — template demo art (see /presets/*.png). When adapting
// this template into a real app, REPLACE media that represents the product
// (hero/example outputs, covers, before/after samples, feed items) with
// bespoke on-brand assets generated via the Higgsfield generation tools.
// Pure style-picker label thumbnails may keep simple placeholder art when
// real output depends on the user's own upload. Grep "PLACEHOLDER ASSETS"
// to find every site.
const HERO_PREVIEW = "/assets/landing/listingboost-showcase-exterior.png";

type AppDetailGenerationInput = SubmitInputFor<typeof APP_DETAIL_JOBS>;
const HISTORY_QUERY = { type: "image" as const, size: 40 };

function useRequiredFnfScopeKey(): string {
  const scopeKey = useFnfScopeKey();
  if (scopeKey == null) throw new Error("ListingBoost requires a user/workspace cache scope.");
  return scopeKey;
}

const RESULT_ACTIONS: CardAction[] = [{id:"download",label:"Download",icon:IconDownload},{id:"fullscreen",label:"Full screen",icon:IconFullScreen}];
const COVERS = ["/assets/landing/listingboost-showcase-exterior.png","/assets/landing/listingboost-showcase-interior.png","/assets/landing/listingboost-showcase-garden.png"] as const;
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
            <span className="text-q-text-secondary">Everything you need</span><br />
            to market it.
          </Typography>
          <Typography as="p" variant="body-lg-regular" color="secondary" className="max-w-2xl">
            ListingBoost turns your property listing into a complete social campaign — professional creatives, platform-ready formats and compelling copy, created in minutes.
          </Typography>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="marketingPrimary" size="md" onClick={onCreate}>Create your first campaign</Button>
            <Typography as="p" variant="caption-sm-regular" color="secondary">From £49 per month · Cancel anytime</Typography>
          </div>
        </div>
        <Card surface="solid" className="overflow-hidden rounded-q-600 border border-q-border-subtle bg-q-background-secondary p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Typography as="p" variant="caption-sm-semi-bold" color="secondary">ONE LISTING IN</Typography>
              <Typography as="p" variant="body-md-semi-bold" color="primary">A complete campaign out</Typography>
            </div>
            <Typography as="span" variant="caption-sm-regular" color="secondary">ListingBoost</Typography>
          </div>
          <div className="rounded-q-500 border border-q-border-subtle bg-q-background-primary p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-q-300 border border-q-border-subtle bg-q-background-secondary text-xs font-semibold text-q-text-primary">01</div>
              <div>
                <Typography as="p" variant="body-sm-semi-bold" color="primary">Your property listing</Typography>
                <Typography as="p" variant="caption-sm-regular" color="secondary">Details + photography + verified information</Typography>
              </div>
            </div>
            <div className="mb-4 h-px bg-q-border-subtle" />
            <div className="grid grid-cols-2 gap-2">
              {["Hero", "Social", "Story", "Just Listed", "Copy", "More"].map((label, index) => (
                <div key={label} className="rounded-q-300 border border-q-border-subtle bg-q-background-secondary px-3 py-3">
                  <Typography as="p" variant="caption-sm-semi-bold" color="primary">{String(index + 1).padStart(2, "0")}</Typography>
                  <Typography as="p" variant="caption-sm-regular" color="secondary">{label}</Typography>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
      <div className="grid gap-px overflow-hidden rounded-q-500 border border-q-border-subtle bg-q-border-subtle md:grid-cols-3">
        {[
          ["Create faster", "Go from listing to campaign in minutes, not hours."],
          ["Stay consistent", "Professional, on-brand marketing across every channel."],
          ["Get more from every listing", "Turn work you've already done into multiple marketing assets."],
        ].map(([title, description], index) => (
          <div key={title} className="bg-q-background-primary p-5 md:p-6">
            <Typography as="p" variant="caption-sm-semi-bold" color="secondary">{String(index + 1).padStart(2, "0")}</Typography>
            <Typography as="h2" variant="body-md-semi-bold" color="primary" className="mt-3">{title}</Typography>
            <Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">{description}</Typography>
          </div>
        ))}
      </div>
    </section>
  );
}

function Hero({libraryItems,libraryPagination,onUpload}:HeroProps){
 const jobClient=useFnfJobClient<typeof APP_DETAIL_JOBS>(); const scopeKey=useRequiredFnfScopeKey(); const queryClient=useQueryClient(); const run=useGenerationRun(jobClient,{scopeKey}); const prepended=useRef(new Set<string>());
 const [image,setImage]=useState<AssetSelection|null>(null); const [listingUrl,setListingUrl]=useState(""); const [details,setDetails]=useState(""); const [aspectRatio,setAspectRatio]=useState<"1:1"|"16:9"|"9:16">("9:16"); const [style,setStyle]=useState(STYLES[0]); const [quality,setQuality]=useState("High"); const [lighting,setLighting]=useState("Natural"); const [pendingSignInUrl,setPendingSignInUrl]=useState<string|null>(null); const [portfolio,setPortfolio]=useState(false);
 const loadSample=()=>{setListingUrl("https://www.rightmove.co.uk/properties/example");setDetails("4-bedroom detached family home; open-plan kitchen and dining area; landscaped south-facing garden; driveway parking; bright, neutral interiors.");setImage(null);};
 const imageRef=image?.ref; const canGenerate=imageRef!=null&&details.trim().length>=20&&/^https?:\/\//i.test(listingUrl.trim());
 const input=useMemo<AppDetailGenerationInput>(()=>({model:"nano_banana_2",prompt:{instruction:`Create a premium estate-agent social creative using the uploaded property photo as the source. Preserve the property's real architecture, layout, materials and proportions; do not invent rooms or structural features. Visual direction: ${style}. Lighting: ${lighting}. Verified listing facts: ${details.trim()}. Listing URL is reference context only: ${listingUrl.trim()}. Make it realistic, polished and suitable for social media. Do not add logos, agency branding, prices, addresses or text unless explicitly present in the supplied facts.`},...(imageRef?{media:{image:[imageRef]}}:{}),settings:{aspectRatio,resolution:quality==="Ultra"?"4k":quality==="High"?"2k":"1k",batchSize:1}}),[aspectRatio,details,imageRef,lighting,listingUrl,quality,style]);
 const cost=useQuery({...costQueryOptions(jobClient,input,{enabled:canGenerate,scopeKey}),refetchOnWindowFocus:false});
 useEffect(()=>{if(run.status==="completed"&&run.generations.length)setPortfolio(true);},[run.status,run.generations.length]);
 useEffect(()=>{const fresh=run.generations.filter(g=>!prepended.current.has(g.id));if(!fresh.length)return;fresh.forEach(g=>prepended.current.add(g.id));prependGenerations(queryClient,HISTORY_QUERY,fresh,{scopeKey});},[queryClient,run.generations,scopeKey]);
 const handleGenerate=()=>{if(!canGenerate||run.status==="submitting")return;const signInUrl=getSignInUrl(scopeKey,`${window.location.pathname}${window.location.search}${window.location.hash}`);if(signInUrl!=null){setPendingSignInUrl(signInUrl);return;}void run.start(input);};
 const latest=run.generations[0]; const latestMedia=latest==null?undefined:selectGenerationMedia(latest); const failure=latest!=null&&latestMedia?.kind==="empty"&&latestMedia.terminal?(getGenerationFailureLabel(latest)||"The campaign visual could not be generated."):undefined;
 return <><MarketingIntro onCreate={() => document.getElementById("create-campaign")?.scrollIntoView({behavior:"smooth", block:"start"})} /><div id="create-campaign" className="scroll-mt-6">{portfolio&&latest?<div className="flex flex-col gap-5"><div className="flex items-end justify-between"><div><Typography as="p" variant="caption-sm-semi-bold" color="secondary">CAMPAIGN PORTFOLIO</Typography><Typography as="h2" variant="headline-lg-bold" color="primary">Your listing campaign</Typography><Typography as="p" variant="body-sm-regular" color="secondary">One verified property brief, organised into ready-to-use campaign assets.</Typography></div><Button variant="tertiary" size="sm" onClick={()=>{setPortfolio(false);run.reset()}}>Create another</Button></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{[["Hero visual","4:5"],["Instagram / Facebook","1:1"],["Reel / Story","9:16"],["Just Listed","4:5"]].map(([title,ratio])=><Card key={title} surface="solid" className="overflow-hidden rounded-q-500 border border-q-border-subtle"><div className="grid place-items-center overflow-hidden bg-q-background-secondary p-2" style={{aspectRatio:ratio.replace(":"," / ")}}><img src={latestMedia?.kind==="image"?latestMedia.rawUrl:HERO_PREVIEW} alt={title} className="block h-full w-full object-contain"/></div><div className="flex flex-col gap-2 p-4"><Typography as="h3" variant="body-md-semi-bold" color="primary">{title}</Typography><Typography as="p" variant="caption-sm-regular" color="secondary">Verified listing visual placement.</Typography><Button variant="tertiary" size="sm" onClick={()=>{const a=document.createElement("a");a.href=latestMedia?.kind==="image"?latestMedia.rawUrl:"";a.download="listingboost-visual";a.click()}}>Download</Button></div></Card>)}</div><div className="grid gap-4 lg:grid-cols-2"><Card surface="solid" className="rounded-q-500 border border-q-border-subtle p-5"><Typography as="p" variant="caption-sm-semi-bold" color="secondary">SOCIAL COPY</Typography><Typography as="h3" variant="headline-sm-bold" color="primary">Launch caption</Typography><Typography as="p" variant="body-sm-regular" color="secondary" className="mt-3">{details.split(/[;\n]+/).filter(Boolean).slice(0,3).join(" · ")}.</Typography><Button className="mt-4" variant="ghost" size="xs" onClick={()=>navigator.clipboard?.writeText(details)}>Copy facts</Button></Card><Card surface="solid" className="rounded-q-500 border border-q-border-subtle p-5"><Typography as="p" variant="caption-sm-semi-bold" color="secondary">CAMPAIGN PACK</Typography><Typography as="h3" variant="headline-sm-bold" color="primary">Ready for the agent</Typography><Typography as="p" variant="body-sm-regular" color="secondary" className="mt-1">Four placements, the master visual and verified copy are grouped in this campaign workspace.</Typography></Card></div></div>:<Card surface="solid" className="flex flex-col gap-2 rounded-q-600 border border-q-border-subtle p-2 lg:h-[600px] lg:flex-row"><SignInModal open={pendingSignInUrl!=null} signInUrl={pendingSignInUrl} onOpenChange={open=>{if(!open)setPendingSignInUrl(null)}}/><div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-q-background-secondary px-4 py-5 lg:h-full"><div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1 lg:pb-36"><div className="flex min-w-0 flex-col gap-2"><Typography as="p" variant="caption-sm-semi-bold" color="secondary" className="uppercase tracking-[0.18em]">Create a campaign</Typography><Typography as="h2" variant="headline-md-bold" color="primary">Turn your listing into marketing content.</Typography><Typography as="p" variant="body-sm-regular" color="secondary">Add the information and photography you already have. ListingBoost handles the repetitive creative work.</Typography></div><div className="flex flex-col gap-3"><div className="mb-2 flex items-center justify-between gap-3"><Typography as="p" variant="body-sm-semi-bold" color="primary">1. Add the property</Typography><Typography as="p" variant="caption-sm-regular" color="secondary">Use verified property facts</Typography></div><input aria-label="Listing URL" type="url" value={listingUrl} onChange={e=>setListingUrl(e.target.value)} placeholder="Rightmove / Zoopla listing URL" className="min-h-12 rounded-q-300 border border-q-border-subtle bg-q-background-primary px-4 text-q-body-md-regular text-q-text-primary outline-none focus-visible:ring-2 focus-visible:ring-q-border-focus"/><textarea aria-label="Verified property facts" value={details} onChange={e=>setDetails(e.target.value)} placeholder="Verified facts: 4-bed home, kitchen extension, south-facing garden, £650,000…" rows={3} className="resize-none rounded-q-300 border border-q-border-subtle bg-q-background-primary px-4 py-3 text-q-body-md-regular text-q-text-primary outline-none focus-visible:ring-2 focus-visible:ring-q-border-focus"/><AssetLibraryModal imageOnly items={libraryItems} pagination={libraryPagination} onUpload={onUpload} onSelect={setImage} trigger={<UploadField render={<button type="button"/>} icon={IconAddPhoto} title="Add property photo" subtitle="Required to generate — PNG, JPG or choose from your library" preview={image?<DropzonePreview src={image.src} alt={image.name}/>:undefined}/>} /><Accordion.Root multiple={false} variant="list"><Accordion.Item value="settings"><Accordion.Trigger start={<Icon size="sm" as={IconTune}/>}>Campaign settings</Accordion.Trigger><Accordion.Panel><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><SettingSelect label="Aspect Ratio" icon={IconAspectRatio} value={aspectRatio} onChange={v=>{if(v==="1:1"||v==="16:9"||v==="9:16")setAspectRatio(v)}} options={RATIOS.map(r=>r.value)}/><SettingSelect label="Visual direction" icon={IconPalette} value={style} onChange={setStyle} options={STYLES}/><SettingSelect label="Quality" icon={IconHighQuality} value={quality} onChange={setQuality} options={QUALITIES}/><SettingSelect label="Lighting" icon={IconLightMode} value={lighting} onChange={setLighting} options={LIGHTING}/></div></Accordion.Panel></Accordion.Item></Accordion.Root><Typography as="p" variant="caption-sm-regular" color="secondary">Only verified facts are used. ListingBoost does not invent property details.</Typography>{run.error?<Typography as="p" variant="caption-sm-regular" color="danger" role="alert">{run.error.message}</Typography>:null}</div></div><div className="relative shrink-0 lg:pointer-events-none lg:absolute lg:inset-x-4 lg:bottom-5"><Button variant="marketingPrimary" size="lg" className="pointer-events-auto relative w-full" disabled={!canGenerate||run.status==="submitting"} onClick={handleGenerate} end={<span className="flex items-center gap-2">{run.status==="submitting"?<Loader size="xs" color="neutral"/>:<><Sparkles width={18} height={18}/><span className="text-q-body-lg-semi-bold">{cost.data?.credits??"—"}</span></>}</span>}>{run.status==="submitting"?"Creating campaign":imageRef==null?"Add a photo to continue":"Create campaign"}</Button></div></div><div className="relative flex min-h-[420px] flex-1 flex-col justify-center gap-4 rounded-q-500 bg-q-background-primary p-4 md:p-5">{run.isRunning&&latestMedia?.kind!=="image"?<GenerationTile state="generating" ratio="portrait" className="mx-auto h-[360px] w-full max-w-[260px]"/>:failure?<GenerationTile state="failed" failureLabel={failure} ratio="portrait" className="mx-auto h-[360px] w-full max-w-[260px]"/>:latestMedia?.kind==="image"&&latest?<GenerationTile ratio="portrait" className="mx-auto h-[360px] w-full max-w-[260px]" alt="Listing campaign visual" generation={{src:latestMedia.rawUrl,mediaType:"image",aspectRatio:9/16,prompt:latest.input.prompt?.instruction}} openLabel="Open campaign visual" actions={RESULT_ACTIONS}/>:<><Typography as="p" variant="caption-sm-semi-bold" color="secondary">WHAT YOU GET</Typography><Typography as="h3" variant="headline-md-bold" color="primary">A complete campaign, ready to publish.</Typography><CampaignPreview compact /></>}<Typography as="p" variant="caption-sm-regular" color="secondary">Your listing information becomes a coordinated set of marketing assets across the formats agents use every day.</Typography></div></Card>}</div></>
}

export function AppDetailTemplate() {
  const jobClient = useFnfJobClient<typeof APP_DETAIL_JOBS>();
  const mediaClient = useFnfMediaClient();
  const scopeKey = useRequiredFnfScopeKey();
  const [localUploads, setLocalUploads] = useState<AssetLibraryItem[]>([]);
  const [activeTab, setActiveTab] = useState("how-it-works");
  const [pendingSignInUrl, setPendingSignInUrl] = useState<string | null>(null);
  const handleTabChange = (tab: string) => {
    if (tab === "my-generations") {
      const signInUrl = getSignInUrl(
        scopeKey,
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      if (signInUrl != null) {
        setPendingSignInUrl(signInUrl);
        return;
      }
    }
    setActiveTab(tab);
  };
  const history = useInfiniteQuery({
    ...jobsFeedQueryOptions(jobClient, HISTORY_QUERY, { scopeKey }),
    getNextPageParam: getNextCursor,
    select: flattenFeedPages,
  });
  const persistedUploads = useInfiniteQuery({
    queryKey: ["fnf", "scope", scopeKey, "media", "image"],
    queryFn: ({ pageParam }) =>
      mediaClient.list({
        type: "image",
        size: 40,
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | number | undefined,
    getNextPageParam: getNextCursor,
    select: flattenMediaPages,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const historySnapshots = useMemo(() => history.data ?? [], [history.data]);
  useLiveFeedGenerations(jobClient, historySnapshots, { scopeKey });
  const generations = historySnapshots;
  const historyItems = useMemo(() => generations.map(generationToGalleryItem), [generations]);
  const libraryItems = useMemo(() => {
    const localIds = new Set(localUploads.map((item) => item.ref?.id));
    return [
      ...localUploads,
      ...(persistedUploads.data ?? [])
        .filter((ref) => !localIds.has(ref.id))
        .map(mediaRefToAssetItem)
        .filter((item): item is AssetLibraryItem => item != null),
      ...generations
        .map(generationToAssetItem)
        .filter((item): item is AssetLibraryItem => item != null),
    ];
  }, [generations, localUploads, persistedUploads.data]);
  const loadMoreUploads =
    persistedUploads.data == null ||
    (persistedUploads.error != null && !persistedUploads.isFetchNextPageError)
      ? persistedUploads.refetch
      : persistedUploads.fetchNextPage;
  const loadMoreHistory =
    history.data == null || (history.error != null && !history.isFetchNextPageError)
      ? history.refetch
      : history.fetchNextPage;
  const libraryPagination = useMemo<AssetLibraryPagination>(
    () => ({
      uploads: {
        hasMore: persistedUploads.hasNextPage === true,
        loading: persistedUploads.isPending || persistedUploads.isFetchingNextPage,
        ...(persistedUploads.error instanceof Error
          ? { error: persistedUploads.error.message }
          : {}),
        onLoadMore: loadMoreUploads,
      },
      image: {
        hasMore: history.hasNextPage === true,
        loading: history.isPending || history.isFetchingNextPage,
        ...(history.error instanceof Error ? { error: history.error.message } : {}),
        onLoadMore: loadMoreHistory,
      },
    }),
    [
      history.error,
      history.hasNextPage,
      history.isFetchingNextPage,
      history.isPending,
      loadMoreHistory,
      loadMoreUploads,
      persistedUploads.error,
      persistedUploads.hasNextPage,
      persistedUploads.isFetchingNextPage,
      persistedUploads.isPending,
    ],
  );

  const handleUpload = async (file: File): Promise<AssetSelection> => {
    const uploaded = await uploadAsset(file);
    const item = { ...uploaded, kind: "upload" as const, personal: true };
    setLocalUploads((current) => [
      item,
      ...current.filter((candidate) => candidate.ref?.id !== uploaded.ref?.id),
    ]);
    return item;
  };

  const historyError = history.error instanceof Error ? history.error.message : undefined;

  return (
    <div className="min-h-dvh bg-q-background-primary">
      <SignInModal
        open={pendingSignInUrl != null}
        signInUrl={pendingSignInUrl}
        onOpenChange={(open) => {
          if (!open) setPendingSignInUrl(null);
        }}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-6 md:gap-14 md:px-8 md:py-8">
        <div id="app">
          <Hero
            libraryItems={libraryItems}
            libraryPagination={libraryPagination}
            onUpload={handleUpload}
          />
        </div>
        <Tabs.Root
          variant="segmented"
          value={activeTab}
          onValueChange={(value) => handleTabChange(String(value))}
          className="flex! min-h-0 w-full flex-col gap-5"
        >
          <Tabs.List
            className="self-start"
            items={[
              {
                value: "how-it-works",
                label: "How it works",
                start: <Icon size="sm" as={IconHowItWorks} />,
              },
              {
                value: "my-generations",
                label: "My generations",
                start: <Icon size="sm" as={IconMyGenerations} />,
              },
            ]}
          />

          <Tabs.Panel value="how-it-works" className="pt-0">
            <div className="grid gap-px overflow-hidden rounded-q-500 border border-q-border-subtle bg-q-border-subtle md:grid-cols-3">
  {[
    ["01", "Add your listing", "Paste the listing URL and provide the verified facts you want reflected."],
    ["02", "Add your photography", "Upload the property photography you already use for the listing."],
    ["03", "Get your campaign", "Create a coordinated set of social creatives and copy in minutes."],
  ].map(([number, title, description]) => (
    <div key={number} className="bg-q-background-secondary p-6">
      <Typography as="p" variant="caption-sm-semi-bold" color="secondary">{number}</Typography>
      <Typography as="h3" variant="body-md-semi-bold" color="primary" className="mt-4">{title}</Typography>
      <Typography as="p" variant="body-sm-regular" color="secondary" className="mt-2">{description}</Typography>
    </div>
  ))}
</div>
          </Tabs.Panel>

          <Tabs.Panel value="my-generations" className="pt-0">
            <section className="flex h-[calc(100dvh-8rem)] min-h-[480px] max-h-[640px] flex-col gap-5 md:h-[640px]">
              {history.isPending ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader size="md" color="neutral" aria-label="Loading generation history" />
                </div>
              ) : historyError != null && historyItems.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <Typography as="p" variant="body-sm-regular" color="danger">
                    {historyError}
                  </Typography>
                  <Button variant="tertiary" size="sm" onClick={() => void loadMoreHistory()}>
                    Retry
                  </Button>
                </div>
              ) : (
                <>
                  {historyError != null ? (
                    <div className="flex items-center justify-between gap-3 rounded-q-300 bg-q-transparent-light-05 px-3 py-2">
                      <Typography as="p" variant="caption-sm-regular" color="danger">
                        {historyError}
                      </Typography>
                      <Button variant="tertiary" size="xs" onClick={() => void loadMoreHistory()}>
                        Retry
                      </Button>
                    </div>
                  ) : null}
                  {historyItems.length === 0 && history.hasNextPage !== true ? (
                    <ScreenEmptyState
                      images={[COVERS[0], COVERS[1], COVERS[2]]}
                      title="No campaigns yet"
                      description="Your generated property campaigns will appear here once you create your first one."
                    />
                  ) : (
                    <UserGenerations
                      items={historyItems}
                      hasMore={history.error == null && history.hasNextPage === true}
                      loadingMore={history.isFetchingNextPage}
                      onLoadMore={loadMoreHistory}
                    />
                  )}
                </>
              )}
            </section>
          </Tabs.Panel>
        </Tabs.Root>
      </div>
    </div>
  );
}
