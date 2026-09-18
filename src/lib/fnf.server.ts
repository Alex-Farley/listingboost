import { createMediaClient } from "@higgsfield/fnf/media";
import { createWorkflowPlatformAdapter } from "@higgsfield/fnf/workflow-platform";

/** Server-only FNF clients. Browser code must cross the app-local RPC bridge. */
export function createServerFnf() {
  const adapter = createWorkflowPlatformAdapter({ baseUrl: "https://fnf.internal" });

  return {
    adapter,
    media: createMediaClient({ mediaAdapter: adapter }),
  };
}
