import type { ChangeEvent, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaRef } from "@higgsfield/fnf/media";
import { useFnfScopeKey } from "@higgsfield/fnf-react";
import { AtSign as IconAtOutlined } from "lucide-react";
import { Search as IconMagnifyingGlassOutlined } from "lucide-react";
import { Plus as IconPlusMediumOutlined } from "lucide-react";
import { Avatar } from "@higgsfield/quanta/avatar";
import type { AvatarColor } from "@higgsfield/quanta/avatar";
import { Button } from "@higgsfield/quanta/button";
import { Icon } from "@higgsfield/quanta/icon";
import { Input } from "@higgsfield/quanta/input";
import { Loader } from "@higgsfield/quanta/loader";
import { Media } from "@higgsfield/quanta/media";
import { Modal } from "@higgsfield/quanta/modal";
import { Tabs } from "@higgsfield/quanta/tabs";
import { Typography } from "@higgsfield/quanta/typography";
import { VirtualGrid } from "@higgsfield/quanta/grid";
import { SignInModal } from "@/components/sign-in-modal";
import { getSignInUrl, GUEST_SCOPE_KEY } from "@/lib/fnf.browser";

/**
 * Asset Library modal — Figma SC App Builder "Share Modal" (node 2125:15262).
 * THE app-wide asset picker: EVERY "+" / upload / attach / add-media action in
 * every app opens this modal (never a custom picker). Guests see the shared
 * `SignInModal` first; authenticated users continue into the glass modal with a tab
 * menu header (Uploads / Image Generations / …), a segmented "All | Personal"
 * toolbar with Search, and a 5-col element grid (Upload tile + media cards).
 * Quanta components + tokens only.
 *
 * ── WIRING REQUIRED — do not ship this component unwired ────────────────────
 * The modal's INTERACTIONS all work out of the box (tab/scope filtering,
 * search, upload flow with busy/error states, select-and-close), but a REAL
 * app must wire its data props:
 *
 *   1. `items`   — the library content. Load it from the app's own data:
 *                  the user's uploads (your D1/R2 records) and their
 *                  generations (the fnf feed — `jobsFeedQueryOptions` +
 *                  `selectGenerationMedia`), mapped to `AssetLibraryItem`s
 *                  with the right `kind` ("upload" | "image" | "video").
 *                  Demo content is available only through explicit
 *                  `demo={true}` scaffold mode.
 *   2. `onUpload` — the real upload path: receive the picked `File`, POST it
 *                  as multipart `FormData` to an app-local route that calls
 *                  `media.upload(...)` server-side, and resolve the
 *                  submit-ready item (`{ name, type, src, ref }` — `ref` is
 *                  the fnf MediaRef id / durable URL). Without it the Upload
 *                  Live mode requires this callback at the type level. Only
 *                  demo mode may use a browser-local object URL preview,
 *                  which CANNOT be submitted (blob: URLs never leave the browser).
 *   3. `pagination` — cursor/loading/error state keyed by the matching tab.
 *                  Keep uploads and generation feeds separate so scrolling
 *                  one tab never fetches unrelated pages.
 *
 * Generation code must always submit `item.ref` — never `item.src`. Treat a
 * selection without `ref` as preview-only.
 *
 *   <AssetLibraryModal
 *     items={libraryItems}
 *     onUpload={async file => uploadToMediaRoute(file)}
 *     pagination={libraryPagination}
 *     onSelect={item => setImage(item)}
 *     trigger={<Dropzone render={<button type="button" />} … />}
 *   />
 *
 * IMPORTANT: `trigger` is rendered AS the modal trigger (Base UI `render`
 * prop), so the element MUST spread incoming props (`onClick`, `ref`, aria)
 * onto a real DOM node — Quanta components and `@/components/*` all do. A
 * custom component that drops unknown props will silently not open the modal;
 * wrap it in a plain `<button type="button">` if needed. See
 * `@/components/AGENTS.md` for the full wiring contract.
 */

/** A picked library element, reported by `AssetLibraryModal.onSelect`. */
export interface AssetSelection {
  name: string;
  type: string;
  /** Preview/display URL. May be a browser-local `blob:` object URL when the
   * unwired upload fallback produced it — never submit `src` to generation. */
  src: string;
  /** The submit-ready reference (fnf MediaRef id / durable URL). This — and
   * ONLY this — is what generation submits use. Absent on preview-only items
   * from the explicit demo upload fallback. */
  ref?: MediaRef;
  /** Media presentation used by previews after selection. */
  kind?: "upload" | "image" | "video";
}

