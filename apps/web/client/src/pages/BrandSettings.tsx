import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import type { BrandLogo, BrandSettingsView } from "../types";

type Values = Record<string, string>;

const TEXT_FIELDS = ["agencyName", "officeAddress", "contactPhone", "contactEmail", "website", "primaryColour", "secondaryColour", "headingFont", "bodyFont", "toneOfVoice"] as const;

const NOT_SET = "Not set";
const APPLIES = "Brand settings apply to new campaigns. Campaigns you have already created keep the branding they were made with.";
const LOGO_HINT = "PNG, JPEG, WebP or SVG, up to 2 MB. SVG and WebP logos are converted to PNG.";
const FONT_HINT = "WOFF, WOFF2, TTF or OTF, up to 2 MB. One static font file; variable fonts are not supported.";
const TONE_HINT = "Saved for future use. It does not change the copy ListingBoost writes today.";

function toValues(view: BrandSettingsView): Values {
  const values: Values = {};
  for (const name of TEXT_FIELDS) values[name] = view.settings[name] ?? "";
  // A saved choice that can no longer be made is shown as "no preference", with an explanation beside it.
  for (const t of view.templates) values[`template:${t.slot}`] = t.preferred && t.preferredAvailable ? t.preferred : "";
  return values;
}

/** Empty inputs are sent as null: an unset value is never given a default. */
function toPayload(values: Values, view: BrandSettingsView) {
  const payload: Record<string, unknown> = {};
  for (const name of TEXT_FIELDS) payload[name] = values[name]!.trim() ? values[name] : null;
  payload.preferredTemplates = Object.fromEntries(view.templates.map((t) => [t.slot, values[`template:${t.slot}`]!] as const).filter(([, id]) => id));
  return payload;
}

const formatDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const fontLabel = (view: BrandSettingsView, ref: string | null) =>
  [...view.fonts.heading, ...view.fonts.body, ...view.fonts.custom].find((f) => f.ref === ref)?.label ?? null;

type SettingProps = {
  label: string;
  /** Explains the field. Shown with "Not set" in front when the saved value is empty. */
  hint?: string;
  unset?: boolean;
  warning?: string | undefined;
  error?: string | undefined;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode;
};

