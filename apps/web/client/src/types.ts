import type { AgentContact, PropertyFacts } from "@listingboost/domain";

export type Session = { user: { id: string; email: string; name: string }; organisation: { id: string; name: string }; role: string };

export type Property = {
  id: string;
  facts: PropertyFacts;
  agent: AgentContact | null;
  sourceUrl: string | null;
  provenance: Record<string, { source: string; verified: boolean }>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type Media = {
  id: string;
  contentType: string;
  width: number;
  height: number;
  byteSize: number;
  position: number;
  isPrimary: boolean;
  filename: string;
  originalFilename: string;
  url: string;
};

export type ProgressGroup = { key: string; label: string; status: string };

export type VersionView = {
  id: string;
  versionNumber: number;
  state: string;
  origin: "generation" | "manual_edit";
  treatment: "enhancement" | "visualisation" | null;
  disclosureLabel: string | null;
  text: string | null;
  media: { url: string; contentType: string; width: number | null; height: number | null } | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  approvedAt: string | null;
};

export type AssetView = {
  id: string;
  slotKey: string;
  assetType: "enhanced_photo" | "social_post" | "story" | "reel" | "copy";
  aspectRatio: string | null;
  sourceMediaId: string | null;
  available: boolean;
  /** Why the asset cannot be made, when the reason is the organisation's own preferred template. */
  unavailableMessage?: string | null;
  /** "browser": made in this browser from the listing's photos (the slideshow Reel). */
  renderer: "server" | "browser" | null;
  finalVersionId: string | null;
  versions: VersionView[];
};

export type CampaignView = {
  id: string;
  propertyId: string;
  name: string;
  status: "draft" | "generating" | "in_review" | "completed";
  createdAt: string;
  progress: ProgressGroup[];
  assets: AssetView[];
};

export type BrandLogo = { id: string; url: string; width: number; height: number; contentType: string; originalFormat: "png" | "jpeg" | "webp" | "svg"; createdAt: string };
export type BrandFontOption = { ref: string; label: string };

/** What GET /api/brand-settings returns. `null` settings are not set and are shown that way. */
export type BrandSettingsView = {
  canEdit: boolean;
  settings: {
    agencyName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    website: string | null;
    officeAddress: string | null;
    primaryColour: string | null;
    secondaryColour: string | null;
    headingFont: string | null;
    bodyFont: string | null;
    toneOfVoice: string | null;
    preferredTemplates: Record<string, string>;
  };
  logo: BrandLogo | null;
  previousLogos: BrandLogo[];
  fonts: { heading: BrandFontOption[]; body: BrandFontOption[]; custom: Array<BrandFontOption & { id: string; originalFormat: string; createdAt: string }> };
  templates: Array<{ slot: string; label: string; options: Array<{ id: string; label: string }>; preferred: string | null; preferredAvailable: boolean }>;
  warnings: Record<string, string>;
};
