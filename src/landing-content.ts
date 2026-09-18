import { parseLandingContent } from "@higgsfield/app-landing";
export const landingContent = parseLandingContent({
 hero:{eyebrow:"Property marketing",title:"One listing. A campaign ready to publish.",description:"Turn a property listing and verified facts into polished social creative — without adding another creative task to the agent's day.",primaryCta:{label:"Create campaign",href:"#app"}},
 preview:{kind:"inline",title:"ListingBoost campaign workflow"},
 steps:{title:"From listing to campaign in three steps",description:"A deliberately narrow workflow built to test whether agents will pay to remove repetitive creative admin.",items:[
 {title:"Add the property",description:"Paste the listing URL and the facts you want protected. The beta keeps verification explicit.",preview:{kind:"instruction",icon:"image",title:"Listing + verified facts",description:"Rightmove / Zoopla + confirmed details"}},
 {title:"Choose the direction",description:"Add the strongest property image and choose the social format and visual direction.",preview:{kind:"action",label:"Create campaign"}},
 {title:"Get a campaign asset",description:"Review the generated hero creative and download it ready for publishing.",preview:{kind:"result",media:{kind:"image",src:"/assets/landing/listingboost-result.png",alt:"Property marketing campaign example"}}}
 ]},
 features:{title:"Designed around the agent, not the AI",description:"The product removes the repetitive creative step between receiving a listing and promoting it socially.",items:[
 {icon:"shield",title:"Fact-first",description:"Generation is constrained by verified property facts and instructed not to invent architecture or features."},
 {icon:"sliders",title:"Campaign-first",description:"The workflow is built around a publishable marketing asset rather than a generic AI image."},
 {icon:"sparkles",title:"Agency-ready",description:"The next layer can add persistent agency branding once demand is proven."}
 ]},
 showcase:{title:"The visual standard",description:"A restrained property-marketing look designed to sit alongside an agency's existing brand.",items:[
 {label:"Exterior",media:{kind:"image",src:"/assets/landing/listingboost-showcase-exterior.png",alt:"Property exterior marketing example"}},
 {label:"Interior",media:{kind:"image",src:"/assets/landing/listingboost-showcase-interior.png",alt:"Property interior marketing example"}},
 {label:"Garden",media:{kind:"image",src:"/assets/landing/listingboost-showcase-garden.png",alt:"Property garden marketing example"}}
 ]},
 finalCta:{title:"Test it on one property.",description:"If ListingBoost becomes a monthly habit, the next step is full listing import, multi-format campaign generation and persistent agency branding.",action:{label:"Create campaign",href:"#app"}}
});
