import { createCampaignRecordFn, duplicateCampaignFn, getCampaignFn, listCampaignsFn, saveCampaignAssetFn, updateCampaignRecordFn } from "./campaigns.functions";
import type { CampaignSummary, CreateCampaignInput, PersistedCampaign, SaveCampaignAssetInput, UpdateCampaignInput } from "./campaigns.functions";
export type { CampaignSummary, PersistedCampaign, PersistedCampaignAsset } from "./campaigns.functions";
export const createCampaignRecord=(data:CreateCampaignInput)=>createCampaignRecordFn({data});
export const saveCampaignAsset=(data:SaveCampaignAssetInput)=>saveCampaignAssetFn({data});
export const updateCampaignRecord=(data:UpdateCampaignInput)=>updateCampaignRecordFn({data});
export const listCampaigns=():Promise<CampaignSummary[]>=>listCampaignsFn();
export const getCampaign=async (campaignId:string):Promise<PersistedCampaign>=>await getCampaignFn({data:{campaignId}}) as PersistedCampaign;
export const duplicateCampaign=(campaignId:string):Promise<{id:string}>=>(duplicateCampaignFn({data:{campaignId}}));
