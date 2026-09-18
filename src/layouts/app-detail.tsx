import { useMemo, useState } from "react";
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
import { GenerationTile } from "@/componen
…[31429 chars truncated — re-run with head/grep/tail for full output]…
eel"?"9:16":"4:5";
 const buildRefineInput=(asset:CampaignAsset)=>{
   const instruction=refineInstruction.trim()||"Refresh this creative while keeping the same overall property presentation and campaign role.";
   if(asset.title==="Property Reel") return {model:"seedance_2_5",prompt:{instruction:`Create a polished 5-second estate-agent property reel from the supplied property photography. Preserve the exact architecture, layout, materials, proportions and visible property features. Apply this requested refinement: ${instruction} Do not add, remove or invent property features, text, logos, prices or addresses. Campaign event: ${current.eventType}. CTA: ${current.cta}. Verified property facts: ${current.details}`},media:{image:current.sourceImages},settings:{duration:5,resolution:"720p",aspectRatio:"9:16",generateAudio:true,bitrateMode:"high",batchSize:1,model:"default"}} as AppDetailGenerationInput;
   return {model:"nano_banana_2",prompt:{instruction:`Create a premium estate-agent marketing creative for a real property. Use the supplied property photography as the visual source. Preserve real architecture, layout, materials, proportions and visible property features. Apply this requested refinement: ${instruction} Keep the creative role as ${asset.title}. Do not invent rooms or structural features, and do not add logos, prices, addresses or unsupported text. Verified property facts: ${current.details}`},media:{image:current.sourceImages},settings:{aspectRatio:ratioFor(asset.title),resolution:"2k",batchSize:1}} as AppDetailGenerationInput;
 };
 const openRefine=async(asset:CampaignAsset)=>{setRefineAssetId(asset.id);setRefineInstruction("");setRefineCost(null);setRefineBalance(null);setRefineError(null);setRefinePreflighting(true);try{const input=buildRefineInput(asset);const [estimate,balance]=await Promise.all([jobClient.cost(input),profileClient.getCredits({includeOnDemand:true}).catch(()=>null)]);setRefineCost(Number(estimate.credits||0));setRefineBalance(balance?.totalAvailableCredits??null);}catch(e){setRefineError(e instanceof Error?e.message:"We couldn't calculate the regeneration cost.");}finally{setRefinePreflighting(false);}};
 const closeRefine=()=>{if(!refineBusy){setRefineAssetId(null);setRefineInstruction("");setRefineCost(null);setRefineError(null);}};
 const regenerate=async()=>{if(!selected||refineBusy)return;setRefineBusy(true);setRefineError(null);try{const submitted=await jobClient.submit(buildRefineInput(selected));const settled=await jobClient.wait(submitted.generations);const generation=settled[0];if(!generation)throw new Error(`${selected.title} did not return a result.`);const replacement={...selected,id:generation.id,generation};setCurrent(previous=>({...previous,assets:previous.assets.map(asset=>asset.id===selected.id?replacement:asset)}));prependGenerations(queryClient,selected.title==="Property Reel"?VIDEO_HISTORY_QUERY:HISTORY_QUERY,[generation],{scopeKey});closeRefine();}catch(e){setRefineError(e instanceof Error?e.message:"The creative could not be regenerated. Your existing creative has been kept.");}finally{setRefineBusy(false);}};
 return <div className="flex flex-col gap-6">
  <Modal.Root open={selected!=null} onOpenChange={open=>{if(!open)closeRefine();}}><Modal.Content size="sm"><Modal.Header><Modal.Title>Refine {selected?.title}</Modal.Title><Modal.CloseButton/></Modal.Header><Modal.Body><div className="flex flex-col gap-4"><Typography as="p" variant="body-sm-regular" color="secondary">Describe the change you want. ListingBoost keeps the verified property facts and regenerates only this creative.</Typography><textarea aria-label="Refinement instructions" value={refineInstruction} onChange={e=>setRefineInstruction(e.target.value)} placeholder="e.g. Brighter natural light, less cinematic, make the garden feel more prominent…" rows={4} className="resize-none rounded-q-300 border border-q-border-subtle bg-q-background-primary px-4 py-3 text-q-body-md-regular text-q-text-primary outline-none focus-visible:ring-2 focus-visible:ring-q-border-focus"/>{refinePreflighting?<div className="flex items-center gap-2"><Loader size="xs" color="neutral"/><Typography as="p" variant="caption-sm-regular" color="secondary">Checking regeneration cost…</Typography></div>:refineCost!=null?<div className="rounded-q-300 border border-q-border-subtle bg-q-background-secondary p-4"><div className="flex items-baseline justify-between gap-4"><Typography as="p" variant="body-sm-semi-bold" color="primary">Estimated credit use</Typography><Typography as="p" variant="headline-sm-bold" color="primary">{refineCost.toFixed(2)} credits</Typography></div>{refineBalance!=null?<Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">Available balance: {refineBalance.toFixed(2)} credits</Typography>:null}</div>:null}{refineError?<Typography as="p" variant="caption-sm-regular" color="danger" role="alert">{refineError}</Typography>:null}<Typography as="p" variant="caption-sm-regular" color="secondary">Only this asset is regenerated. Your other campaign assets remain unchanged.</Typography></div></Modal.Body><Modal.Footer><Modal.FooterActions full><Button variant="tertiary" size="md" onClick={closeRefine} disabled={refineBusy}>Cancel</Button><Button variant="marketingPrimary" size="md" onClick={()=>void regenerate()} disabled={refinePreflighting||refineBusy||refineCost==null}>{refineBusy?"Regenerating…":`Use ${refineCost?.toFixed(2)??"—"} credits & regenerate`}</Button></Modal.FooterActions></Modal.Footer></Modal.Content></Modal.Root>
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><Typography as="p" variant="caption-sm-semi-bold" color="secondary">YOUR CAMPAIGN · {current.eventType.toUpperCase()}</Typography><Typography as="h2" variant="headline-lg-bold" color="primary">Your campaign is ready.</Typography><Typography as="p" variant="body-sm-regular" color="secondary" className="mt-1">Download the creatives, refine individual assets and use the launch copy in your social workflow.</Typography></div><Button variant="tertiary" size="sm" onClick={onNew}>New campaign</Button></div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{current.assets.map(asset=><CampaignAssetCard key={asset.id} asset={asset} onRefine={()=>void openRefine(asset)}/>)}</div>
  <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]"><Card surface="solid" className="rounded-q-500 border border-q-border-subtle p-5"><Typography as="p" variant="caption-sm-semi-bold" color="secondary">AI-WRITTEN COPY</Typography><Typography as="h3" variant="headline-sm-bold" color="primary" className="mt-1">Launch caption</Typography><Typography as="p" variant="body-md-regular" color="secondary" className="mt-4 whitespace-pre-wrap">{current.copy}</Typography><Button className="mt-4" variant="ghost" size="xs" onClick={()=>void copyCaption()}>{copied?"Copied ✓":"Copy caption"}</Button></Card><Card surface="solid" className="rounded-q-500 border border-q-border-subtle p-5"><Typography as="p" variant="caption-sm-semi-bold" color="secondary">MARKETING PLAN</Typography><Typography as="h3" variant="headline-sm-bold" color="primary" className="mt-1">What to do next</Typography><Typography as="p" variant="body-sm-regular" color="secondary" className="mt-3 whitespace-pre-wrap">{current.plan}</Typography><div className="mt-5 rounded-q-300 border border-q-border-subtle bg-q-background-secondary p-3"><Typography as="p" variant="caption-sm-semi-bold" color="primary">NEXT</Typography><Typography as="p" variant="caption-sm-regular" color="secondary" className="mt-1">Event: {current.eventType} · CTA: {current.cta}{current.brandName?" · "+current.brandName:""}. Review before publishing; ListingBoost does not publish automatically.</Typography></div></Card></div>
 </div>;
}
function CampaignAssetCard({asset,onRefine}:{asset:CampaignAsset;onRefine:()=>void}){const media=selectGenerationMedia(asset.generation);const isVideo=asset.title==="Property Reel";return <Card surface="solid" className="overflow-hidden rounded-q-500 border border-q-border-subtle"><div className="grid place-items-center overflow-hidden bg-q-background-secondary" style={{aspectRatio:isVideo?"9 / 16":asset.title.startsWith("Square")?"1 / 1":asset.title.startsWith("Story")?"9 / 16":"4 / 5"}}>{media?.kind==="image"?<img src={media.rawUrl} alt={asset.title} className="h-full w-full object-cover"/>:media?.kind==="video"?<video src={media.rawUrl} controls playsInline className="h-full w-full object-cover"/>:<div className="p-4"><Typography as="p" variant="caption-sm-regular" color="secondary">Media unavailable</Typography></div>}</div><div className="flex flex-col gap-2 p-4"><Typography as="h3" variant="body-md-semi-bold" color="primary">{asset.title}</Typography><Typography as="p" variant="caption-sm-regular" color="secondary">{isVideo?"5-second vertical property reel.":"Ready-to-use campaign creative."}</Typography><div className="grid grid-cols-2 gap-2"><Button variant="tertiary" size="sm" onClick={onRefine}>Refine</Button><Button variant="tertiary" size="sm" onClick={()=>media&&(media.kind==="image"||media.kind==="video")&&void downloadMedia(media.rawUrl,`listingboost-${asset.title.toLowerCase().replaceAll(" ","-").replaceAll("/","-")}.${isVideo?"mp4":"jpg"}`,asset.generation.id,isVideo?"video":"image")}>Download</Button></div></div></Card>}

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
