import { parseLandingContent } from "@higgsfield/app-landing";

export const landingContent = parseLandingContent({
  hero: {
    eyebrow: "Property marketing",
    title: "One listing. A complete social campaign.",
    description:
      "ListingBoost turns your verified property brief and source photography into a coordinated marketing pack. Property imagery is kept separate from potential visualisations, with fidelity checks required before enhanced imagery is treated as publishable.",
    primaryCta: { label: "Create your first campaign", href: "#app" },
  },
  preview: {
    kind: "media",
    title: "A complete ListingBoost campaign",
    media: {
      kind: "image",
      src: "/assets/landing/listingboost-example-campaign.jpg",
      alt: "ListingBoost example campaign showing property creatives, a Property Reel, launch copy and a marketing plan",
    },
    openHref: "#app",
    openLabel: "Create your campaign",
  },
  steps: {
    title: "From one listing to a complete campaign",
    description:
      "Give ListingBoost the property information and photography you already have. It turns them into a coordinated set of social assets.",
    items: [
      {
        title: "Add the property",
        description:
          "Paste the listing URL for reference and enter the verified property facts you want protected. Add up to six photos.",
        preview: {
          kind: "instruction",
          icon: "image",
          title: "Listing + photography",
          description: "Verified facts · up to 6 photos",
        },
      },
      {
        title: "Build the campaign",
        description:
          "Choose the campaign event and add your agency details and call to action. ListingBoost creates the coordinated assets.",
        preview: { kind: "action", label: "Create campaign" },
      },
      {
        title: "Get everything ready to use",
        description:
          "Review the Hero, Square, Story, Just Listed creative and Property Reel, then copy the launch caption and marketing plan.",
        preview: {
          kind: "result",
          media: {
            kind: "image",
            src: "/assets/landing/listingboost-campaign-types.jpg",
            alt: "ListingBoost campaign types and example campaign assets",
          },
        },
      },
    ],
  },
  features: {
    title: "Everything your listing needs to launch on social",
    description:
      "ListingBoost is built around the campaign, not around making you learn another AI creative tool.",
    items: [
      {
        icon: "layers",
        title: "Five campaign assets",
        description:
          "Hero, Square, Story, Just Listed and a Property Reel, created from the same verified property brief.",
      },
      {
        icon: "sparkles",
        title: "Launch-ready copy",
        description:
          "AI-written launch copy and a practical marketing plan, based only on the property information you provide.",
      },
      {
        icon: "shield",
        title: "Fact-first",
        description:
          "ListingBoost is instructed to preserve real property details and not invent features, prices, addresses or architecture.",
      },
    ],
  },
  showcase: {
    title: "From property photography to campaign assets.",
    description:
      "Illustrative campaign mockups — these images are examples of presentation, not photographs of an actual property.",
    items: [
      {
        label: "Campaign types",
        description: "One campaign system for every listing moment",
        media: {
          kind: "image",
          src: "/assets/landing/listingboost-campaign-types.jpg",
          alt: "ListingBoost campaign types and complete campaign example",
        },
      },
      {
        label: "The campaign in practice",
        description: "Illustrative campaign mockup — property fidelity not verified",
        media: {
          kind: "image",
          src: "/assets/landing/listingboost-showcase-practice.jpg",
          alt: "ListingBoost campaign shown from property photography through social assets",
        },
      },
      {
        label: "Campaign detail",
        description: "Illustrative campaign mockup — not a property photograph",
        media: {
          kind: "image",
          src: "/assets/landing/listingboost-showcase-detail.jpg",
          alt: "Full-size ListingBoost social campaign example",
        },
      },
    ],
  },
  finalCta: {
    title: "Turn your next listing into a campaign.",
    description:
      "The beta starts with verified listing facts and photography, then turns them into a complete social content pack you can review and use in your existing workflow.",
    action: { label: "Create your first campaign", href: "#app" },
    backgroundMedia: {
      kind: "image",
      src: "/assets/landing/listingboost-example-campaign.jpg",
      alt: "ListingBoost example campaign",
    },
  },
});
