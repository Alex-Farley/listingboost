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
import { Gene
…[48216 chars truncated — re-run with head/grep/tail for full output]…
[],[history.data]);
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
