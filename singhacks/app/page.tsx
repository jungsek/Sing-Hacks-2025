import Link from "next/link";

import { HeroHighlight, Highlight } from "@/components/ui/hero-highlight";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Home() {
  const metrics = [
    {
      label: "Assets under management",
      value: "$12.3M",
      change: "+12.4%",
    },
    {
      label: "New accounts",
      value: "1,284",
      change: "+18.2%",
    },
    {
      label: "Auto-invest adoption",
      value: "67%",
      change: "+9.6%",
    },
  ];

  const activity = [
    {
      label: "Revenue",
      value: "$423,456",
      descriptor: "Quarter to date",
    },
    {
      label: "Risk exposure",
      value: "Low",
      descriptor: "Portfolio variance",
    },
    {
      label: "Cash runway",
      value: "18 months",
      descriptor: "Projected at current burn",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background/90 to-background/60 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-6 pb-24">
        <header className="flex h-16 items-center justify-between py-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              QF
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold uppercase tracking-[0.3em]">
                Quantify
              </span>
              <span className="text-xs text-muted-foreground">
                Financial Operating System
              </span>
            </div>
          </Link>
          <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <Link href="#features" className="transition hover:text-foreground">
              Features
            </Link>
            <Link href="#metrics" className="transition hover:text-foreground">
              Metrics
            </Link>
            <Link href="#security" className="transition hover:text-foreground">
              Security
            </Link>
            <Link href="#pricing" className="transition hover:text-foreground">
              Pricing
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="hidden md:inline-flex" asChild>
              <Link href="/auth/login">Log in</Link>
            </Button>
            <Button className="hidden md:inline-flex" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </header>

        <section className="relative mt-12 flex flex-col items-center gap-10">
          <HeroHighlight>
            <Badge
              variant="secondary"
              className="flex items-center gap-2 rounded-full bg-muted px-4 py-1 text-xs font-medium text-muted-foreground shadow-sm"
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              We raised $69M Series B to empower modern finance teams
            </Badge>

            <div className="flex flex-col items-center gap-6 text-center">
              <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
                One intelligent platform for{" "}
                <Highlight>your financial strategy</Highlight>
              </h1>
              <p className="max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
                Quantify centralizes forecasting, treasury automation, and
                investor reporting so your team can focus on bold decisions, not
                spreadsheets.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button size="lg" className="h-12 px-8" asChild>
                  <Link href="/signup">Start your free trial</Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-12 px-8 text-sm font-semibold text-primary hover:bg-primary/10"
                  asChild
                >
                  <Link href="/contact">
                    Contact sales
                    <span className="ml-2 text-base">&rarr;</span>
                  </Link>
                </Button>
              </div>
            </div>

            <Card className="w-full max-w-4xl border-border/40 bg-background/90 shadow-[0_40px_120px_-40px_rgba(79,70,229,0.45)] backdrop-blur">
              <div className="flex flex-col gap-6 p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Executive overview
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold">
                      Portfolio Pulse
                    </h2>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full">
                    Download report
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-2xl border border-border/40 bg-muted/40 p-4 text-left shadow-inner"
                    >
                      <p className="text-xs text-muted-foreground">
                        {metric.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">
                        {metric.value}
                      </p>
                      <p className="text-xs font-medium text-emerald-500">
                        {metric.change}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="col-span-2 grid gap-5 rounded-2xl border border-border/40 bg-muted/20 p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Growth trajectory
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ARR vs. burn over the last 12 months
                        </p>
                      </div>
                      <Badge className="rounded-full bg-primary/10 text-primary">
                        Stable
                      </Badge>
                    </div>
                    <div className="h-36 w-full rounded-xl bg-gradient-to-br from-primary/10 via-primary/20 to-primary/5">
                      <div className="h-full w-full bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.35),transparent_60%),radial-gradient(circle_at_75%_40%,rgba(99,102,241,0.3),transparent_55%)] opacity-80" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Jan</span>
                      <span>Apr</span>
                      <span>Jul</span>
                      <span>Oct</span>
                      <span>Now</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 rounded-2xl border border-border/40 bg-background/80 p-6">
                    {activity.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-dashed border-border/50 p-4"
                      >
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="mt-2 text-xl font-semibold text-foreground">
                          {item.value}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.descriptor}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </HeroHighlight>
        </section>
      </div>
    </main>
  );
}
