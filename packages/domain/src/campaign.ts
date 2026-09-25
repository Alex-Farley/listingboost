export const ASSET_TYPES = ["enhanced_photo", "social_post", "story", "reel", "copy"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASPECT_RATIOS = ["original", "1:1", "4:5", "9:16"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const GENERATION_CAPABILITIES = [
  "image_enhancement",
  "image_generation",
  "video_generation",
  "text_generation",
  "upscale",
  "template_render",
] as const;
export type GenerationCapability = (typeof GENERATION_CAPABILITIES)[number];

export const CAMPAIGN_STATUSES = ["draft", "generating", "in_review", "completed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
