import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { Media } from "../types";
import { EnhancedPhotos } from "./Campaign";
import { useWorkspace } from "./Workspace";

export function ImagesTab() {
  const { property } = useWorkspace();
  const base = `/api/properties/${property.id}/media`;
  const [items, setItems] = useState<Media[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setItems((await api<{ items: Media[] }>(base)).items);
  }, [base]);

  useEffect(() => {
    let cancelled = false;
    api<{ items: Media[] }>(base).then((page) => !cancelled && setItems(page.items), () => !cancelled && setErrors(["Could not load photos."]));
    return () => {
      cancelled = true;
    };
  }, [base]);

  async function upload(files: FileList | File[] | null) {
    if (!files) return;
    setBusy(true);
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      try {
        await api(base, { form });
      } catch (e) {
        failures.push(`${file.name}: ${e instanceof ApiError ? e.message : "Upload failed."}`);
      }
    }
    setErrors(failures);
    await load();
    setBusy(false);
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setErrors([e instanceof ApiError ? e.message : "Something went wrong."]);
    }
    await load();
    setBusy(false);
  }

  function move(index: number, delta: number) {
    if (!items) return;
    const order = items.map((m) => m.id);
    const [moved] = order.splice(index, 1);
    order.splice(index + delta, 0, moved!);
    void act(() => api(`${base}/order`, { method: "PUT", json: { mediaIds: order } }));
  }

  return (
    <>
    <section aria-label="Photographs" className="images">
      <div className="images__upload">
        <label className="button button--primary" htmlFor="photo-upload">
          Add photos
        </label>
        <input
          id="photo-upload"
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={(e) => void upload(e.target.files)}
        />
        <p className="field__hint">JPEG, PNG or WebP, up to 25 MB, at least 400 pixels on the shortest side.</p>
      </div>
      {errors.length > 0 && (
        <ul className="banner banner--error" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {items === null ? (
        <p className="loading" role="status">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No photos yet. The first photo you add becomes the primary image.</p>
      ) : (
        <ul className="photo-grid">
          {items.map((m, i) => (
            <li key={m.id} data-media-id={m.id} className="photo">
              <img src={m.url} alt={m.originalFilename} loading="lazy" width={m.width} height={m.height} />
              <div className="photo__meta">
                {m.isPrimary && <span className="badge">Primary</span>}
                <span>
                  {m.width} × {m.height}
                </span>
              </div>
              <div className="photo__actions">
                <button type="button" className="button button--quiet" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">
                  ←
                </button>
                <button type="button" className="button button--quiet" disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move later">
                  →
                </button>
                {!m.isPrimary && (
                  <button type="button" className="button button--quiet" disabled={busy} onClick={() => void act(() => api(`${base}/${m.id}/primary`, { method: "POST" }))}>
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  className="button button--quiet button--danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Delete ${m.originalFilename}?`)) void act(() => api(`${base}/${m.id}`, { method: "DELETE" }));
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
    <EnhancedPhotos />
    </>
  );
}
