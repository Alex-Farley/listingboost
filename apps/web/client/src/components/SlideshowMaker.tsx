import { useState } from "react";
import { api, ApiError } from "../api";
import { reelEncoder, type SlideshowPlan } from "../reel/encoder";

type Props = { base: string; remake: boolean; onDone: () => Promise<void> };

/** Makes the slideshow Reel from the listing's photos in this browser, then uploads it for review. */
export function SlideshowMaker({ base, remake, onDone }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const encoder = reelEncoder();

  if (!encoder.supported()) {
    return <p className="asset__note">This browser can't make video. Use a recent version of Chrome, Edge, Safari or Firefox to create the Reel.</p>;
  }

  async function make() {
    setError(null);
    setProgress(0);
    try {
      const plan = await api<SlideshowPlan>(`${base}/slideshow`);
      let reel;
      try {
        reel = await encoder.encode(plan, setProgress);
      } catch {
        throw new Error("We couldn't make the Reel in this browser. Try again, or use a different browser.");
      }
      const form = new FormData();
      form.append("video", new File([reel.bytes], "reel.mp4", { type: "video/mp4" }));
      form.append("photoIds", JSON.stringify(reel.photoIds));
      await api(`${base}/slideshow`, { form });
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      {progress !== null && (
        <p className="asset__note" role="status">
          Making your Reel… {Math.round(progress * 100)}%
        </p>
      )}
      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}
      {progress === null && (
        <button className="button" type="button" onClick={() => void make()}>
          {remake ? "Make a new Reel" : "Create slideshow Reel"}
        </button>
      )}
    </>
  );
}
