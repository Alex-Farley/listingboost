import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message || "We couldn't sign you in. Please check your details and try again.");
      setPending(false);
      return;
    }

    await navigate({ to: "/" });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <section className="w-full space-y-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">ListingBoost</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-neutral-600">Access your campaigns and keep your property marketing in one place.</p>
        </div>

        <form className="space-y-5" onSubmit={submit}>
          <label className="block text-sm font-medium">
            Email
            <input
              className="mt-2 block w-full rounded-lg border border-neutral-300 px-3 py-2.5"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className="mt-2 block w-full rounded-lg border border-neutral-300 px-3 py-2.5"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <button
            className="w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            type="submit"
            disabled={pending}
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-sm text-neutral-600">
          New to ListingBoost? <Link className="font-semibold text-black underline" to="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