/** A library entry: a selection plus the metadata the modal filters on. */
export interface AssetLibraryItem extends AssetSelection {
  /** Shown under the "Personal" scope (the user's own items). Default: true. */
  personal?: boolean;
  /** Shown under the "Liked" tab. */
  liked?: boolean;
  badge?: string;
  badgeColor?: AvatarColor;
}

export type AssetLibraryTab = "uploads" | "image" | "video" | "liked";

export interface AssetLibraryPaginationPage {
  hasMore: boolean;
  loading: boolean;
  error?: string;
  onLoadMore: () => Promise<unknown>;
}

/** Cursor state is tab-specific: uploads and generations have separate feeds. */
export type AssetLibraryPagination = Partial<Record<AssetLibraryTab, AssetLibraryPaginationPage>>;

// PLACEHOLDER ASSETS — template demo art (see /presets/*.png), rendered ONLY
// through explicit `demo` mode. Live callers must pass the complete data and
// upload contract at the type level (see WIRING REQUIRED above).
// Grep "PLACEHOLDER ASSETS" to find every site.
const THUMBS = [
  "/presets/how-product-works.png",
  "/presets/explain.png",
  "/presets/hyper-motion.png",
  "/presets/cover.png",
];

// PLACEHOLDER ASSETS — demo data; replace when adapting (see note above).
const DEMO_ITEMS: AssetLibraryItem[] = [
  {
    name: "@Ultraviolet",
    type: "Location",
    src: THUMBS[0],
    kind: "upload",
    badge: "T",
    badgeColor: "pink",
  },
  {
    name: "@Ultraviolet",
    type: "Character",
    src: THUMBS[1],
    kind: "upload",
    liked: true,
    badge: "C",
    badgeColor: "mint",
  },
  { name: "@Ultraviolet", type: "Location", src: THUMBS[2], kind: "image" },
  { name: "@Ultraviolet", type: "Location", src: THUMBS[3], kind: "image", liked: true },
  {
    name: "@Ultraviolet",
    type: "Location",
    src: THUMBS[2],
    kind: "image",
    badge: "G",
    badgeColor: "mint",
  },
  {
    name: "@Ultraviolet",
    type: "Location",
    src: THUMBS[1],
    kind: "video",
    badge: "A",
    badgeColor: "blue",
  },
  { name: "@Ultraviolet", type: "Location", src: THUMBS[0], kind: "video" },
  { name: "@Ultraviolet", type: "Location", src: THUMBS[0], kind: "image", personal: false },
  { name: "@Ultraviolet", type: "Location", src: THUMBS[0], kind: "image", personal: false },
];

const HEADER_TABS = [
  { value: "uploads", label: "Uploads" },
  { value: "image", label: "Image Generations" },
  { value: "video", label: "Video Generations" },
  { value: "liked", label: "Liked" },
];

const TAB_KIND: Record<string, AssetLibraryItem["kind"]> = {
  uploads: "upload",
  image: "image",
  video: "video",
};

const LOAD_MORE_MARGIN = 240;

/* ── Toolbar ────────────────────────────────────────────────────────────────── */

function AssetToolbar({
  scope,
  onScopeChange,
  query,
  onQueryChange,
}: {
  scope: string;
  onScopeChange: (scope: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 bg-q-transparent-light-05 p-2">
      <div className="flex flex-1 items-center gap-2 px-1">
        <Tabs.Root
          variant="pill"
          value={scope}
          onValueChange={(value) => onScopeChange(String(value))}
        >
          <Tabs.List
            items={[
              { value: "all", label: "All" },
              { value: "personal", label: "Personal" },
            ]}
          />
        </Tabs.Root>
      </div>
      <div className="flex w-48 items-center">
        <Input
          aria-label="Search assets"
          placeholder="Search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          start={<Icon as={IconMagnifyingGlassOutlined} size="sm" />}
        />
      </div>
    </div>
  );
}

/* ── Grid ───────────────────────────────────────────────────────────────────── */

function UploadCard({
  accept,
  uploading,
  onFile,
}: {
  accept: string;
  uploading: boolean;
  onFile: (file: File, close: () => void) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Hidden dismiss trigger so a picked file closes the modal via the SAME
  // Base UI Close path the grid cards use (we can't click the visible tile
  // to close because the file dialog resolves asynchronously in `onChange`).
  const closeRef = useRef<HTMLButtonElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file != null) {
      onFile(file, () => closeRef.current?.click());
    }
    // Reset so picking the same file again still fires `onChange`.
    event.target.value = "";
  };

  return (
    <>
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex h-full w-full flex-col items-center gap-1.5 rounded-q-400 p-1 disabled:opacity-60"
      >
        <div className="flex h-24 w-full items-center justify-center rounded-q-300 border border-q-border-subtle bg-q-transparent-light-05">
          <span className="flex size-10 items-center justify-center rounded-q-full bg-q-transparent-light-05 shadow-q-raised-sm">
            {uploading ? (
              <Loader size="sm" color="neutral" aria-label="Uploading" />
            ) : (
              <Icon as={IconPlusMediumOutlined} size="md" color="primary" />
            )}
          </span>
        </div>
        <div className="px-1 py-0.5">
          <Typography as="span" variant="caption-sm-semi-bold" color="primary">
            {uploading ? "Uploading…" : "Upload"}
          </Typography>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      <Modal.Close ref={closeRef} aria-hidden tabIndex={-1} className="hidden" />
    </>
  );
}

