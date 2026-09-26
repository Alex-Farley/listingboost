import { Navigate, type RouteObject } from "react-router";
import { AppShell, RequireAuth } from "./pages/AppShell";
import { SignInPage, SignUpPage } from "./pages/Auth";
import { PackTab, ReelsTab, SocialTab, StoriesTab } from "./pages/Campaign";
import { ImagesTab } from "./pages/Images";
import { LandingPage } from "./pages/Landing";
import { ListingsPage, NewListingPage } from "./pages/Listings";
import { ListingWorkspace, OverviewTab } from "./pages/Workspace";

export const routes: RouteObject[] = [
  { path: "/", element: <LandingPage /> },
  { path: "/signin", element: <SignInPage /> },
  { path: "/signup", element: <SignUpPage /> },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="listings" replace /> },
      { path: "listings", element: <ListingsPage /> },
      { path: "listings/new", element: <NewListingPage /> },
      {
        path: "listings/:id",
        element: <ListingWorkspace />,
        children: [
          { index: true, element: <OverviewTab /> },
          { path: "images", element: <ImagesTab /> },
          { path: "social", element: <SocialTab /> },
          { path: "stories", element: <StoriesTab /> },
          { path: "reels", element: <ReelsTab /> },
          { path: "pack", element: <PackTab /> },
        ],
      },
    ],
  },
  { path: "*", element: <p className="empty">Page not found.</p> },
];
