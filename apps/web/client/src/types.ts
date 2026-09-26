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