function AssetLibraryEmptyState({
  accept,
  uploading,
  onFile,
}: {
  accept?: string;
  uploading?: boolean;
  onFile?: (file: File, close: () => void) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const canUpload = accept != null && onFile != null;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file != null && onFile != null) {
      onFile(file, () => closeRef.current?.click());
    }
    event.target.value = "";
  };

  const content = (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <span className="relative flex size-12 items-center justify-center overflow-hidden rounded-q-300 border border-q-border-subtle bg-q-transparent-light-05 shadow-q-raised">
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-q-transparent-light-20 via-q-transparent-light-05 to-transparent mix-blend-overlay"
        />
        {uploading ? (
          <Loader size="sm" color="neutral" aria-label="Uploading" />
        ) : (
          <Icon as={IconAtOutlined} size="md" color="secondary" className="relative" />
        )}
      </span>
      <span className="flex flex-col items-center gap-1.5">
        <Typography as="span" variant="label-md-semi-bold" color="primary">
          No elements yet
        </Typography>
        <Typography
          as="span"
          variant="caption-sm-medium"
          color="secondary"
          className="max-w-[264px]"
        >
          Reuse your characters, locations, and props across every generation
        </Typography>
      </span>
    </div>
  );

  return (
    <>
      {canUpload ? (
        <button
          type="button"
          disabled={uploading}
          aria-label="Upload media"
          className="flex size-full items-center justify-center disabled:opacity-60"
          onClick={() => inputRef.current?.click()}
        >
          {content}
        </button>
      ) : (
        <div className="flex size-full items-center justify-center">{content}</div>
      )}
      {canUpload ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={handleChange}
          />
          <Modal.Close ref={closeRef} aria-hidden tabIndex={-1} className="hidden" />
        </>
      ) : null}
    </>
  );
}

function ElementCard({
  item,
  onSelect,
}: {
  item: AssetLibraryItem;
  onSelect?: (item: AssetSelection) => void;
}) {
  const videoSrc = item.ref?.url ?? item.src;
  const className =
    "flex h-full w-full flex-col gap-1.5 rounded-q-400 p-1 text-left transition-colors hover:bg-q-transparent-light-05";
  const children = (
    <>
      <Media ratio="auto" rounded="md" className="h-24 w-full">
        {item.kind === "video" ? (
          <Media.Video
            src={videoSrc}
            poster={videoSrc === item.src ? undefined : item.src}
            autoPlayInView
            loop
          />
        ) : (
          <Media.Image src={item.src} alt={item.name} />
        )}
        {item.badge != null ? (
          <span className="absolute bottom-1.5 left-1.5 z-10">
            <Avatar size="xxs" color={item.badgeColor} alt={item.badge} />
          </span>
        ) : null}
      </Media>
      <div className="flex flex-col gap-0.5 px-1 py-0.5">
        <Typography as="span" variant="caption-sm-semi-bold" color="primary" truncate>
          {item.name}
        </Typography>
        <Typography as="span" variant="caption-sm-regular" color="secondary" truncate>
          {item.type}
        </Typography>
      </div>
    </>
  );

  // With an `onSelect`, picking a card closes the modal and reports the choice;
  // without one it stays a passive tile (the original gallery behaviour).
  return onSelect != null ? (
    <Modal.Close
      className={className}
      onClick={() =>
        onSelect({
          name: item.name,
          type: item.type,
          src: item.src,
          ref: item.ref,
          kind: item.kind,
        })
      }
    >
      {children}
    </Modal.Close>
  ) : (
    <button type="button" className={className}>
      {children}
    </button>
  );
}