/** A labelled control whose hint, warning and error are all tied to it for assistive technology. */
function Setting({ label, hint, unset, warning, error, children }: SettingProps) {
  const id = useId();
  const hintText = [unset ? `${NOT_SET}.` : null, hint].filter(Boolean).join(" ");
  const describedBy = [hintText ? `${id}-hint` : null, warning ? `${id}-warning` : null, error ? `${id}-error` : null].filter(Boolean).join(" ");
  return (
    <div className={`field${error ? " field--error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy || undefined })}
      {hintText && (
        <p className="field__hint" id={`${id}-hint`}>
          {hintText}
        </p>
      )}
      {warning && (
        <p className="field__warning" id={`${id}-warning`}>
          {warning}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function LogoPreview({ logo, alt }: { logo: BrandLogo; alt: string }) {
  return <img className="brand__logo" src={logo.url} alt={alt} width={logo.width} height={logo.height} />;
}

function Editor({ view, onChange }: { view: BrandSettingsView; onChange: (view: BrandSettingsView) => void }) {
  const [values, setValues] = useState<Values>(() => toValues(view));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | undefined>();
  const [fontFile, setFontFile] = useState<File | null>(null);
  const [fontName, setFontName] = useState("");
  const [rights, setRights] = useState(false);
  const [fontError, setFontError] = useState<string | undefined>();
  const [rightsError, setRightsError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  const focusFirstError = useRef(false);
  const fontInput = useRef<HTMLInputElement>(null);
  const rightsId = useId();

  // After a failed save, move focus to the first field that needs fixing.
  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    formRef.current?.querySelector<HTMLElement>('[data-setting][aria-invalid="true"]')?.focus();
  }, [errors]);

  const bind = (name: string) => ({
    "data-setting": name,
    value: values[name] ?? "",
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  const unset = (name: (typeof TEXT_FIELDS)[number]) => view.settings[name] === null;

  /** Uploads and removals take effect straight away, without waiting for Save. Typed values are kept. */
  function applied(next: BrandSettingsView, message: string) {
    onChange(next);
    setStatus(message);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setStatus("");
    try {
      const next = await api<BrandSettingsView>("/api/brand-settings", { method: "PUT", json: toPayload(values, view) });
      setErrors({});
      setValues(toValues(next));
      onChange(next);
      setStatus(["Brand settings saved. Changes apply to new campaigns only.", ...Object.values(next.warnings)].join(" "));
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) {
        focusFirstError.current = true;
        setErrors(error.fields);
        setFormError(error.message);
      } else {
        setErrors({});
        setFormError("Your changes could not be saved. Nothing you typed has been lost. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setLogoError(undefined);
    setStatus("");
    const form = new FormData();
    form.append("file", file);
    try {
      const next = await api<BrandSettingsView>("/api/brand-settings/logo", { form });
      const converted = next.logo?.originalFormat === "svg" || next.logo?.originalFormat === "webp";
      applied(next, converted ? "Logo uploaded. It was converted to PNG so it can be drawn on your graphics." : "Logo uploaded.");
    } catch (error) {
      setLogoError(error instanceof ApiError ? (error.fields.file ?? error.message) : "The logo could not be uploaded. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreLogo(logo: BrandLogo) {
    setBusy(true);
    setLogoError(undefined);
    setStatus("");
    try {
      applied(await api<BrandSettingsView>(`/api/brand-settings/logos/${logo.id}/restore`, { method: "POST" }), "Logo restored.");
    } catch (error) {
      setLogoError(error instanceof ApiError ? error.message : "The logo could not be restored. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFont() {
    setFontError(undefined);
    setRightsError(undefined);
    setStatus("");
    if (!fontFile) {
      setFontError("Choose a font file to upload.");
      return;
    }
    if (!rights) {
      setRightsError("Confirm that you have the right to use this font.");
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append("file", fontFile);
    form.append("rightsConfirmed", "true");
    if (fontName.trim()) form.append("label", fontName);
    try {
      const next = await api<BrandSettingsView>("/api/brand-settings/fonts", { form });
      applied(next, "Font uploaded. You can now choose it for headings or body text.");
      // The confirmation is asked for again on every upload.
      setFontFile(null);
      setFontName("");
      setRights(false);
      if (fontInput.current) fontInput.current.value = "";
    } catch (error) {
      if (error instanceof ApiError && error.fields.rightsConfirmed) setRightsError(error.fields.rightsConfirmed);
      else setFontError(error instanceof ApiError ? (error.fields.file ?? error.message) : "The font could not be uploaded. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFont(id: string) {
    setBusy(true);
    setFontError(undefined);
    setStatus("");
    try {
      const next = await api<BrandSettingsView>(`/api/brand-settings/fonts/${id}`, { method: "DELETE" });
      // A removed font can no longer be chosen, so it is cleared from the font lists too.
      const ref = `custom:${id}`;
      setValues((v) => ({ ...v, headingFont: v.headingFont === ref ? "" : v.headingFont!, bodyFont: v.bodyFont === ref ? "" : v.bodyFont! }));
      applied(next, "Font removed. Campaigns that already use it are not affected.");
    } catch (error) {
      setFontError(error instanceof ApiError ? error.message : "The font could not be removed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const fontSelect = (name: "headingFont" | "bodyFont", label: string, hint: string) => (
    <Setting label={label} hint={hint} unset={unset(name)} error={errors[name]}>
      {(p) => (
        <select {...p} {...bind(name)}>
          <option value="">{NOT_SET} (the template's own font)</option>
          <optgroup label="Headings">
            {view.fonts.heading.map((f) => (
              <option key={f.ref} value={f.ref}>{f.label}</option>
            ))}
          </optgroup>
          <optgroup label="Body text">
            {view.fonts.body.map((f) => (
              <option key={f.ref} value={f.ref}>{f.label}</option>
            ))}
          </optgroup>
          {view.fonts.custom.length > 0 && (
            <optgroup label="Your fonts">
              {view.fonts.custom.map((f) => (
                <option key={f.ref} value={f.ref}>{f.label}</option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </Setting>
  );

  const colour = (name: "primaryColour" | "secondaryColour", label: string, hint: string) => (
    <Setting label={label} hint={hint} unset={unset(name)} warning={view.warnings[name]} error={errors[name]}>
      {(p) => (
        <span className="brand__colour">
          <input {...p} {...bind(name)} inputMode="text" autoComplete="off" spellCheck={false} />
          {/* A colour input always shows some colour, so an unset value is drawn as "none" rather than as black. */}
          <span className={`brand__swatch${/^#[0-9a-fA-F]{6}$/.test(values[name] ?? "") ? "" : " brand__swatch--unset"}`}>
            <input
              type="color"
              aria-label={`Pick ${label.toLowerCase()}`}
              value={/^#[0-9a-fA-F]{6}$/.test(values[name] ?? "") ? values[name] : "#000000"}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
            />
          </span>
        </span>
      )}
    </Setting>
  );

  return (
    <form className="form brand" onSubmit={save} noValidate ref={formRef}>
      {formError && <p className="banner banner--error" role="alert">{formError}</p>}

      <fieldset>
        <legend>Agency details</legend>
        <Setting label="Agency name" hint="Shown on your graphics and used in your copy." unset={unset("agencyName")} error={errors.agencyName}>
          {(p) => <input {...p} {...bind("agencyName")} autoComplete="organization" />}
        </Setting>
        <Setting label="Office address" hint="Up to 4 lines." unset={unset("officeAddress")} error={errors.officeAddress}>
          {(p) => <textarea {...p} {...bind("officeAddress")} rows={3} autoComplete="street-address" />}
        </Setting>
      </fieldset>

      <fieldset>
        <legend>Contact details</legend>
        <div className="form__row">
          <Setting label="Phone" unset={unset("contactPhone")} error={errors.contactPhone}>
            {(p) => <input {...p} {...bind("contactPhone")} type="tel" autoComplete="tel" />}
          </Setting>
          <Setting label="Email" unset={unset("contactEmail")} error={errors.contactEmail}>
            {(p) => <input {...p} {...bind("contactEmail")} type="email" autoComplete="email" />}
          </Setting>
        </div>
        <Setting label="Website" hint="Starting with https://" unset={unset("website")} error={errors.website}>
          {(p) => <input {...p} {...bind("website")} type="url" autoComplete="url" />}
        </Setting>
      </fieldset>

      <fieldset>
        <legend>Logo</legend>
        <p className="form__note">A logo is saved as soon as you choose it; you do not need to press Save.</p>
        {view.logo ? <LogoPreview logo={view.logo} alt="Current logo" /> : <p className="empty">No logo set. Your agency name is shown on graphics instead.</p>}
        <Setting label="Upload a logo" hint={LOGO_HINT} error={logoError}>
          {(p) => <input {...p} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" disabled={busy} onChange={(e) => void uploadLogo(e.target.files?.[0])} />}
        </Setting>
        {view.previousLogos.length > 0 && (
          <>
            <h3 className="brand__subheading">Previous logos</h3>
            <ul className="brand__logos">
              {view.previousLogos.map((logo) => (
                <li key={logo.id}>
                  <LogoPreview logo={logo} alt={`Previous logo, uploaded ${formatDate(logo.createdAt)}`} />
                  <button type="button" className="button button--quiet" disabled={busy} aria-label={`Restore logo uploaded ${formatDate(logo.createdAt)}`} onClick={() => void restoreLogo(logo)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Colours and typography</legend>
        <div className="form__row">
          {colour("primaryColour", "Primary colour", "As #RRGGBB. Used behind white text on your graphics.")}
          {colour("secondaryColour", "Secondary colour", "As #RRGGBB.")}
        </div>
        <div className="form__row">
          {fontSelect("headingFont", "Heading font", "Used for headlines on your graphics.")}
          {fontSelect("bodyFont", "Body font", "Used for other text on your graphics.")}
        </div>
        <fieldset>
          <legend>Fonts you have uploaded</legend>
          {view.fonts.custom.length === 0 ? (
            <p className="form__note">No fonts uploaded. You can use the fonts in the lists above, or add your own.</p>
          ) : (
            <ul className="brand__fonts">
              {view.fonts.custom.map((f) => (
                <li key={f.id}>
                  <span>{f.label}</span>
                  <button type="button" className="button button--quiet button--danger" disabled={busy} aria-label={`Remove ${f.label}`} onClick={() => void removeFont(f.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Setting label="Font file" hint={FONT_HINT} error={fontError}>
            {(p) => <input {...p} ref={fontInput} type="file" accept=".woff,.woff2,.ttf,.otf" disabled={busy} onChange={(e) => setFontFile(e.target.files?.[0] ?? null)} />}
          </Setting>
          <Setting label="Font name (optional)" hint="How it appears in the font lists. Defaults to the file name.">
            {(p) => <input {...p} value={fontName} maxLength={60} onChange={(e) => setFontName(e.target.value)} />}
          </Setting>
          <div className={`field${rightsError ? " field--error" : ""}`}>
            <label className="brand__check" htmlFor={rightsId}>
              <input
                id={rightsId}
                type="checkbox"
                checked={rights}
                aria-invalid={Boolean(rightsError)}
                aria-describedby={rightsError ? `${rightsId}-error` : undefined}
                onChange={(e) => setRights(e.target.checked)}
              />
              I have the right to use this font in my marketing.
            </label>
            {rightsError && (
              <p className="field__error" id={`${rightsId}-error`}>
                {rightsError}
              </p>
            )}
          </div>
          <div className="form__actions">
            <button type="button" className="button" disabled={busy} onClick={() => void uploadFont()}>
              Upload font
            </button>
          </div>
        </fieldset>
      </fieldset>

      <fieldset>
        <legend>Tone and templates</legend>
        <Setting label="Tone preference" hint={TONE_HINT} unset={unset("toneOfVoice")} error={errors.toneOfVoice}>
          {(p) => <input {...p} {...bind("toneOfVoice")} maxLength={200} />}
        </Setting>
        <p className="form__note">Choose the layout each graphic uses in new campaigns.</p>
        {view.templates.map((t) => (
          <Setting
            key={t.slot}
            label={t.label}
            warning={t.preferredAvailable ? undefined : "The layout you chose before is no longer available. Choose another."}
            error={errors[`preferredTemplates.${t.slot}`]}
          >
            {(p) => (
              <select {...p} {...bind(`template:${t.slot}`)}>
                <option value="">No preference ({t.options[0]?.label})</option>
                {t.options.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            )}
          </Setting>
        ))}
      </fieldset>

      <div className="form__actions">
        <button type="submit" className="button button--primary" disabled={busy}>
          Save brand settings
        </button>
      </div>
      <p className={status ? "banner banner--success" : "visually-hidden"} role="status" aria-label="Brand settings updates" aria-live="polite">
        {status}
      </p>
    </form>
  );
}

/** Members see the same values as plain text, each with its name, and no controls. */
function ReadOnly({ view }: { view: BrandSettingsView }) {
  const value = (v: string | null) => v ?? NOT_SET;
  const groups: Array<{ title: string; rows: Array<[string, string]>; extra?: ReactNode }> = [
    { title: "Agency details", rows: [["Agency name", value(view.settings.agencyName)], ["Office address", value(view.settings.officeAddress)]] },
    { title: "Contact details", rows: [["Phone", value(view.settings.contactPhone)], ["Email", value(view.settings.contactEmail)], ["Website", value(view.settings.website)]] },
    { title: "Logo", rows: [], extra: view.logo ? <LogoPreview logo={view.logo} alt="Current logo" /> : <p className="empty">No logo set.</p> },
    {
      title: "Colours and typography",
      rows: [
        ["Primary colour", value(view.settings.primaryColour)],
        ["Secondary colour", value(view.settings.secondaryColour)],
        ["Heading font", value(fontLabel(view, view.settings.headingFont))],
        ["Body font", value(fontLabel(view, view.settings.bodyFont))],
      ],
    },
    {
      title: "Tone and templates",
      rows: [
        ["Tone preference", value(view.settings.toneOfVoice)],
        ...view.templates.map((t): [string, string] => [
          t.label,
          !t.preferred ? `No preference (${t.options[0]?.label})` : t.preferredAvailable ? (t.options.find((o) => o.id === t.preferred)?.label ?? t.preferred) : "No longer available",
        ]),
      ],
    },
  ];
  return (
    <div className="form brand">
      <p className="banner banner--warning">Only an owner of your organisation can change brand settings.</p>
      {groups.map((group) => (
        <section key={group.title} className="brand__readonly" aria-label={group.title}>
          <h2>{group.title}</h2>
          {group.extra}
          {group.rows.length > 0 && (
            <dl>
              {group.rows.map(([term, description]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </div>
  );
}

export function BrandSettingsPage() {
  const [view, setView] = useState<BrandSettingsView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<BrandSettingsView>("/api/brand-settings").then(
      (loaded) => !cancelled && setView(loaded),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="brand__header">
        <h1>Brand Settings</h1>
        <p className="form__note">{APPLIES}</p>
      </header>
      {failed ? (
        <p className="banner banner--error" role="alert">Brand settings could not be loaded. Refresh the page to try again.</p>
      ) : view === null ? (
        <p className="loading" role="status">Loading…</p>
      ) : view.canEdit ? (
        <Editor view={view} onChange={setView} />
      ) : (
        <ReadOnly view={view} />
      )}
    </>
  );
}
