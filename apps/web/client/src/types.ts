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