/* ── Modal ──────────────────────────────────────────────────────────────────── */

interface AssetLibraryModalCommonProps {
  /** The trigger element (e.g. a Composer.Action). Rendered as the Modal trigger. */
  trigger: ReactElement;
  /** File-input accept filter for the Upload tile. */
  accept?: string;
  /** Hide video-backed choices when the consuming model accepts images only. */
  imageOnly?: boolean;
}

/** Live mode is complete at the type level; unfinished demo mode is explicit. */
export type AssetLibraryModalProps = AssetLibraryModalCommonProps &
  (
    | {
        demo: true;
        items?: never;
        onUpload?: never;
        onSelect?: (item: AssetSelection) => void;
        pagination?: never;
      }
    | {
        demo?: false;
        items: AssetLibraryItem[];
        onUpload: (file: File) => Promise<AssetSelection>;
        onSelect: (item: AssetSelection) => void;
        pagination: AssetLibraryPagination;
      }
  );

export function AssetLibraryModal(props: AssetLibraryModalProps) {
  const { trigger, accept = "image/*", imageOnly = false } = props;
  const scopeKey = useFnfScopeKey();
  const onSelect = props.onSelect;
  const [open, setOpen] = useState(false);
  const [pendingSignInUrl, setPendingSignInUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<AssetLibraryTab>("uploads");
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const loadingMoreRef = useRef<Partial<Record<AssetLibraryTab, boolean>>>({});

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setOpen(false);
        return;
      }
      const signInUrl = getSignInUrl(
        scopeKey ?? GUEST_SCOPE_KEY,
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      if (signInUrl != null) {
        setPendingSignInUrl(signInUrl);
        return;
      }
      setOpen(true);
    },
    [scopeKey],
  );

  const source = props.demo ? DEMO_ITEMS : props.items;
  const supportsLiked = props.demo || source.some((item) => item.liked !== undefined);
  const supportedTabs = supportsLiked
    ? HEADER_TABS
    : HEADER_TABS.filter((candidate) => candidate.value !== "liked");
  const headerTabs = imageOnly
    ? supportedTabs.filter((candidate) => candidate.value !== "video")
    : supportedTabs;
  const activeTab =
    (!supportsLiked && tab === "liked") || (imageOnly && tab === "video") ? "uploads" : tab;
  const page = props.demo ? undefined : props.pagination[activeTab];
  const activeItemCount = useMemo(
    () =>
      source.reduce((count, item) => {
        if (imageOnly && item.kind === "video") return count;
        return (
          count +
          (activeTab === "liked"
            ? Number(item.liked === true)
            : Number((item.kind ?? "image") === TAB_KIND[activeTab]))
        );
      }, 0),
    [activeTab, imageOnly, source],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter((item) => {
      if (imageOnly && item.kind === "video") {
        return false;
      }
      if (
        activeTab === "liked" ? item.liked !== true : (item.kind ?? "image") !== TAB_KIND[activeTab]
      ) {
        return false;
      }
      if (scope === "personal" && item.personal === false) {
        return false;
      }
      if (q !== "" && !`${item.name} ${item.type}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [source, activeTab, imageOnly, scope, query]);
  const gridItems = useMemo<({ upload: true } | { upload: false; item: AssetLibraryItem })[]>(
    () => [
      ...(activeTab === "uploads" ? [{ upload: true as const }] : []),
      ...visible.map((item) => ({ upload: false as const, item })),
    ],
    [activeTab, visible],
  );

  const requestPage = useCallback(
    (retry = false) => {
      if (
        !open ||
        page == null ||
        page.loading ||
        loadingMoreRef.current[activeTab] === true ||
        (!retry && (!page.hasMore || page.error != null))
      ) {
        return;
      }

      loadingMoreRef.current[activeTab] = true;
      void Promise.resolve(page.onLoadMore())
        .catch(() => undefined)
        .finally(() => {
          loadingMoreRef.current[activeTab] = false;
        });
    },
    [activeTab, open, page],
  );

  // Auto-fill only the unfiltered default scope. Search results page explicitly
  // so one narrow query cannot silently walk the user's entire library.
  useEffect(() => {
    if (!open || page?.loading || query.trim() !== "" || scope !== "all") return;
    if (activeItemCount < 15) requestPage();
  }, [activeItemCount, open, page?.loading, query, requestPage, scope]);

  const handleFile = async (file: File, close: () => void) => {
    setUploadError(null);
    if (props.demo) {
      // Explicit scaffold demo only: browser-local preview with no durable ref.
      onSelect?.({ name: file.name, type: file.type || "Upload", src: URL.createObjectURL(file) });
      close();
      return;
    }
    setUploading(true);
    try {
      const uploaded = await props.onUpload(file);
      onSelect?.(uploaded);
      close();
    } catch {
      setUploadError("Upload failed — check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal.Root open={open} onOpenChange={handleOpenChange}>
      <SignInModal
        open={pendingSignInUrl != null}
        signInUrl={pendingSignInUrl}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingSignInUrl(null);
        }}
      />
      <Modal.Trigger render={trigger} />
      <Modal.Content size="xl">
        <Modal.Header flush className="px-2 py-1">
          <Tabs.Root
            variant="pill"
            value={activeTab}
            onValueChange={(value) => setTab(String(value) as AssetLibraryTab)}
            className="flex-1"
          >
            <Tabs.List items={headerTabs} />
          </Tabs.Root>
          <Modal.CloseButton />
        </Modal.Header>

        <div className="flex h-[595px] flex-col gap-px overflow-clip rounded-q-400">
          <AssetToolbar
            scope={scope}
            onScopeChange={setScope}
            query={query}
            onQueryChange={setQuery}
          />
          {uploadError != null ? (
            <div className="shrink-0 bg-q-transparent-light-05 px-3 py-2">
              <Typography as="p" variant="caption-sm-regular" color="danger">
                {uploadError}
              </Typography>
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col bg-q-transparent-light-05">
            {visible.length === 0 && page?.loading ? (
              <div className="flex flex-1 items-center justify-center py-10">
                <Loader size="sm" color="neutral" aria-label="Loading assets" />
              </div>
            ) : visible.length === 0 && page?.error != null ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
                <div className="flex flex-col gap-1">
                  <Typography as="p" variant="body-md-semi-bold" color="primary">
                    Couldn’t load your library
                  </Typography>
                  <Typography as="p" variant="caption-sm-regular" color="secondary">
                    {page.error}
                  </Typography>
                </div>
                <Button variant="tertiary" size="xs" onClick={() => requestPage(true)}>
                  Retry
                </Button>
              </div>
            ) : visible.length === 0 ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1">
                  <AssetLibraryEmptyState
                    accept={activeTab === "uploads" ? accept : undefined}
                    uploading={uploading}
                    onFile={activeTab === "uploads" ? handleFile : undefined}
                  />
                </div>
                {page?.hasMore && (query.trim() !== "" || scope !== "all") ? (
                  <div className="flex shrink-0 items-center justify-center py-3">
                    <Button variant="tertiary" size="xs" onClick={() => requestPage()}>
                      {query.trim() !== "" ? "Search more" : "Load more"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <VirtualGrid
                items={gridItems}
                cols={5}
                rowHeight={148}
                gap={3}
                overscan={3}
                height="100%"
                viewportClassName="min-h-0 flex-1 p-2"
                getKey={(entry, index) =>
                  entry.upload ? "upload" : (entry.item.ref?.id ?? `${entry.item.src}-${index}`)
                }
                onEndReached={
                  query.trim() === "" && scope === "all" && page?.loading !== true
                    ? requestPage
                    : undefined
                }
                endReachedThresholdPx={LOAD_MORE_MARGIN}
                renderItem={(entry) =>
                  entry.upload ? (
                    <UploadCard accept={accept} uploading={uploading} onFile={handleFile} />
                  ) : (
                    <ElementCard item={entry.item} onSelect={onSelect} />
                  )
                }
              />
            )}
            {visible.length > 0 && page?.loading ? (
              <div className="flex shrink-0 items-center justify-center py-3">
                <Loader size="sm" color="neutral" aria-label="Loading more assets" />
              </div>
            ) : visible.length > 0 && page?.error != null ? (
              <div className="flex items-center justify-center gap-3 py-4" role="alert">
                <Typography as="p" variant="caption-sm-regular" color="danger">
                  {page.error}
                </Typography>
                <Button variant="tertiary" size="xs" onClick={() => requestPage(true)}>
                  Retry
                </Button>
              </div>
            ) : visible.length > 0 && page?.hasMore && (query.trim() !== "" || scope !== "all") ? (
              <div className="flex shrink-0 items-center justify-center py-3">
                <Button variant="tertiary" size="xs" onClick={() => requestPage()}>
                  {query.trim() !== "" ? "Search more" : "Load more"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Modal.Content>
    </Modal.Root>
  );
}
