import { Link } from "react-router-dom";
import { ArrowRight, GitBranch, Boxes, Terminal as TerminalIcon, ShieldCheck } from "lucide-react";
import GithubIcon from "../components/icons/GithubIcon";
import Header from "../components/Header";
import Footer from "../components/Footer";
import AuroraBackground from "../components/AuroraBackground";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "../hooks/useAuth";

const STATS = [
  { value: "1", suffix: "-click", label: "to deploy" },
  { value: "~10", suffix: "s", label: "repo to live build" },
  { value: "0", suffix: "", label: "config files needed" },
];

const FEATURES = [
  {
    icon: GithubIcon,
    title: "Connect a repo",
    body: "Sign in with GitHub and paste a repo URL and branch. No YAML, no CLI, no config files to write.",
    tags: ["GitHub OAuth", "Branch + env vars"],
  },
  {
    icon: Boxes,
    title: "We build it",
    body: "CloudShip clones your repo, detects the bundler, and runs an isolated build — Vite, CRA, Next.js, Astro, or plain static HTML.",
    tags: ["Auto-detected build", "SQS job queue"],
  },
  {
    icon: TerminalIcon,
    title: "Get a live URL",
    body: "Compiled assets are uploaded to S3 and served instantly through a clean reverse proxy, with build logs streamed live.",
    tags: ["S3 storage", "Real-time logs via SSE"],
  },
  {
    icon: GitBranch,
    title: "Push to redeploy",
    body: "Wire up a GitHub webhook once, and every push to your branch automatically rebuilds and redeploys to the same URL.",
    tags: ["GitHub webhooks", "HMAC signed"],
  },
  {
    icon: ShieldCheck,
    title: "Scoped & secure",
    body: "Every deployment is owned by its creator. Sessions are server-side only — no tokens ever touch the browser.",
    tags: ["Session auth", "Owner-scoped"],
  },
  {
    icon: ArrowRight,
    title: "Zero-config output",
    body: "Relative asset paths are rewritten automatically so your build runs cleanly behind CloudShip's proxy — no base-path config needed.",
    tags: ["SPA fallback", "Auto path rewrite"],
  },
];

export default function LandingPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <Header user={user} onLogout={logout} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <AuroraBackground />
        <div className="container relative flex flex-col items-center pb-20 pt-32 text-center">
          <Badge variant="outline" className="animate-fade-up border-white/15 bg-white/5 px-4 py-1.5 text-[12px] text-muted-foreground">
            A deployment platform for your side projects
          </Badge>

          <h1 className="mt-7 max-w-3xl animate-fade-up font-display text-7xl font-extrabold leading-[1.08] tracking-tight" style={{ animationDelay: "80ms" }}>
            Ship your frontend
            <br />
            <span className="text-gradient">straight from GitHub</span>
          </h1>

          <p className="mt-6 max-w-xl animate-fade-up text-balance text-lg text-muted-foreground" style={{ animationDelay: "160ms" }}>
            Paste a repo URL, pick a branch, and CloudShip clones, builds, and deploys it to a live
            URL — no CLI, no config.
          </p>

          <div className="mt-9 flex animate-fade-up flex-row gap-3" style={{ animationDelay: "240ms" }}>
            <Button asChild size="lg" className="group">
              <Link to="/login">
                <GithubIcon className="h-4 w-4" />
                Sign in with GitHub
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>

          {/* Terminal mockup */}
          <div className="relative mt-16 w-full max-w-2xl animate-fade-up" style={{ animationDelay: "320ms" }}>
            <div className="absolute -inset-px rounded-2xl bg-gradient-primary opacity-20 blur-2xl" />
            <Card className="glow-ring relative overflow-hidden bg-[hsl(0_0%_5%)] text-left shadow-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-2 font-mono text-xs text-muted-foreground">cloudship-worker.log</span>
              </div>
              <div className="space-y-1.5 p-5 font-mono text-[13px] leading-relaxed">
                <div className="text-foreground/90">
                  <span className="text-primary">$</span> git clone --depth 1 https://github.com/you/app.git
                </div>
                <div className="text-muted-foreground">Cloning into sandbox…</div>
                <div className="text-foreground/90">
                  <span className="text-primary">$</span> npm install --no-audit --include=dev
                </div>
                <div className="text-muted-foreground">added 214 packages in 6.2s</div>
                <div className="text-foreground/90">
                  <span className="text-primary">$</span> npm run build
                </div>
                <div className="text-success">✓ built in 3.4s</div>
                <div className="text-success">
                  ✓ live at cloudship.app/sites/dep_8f2c<span className="animate-blink">▊</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Stats */}
          <div className="mt-16 grid w-full max-w-xl grid-cols-3 gap-6 border-t border-white/10 pt-10">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="font-display text-4xl font-bold tabular-nums">
                  {stat.value}
                  <span className="text-gradient">{stat.suffix}</span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative border-t border-white/5 py-24" id="how-it-works">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">How it works</p>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight">
              From repo to live URL in three steps
            </h2>
            <p className="mt-4 text-muted-foreground">
              No dashboards to configure, no YAML to write. CloudShip handles the pipeline so you can
              focus on the code.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-3 gap-5" id="features">
            {FEATURES.map((feature) => (
              <Card
                key={feature.title}
                className="group relative overflow-hidden p-6 transition-colors hover:border-white/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-primary transition-colors group-hover:border-primary/30 group-hover:bg-primary/10">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {feature.tags.map((tag) => (
                    <Badge key={tag} variant="mono">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/5 py-24">
        <div className="container">
          <Card className="relative overflow-hidden px-16 py-16 text-center">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-1/2 h-64 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-primary opacity-20 blur-[100px]" />
            </div>
            <div className="relative">
              <h2 className="font-display text-4xl font-bold tracking-tight">
                Take control of your deployments
              </h2>
              <p className="mx-auto mt-4 max-w-md text-muted-foreground">
                Deploy your projects in a single click. No restrictive plans, no surprise bills.
              </p>
              <Button asChild size="lg" className="mt-8">
                <Link to="/login">
                  <GithubIcon className="h-4 w-4" />
                  Deploy your first project
                </Link>
              </Button>
            </div>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
