import { Link } from "react-router";

const STEPS = [
  { title: "Upload", body: "Add the property's facts and its photographs." },
  { title: "Create", body: "ListingBoost prepares enhanced photos, social posts, Stories, a Reel and copy." },
  { title: "Review", body: "Approve, edit or regenerate every asset. Nothing is final until you approve it." },
  { title: "Publish", body: "Download individual assets or the complete marketing pack." },
];

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing__header">
        <span className="wordmark">ListingBoost</span>
        <nav>
          <Link to="/signin">Sign in</Link>
          <Link className="button button--primary" to="/signup">
            Create account
          </Link>
        </nav>
      </header>
      <section className="landing__hero">
        <p className="eyebrow">Property marketing for UK estate agents</p>
        <h1>One property. Every piece of marketing you need.</h1>
        <p className="landing__trust">We enhance the photograph. We never change the property.</p>
      </section>
      <ol className="landing__steps">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <span className="landing__step-number">{String(i + 1).padStart(2, "0")}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
