import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { api, ApiError } from "../api";
import { Field } from "../components/Field";
import { useSession } from "../session";

function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="auth">
      <Link to="/" className="wordmark">ListingBoost</Link>
      <section className="auth__card">
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function SignInPage() {
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to="/app/listings" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/signin", { json: { email, password } });
      await refresh();
      navigate("/app/listings", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Sign in">
      <form className="form" onSubmit={submit} noValidate>
        {error && <p className="banner banner--error" role="alert">{error}</p>}
        <Field label="Email">{(p) => <input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password">
          {(p) => <input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <button className="button button--primary button--wide" type="submit" disabled={busy}>
          Sign in
        </button>
      </form>
      <p className="auth__switch">
        New to ListingBoost? <Link to="/signup">Create an account</Link>
      </p>
    </AuthLayout>
  );
}

export function SignUpPage() {
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: "", agencyName: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to="/app/listings" replace />;

  const bind = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await api("/api/auth/signup", { json: values });
      await refresh();
      navigate("/app/listings", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account">
      <form className="form" onSubmit={submit} noValidate>
        {error && <p className="banner banner--error" role="alert">{error}</p>}
        <Field label="Your name" error={errors.name}>{(p) => <input {...p} autoComplete="name" {...bind("name")} />}</Field>
        <Field label="Agency name" error={errors.agencyName}>{(p) => <input {...p} autoComplete="organization" {...bind("agencyName")} />}</Field>
        <Field label="Email" error={errors.email}>{(p) => <input {...p} type="email" autoComplete="email" {...bind("email")} />}</Field>
        <Field label="Password" error={errors.password} hint="At least 12 characters.">
          {(p) => <input {...p} type="password" autoComplete="new-password" {...bind("password")} />}
        </Field>
        <button className="button button--primary button--wide" type="submit" disabled={busy}>
          Create account
        </button>
      </form>
      <p className="auth__switch">
        Already have an account? <Link to="/signin">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
