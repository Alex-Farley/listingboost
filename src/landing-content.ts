import { parseLandingContent } from "@higgsfield/app-landing";

export const landingContent = parseLandingContent({
  hero: {
    eyebrow: "Property marketing",
    title: "One listing. A complete social campaign.",
    description:
      "ListingBoost turns your property listing and photography into ready-to-use social creatives, a Property Reel, launch copy and a practical marketing plan — all from one verified property brief.",
    primaryCta: { label: "Create your first campaign", href: "#app" },
  },
  preview: {
    kind: "media",
    title: "A complete ListingBoost campaign",
    media: {
      kind: "image",
      src: "/assets/landing/listingboost-showcase-exterior.png",
      alt: "Example ListingBoost campaign showing property creatives, a Property Reel, launch copy and a marketing plan",
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
            src: "/assets/landing/listingboost-showcase-exterior.png",
            alt: "Example ListingBoost campaign",
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
      "An illustrative example of the campaign assets ListingBoost is designed to create.",
    items: [
      {
        label: "The property",
        description: "Property-led hero creative",
        media: {
          kind: "image",
          src: "/assets/landing/listingboost-practice-property.png",
          alt: "Illustrative ListingBoost property hero creative",
        },
      },
      {
        label: "Social assets",
        description: "Hero · Square · Story · Just Listed · Reel",
        media: {
          kind: "image",
          src: "/assets/landing/listingboost-practice-social.png",
          alt: "Illustrative ListingBoost social campaign assets",
        },
      },
      {
        label: "Launch copy & marketing plan",
        description: "Ready-to-post caption and a practical plan for results",
        media: {
          kind: "image",
          src: "/assets/landing/listingboost-practice-launch.png",
          alt: "Illustrative ListingBoost launch copy and marketing plan",
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
      src: "/assets/landing/listingboost-showcase-exterior.png",
      alt: "Example ListingBoost campaign",
    },
  },
});
