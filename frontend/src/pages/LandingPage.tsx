import { Link } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { useAuth } from "../hooks/useAuth";

const STEPS = [
  {
    title: "Connect a repo",
    body: "Sign in with GitHub and paste a repo URL and branch — no config files required.",
    tags: ["GitHub OAuth", "Branch + env vars"],
  },
  {
    title: "We build it",
    body: "CloudShip clones, detects your bundler, and runs the build in an isolated sandbox.",
    tags: ["Vite · CRA · Next.js · Astro", "SQS job queue"],
  },
  {
    title: "Get a live URL",
    body: "Assets are uploaded to S3 and served through CloudFront in seconds.",
    tags: ["S3 + CloudFront", "Real-time logs via SSE"],
  },
];

export default function LandingPage() {
  const { user, logout } = useAuth();

  return (
    <>
      <Header user={user} onLogout={logout} />

      <section className="hero">
        <div className="page hero-grid">
          <div>
            <h1>
              Ship your frontend
              <br />
              <span className="gradient-text">straight from GitHub</span>
            </h1>
            <p className="hero-sub">
              Paste a repo URL, pick a branch, and CloudShip clones, builds, and deploys it to a
              live URL — no CLI, no config.
            </p>
            <div className="hero-ctas">
              <Link to="/login" className="btn btn-primary btn-pill">
                Sign in with GitHub
              </Link>
            </div>
          </div>

          <div className="hero-visual">
            <div className="terminal">
              <div className="terminal-titlebar">
                <div className="terminal-dots">
                  <span /><span /><span />
                </div>
                <div className="terminal-title">cloudship-worker.log</div>
              </div>
              <div className="terminal-body">
                <div>$ git clone --depth 1 https://github.com/you/app.git</div>
                <div className="terminal-line-muted">Cloning into sandbox…</div>
                <div>$ npm install --no-audit --include=dev</div>
                <div className="terminal-line-muted">added 214 packages in 6.2s</div>
                <div>$ npm run build -- --base=./</div>
                <div className="terminal-line-success">✓ built in 3.4s</div>
                <div className="terminal-line-success">
                  ✓ live at cloudship.app/sites/dep_8f2c…
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="page">
          <div className="section-heading">
            <h2>How it works</h2>
          </div>
          <div className="steps-list">
            {STEPS.map((step, idx) => (
              <div className="step-block" key={step.title}>
                <div className="step-num">{String(idx + 1).padStart(2, "0")}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <div className="tag-row">
                  {step.tags.map((tag) => (
                    <span className="tag-pill" key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
