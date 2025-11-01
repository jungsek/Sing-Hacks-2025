"use client";

import { motion } from "motion/react";
import { useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";

import { BackgroundBeams } from "@/components/ui/background-beams";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroHighlight, Highlight } from "@/components/ui/hero-highlight";
import { Spotlight } from "@/components/ui/spotlight";
import {
  MobileNav,
  MobileNavHeader,
  MobileNavMenu,
  MobileNavToggle,
  NavBody,
  NavItems,
  Navbar as ResizableNavbar,
  NavbarButton,
} from "@/components/ui/resizable-navbar";

const productHighlights = [
  {
    title: "Supervisor-led orchestration",
    description:
      "LangGraph coordinates sanctions, adverse media, and synthesis agents so compliance teams see every decision gate.",
  },
  {
    title: "Glass-box transparency",
    description:
      "Stream every agent step, surface citations instantly, and keep the audit trail open for regulators and partner reviews.",
  },
  {
    title: "Supabase-native records",
    description:
      "Persist clients, findings, and conversations with RLS-ready tables that map to production deployments on Vercel.",
  },
];

const runTimeline = [
  {
    label: "step",
    title: "GlobalWatchlistScreener",
    detail: "Running sanctions & PEP check - Castellum API - 3 sources queued",
    duration: "00:08s",
  },
  {
    label: "finding",
    title: "Risk signal logged",
    detail: "Potential match - Confidence 0.74 - Manual confirmation required",
    duration: "00:18s",
  },
  {
    label: "final",
    title: "Report synthesized",
    detail: "Overall risk: Medium - Recommendation: Enhanced monitoring",
    duration: "00:42s",
  },
];

const navLinks = [
  { name: "Overview", link: "#overview" },
  { name: "Workflow", link: "#workflow" },
  { name: "Security", link: "#security" },
  { name: "Roadmap", link: "#roadmap" },
];

export default function HeroSectionOne() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function generateTestPdf() {
    try {
      setPdfLoading(true);

      const payload = {
        title: 'Test PDF from UI',
        subtitle: 'Generated from the main page',
        items: ['Item one', 'Item two', 'Item three'],
        filename: 'test',
      };

      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`PDF generation failed: ${res.status} ${text}`);
      }

      const blob = await res.blob();

      // try to extract filename from content-disposition header
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match ? match[1] : 'test.pdf';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      // simple client-side feedback; keep UX minimal
       
      console.error(error);
      const message = error instanceof Error ? error.message : 'Failed to generate PDF.';
      alert(message);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <BackgroundBeams className="opacity-60 blur-[1px]" />
        <Spotlight className="-left-20 top-[-40%] hidden opacity-70 md:block" />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
      </div>

      <ResizableNavbar className="!top-6">
        <NavBody className="px-6 py-3">
          <Link
            href="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1 text-sm font-semibold tracking-wide text-foreground shadow-sm backdrop-blur"
          >
            Aura
            <span className="text-xs font-normal text-muted-foreground">Glass-box EDD</span>
          </Link>
          <NavItems items={navLinks} onItemClick={() => setIsMobileMenuOpen(false)} />
          <div className="hidden items-center gap-3 lg:flex">
            <NavbarButton
              as={Link}
              href="/auth/login"
              variant="secondary"
              className="bg-background/80 dark:text-white"
            >
              Log in
            </NavbarButton>
            <NavbarButton as={Link} href="/dashboard" variant="gradient">
              Launch cockpit
            </NavbarButton>
          </div>
        </NavBody>

        <MobileNav className="px-4">
          <MobileNavHeader>
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-sm font-semibold text-foreground shadow-sm backdrop-blur"
            >
              Aura
            </Link>
            <MobileNavToggle
              isOpen={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen((open) => !open)}
            />
          </MobileNavHeader>
          <MobileNavMenu isOpen={isMobileMenuOpen} className="gap-6">
            <nav className="flex w-full flex-col gap-4 text-sm text-foreground">
              {navLinks.map((item) => (
                <Link
                  key={item.name}
                  href={item.link}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="rounded-lg bg-muted/40 px-3 py-2 font-medium hover:bg-muted"
                >
                  {item.name}
                </Link>
              ))}
            </nav>
            <div className="flex w-full flex-col gap-3">
              <NavbarButton
                as={Link}
                href="/auth/login"
                variant="secondary"
                className="w-full justify-center"
              >
                Log in
              </NavbarButton>
              <NavbarButton
                as={Link}
                href="/dashboard"
                variant="gradient"
                className="w-full justify-center"
              >
                Launch cockpit
              </NavbarButton>
            </div>
          </MobileNavMenu>
        </MobileNav>
      </ResizableNavbar>

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-20 px-6 pb-24 pt-32 sm:pt-36 md:px-8">
        <header className="flex flex-col items-center gap-8 text-center">
          <HeroHighlight className="max-w-5xl text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl lg:text-[4rem] xl:text-[4.5rem]">
            <motion.div
              initial={{
                opacity: 0,
              }}
              animate={{
                opacity: 1,
              }}
              transition={{
                duration: 0.3,
                delay: 0.1,
              }}
              className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-4"
            >
              Meet <Highlight className="px-2">Aura</Highlight>
            </motion.div>
            <h1 className="relative z-10 mx-auto max-w-4xl text-center text-2xl font-bold text-slate-700 dark:text-slate-300 md:text-4xl lg:text-7xl">
              {"Your Agentic AI-powered aura farming compliance officer"
                .split(" ")
                .map((word, index) => (
                  <motion.span
                    key={index}
                    initial={{ opacity: 0, filter: "blur(4px)", y: 10 }}
                    animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: index * 0.1,
                      ease: "easeInOut",
                    }}
                    className="mr-2 inline-block"
                  >
                    {word}
                  </motion.span>
                ))}
            </h1>
            <Badge
              variant="outline"
              className="border-primary/40 bg-background/70 text-xs uppercase tracking-wide text-primary backdrop-blur"
            >
              Automated universal risk assessment
            </Badge>
          </HeroHighlight>
          <motion.p
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            transition={{
              duration: 0.3,
              delay: 0.8,
            }}
            className="max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl"
          >
            Launch a LangGraph-powered workflow that pairs Groq-speed reasoning with Supabase audit
            trails. Every sanctions hit, adverse media snippet, and recommendation stays traceable
            in real time.
          </motion.p>
          <motion.div
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            transition={{
              duration: 0.3,
              delay: 1,
            }}
            className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            <Button size="lg" className="gap-2" asChild>
              <Link href="/dashboard">
                Start a screening
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="gap-2" asChild>
              <Link href="#demo">
                View live demo
                <Activity className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </motion.div>
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.3,
              delay: 1.2,
            }}
            className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 backdrop-blur">
              <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
              <span>Edge-ready route handlers</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 backdrop-blur">
              <ShieldAlert className="size-4 text-amber-500" aria-hidden="true" />
              <span>RLS enforced Supabase persistence</span>
            </div>
          </motion.div>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {productHighlights.map((item) => (
            <Card
              key={item.title}
              className="border-border/60 bg-background/70 shadow-sm backdrop-blur"
            >
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg font-semibold">{item.title}</CardTitle>
                <CardDescription className="text-base leading-relaxed text-muted-foreground">
                  {item.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Card className="border-border/70 bg-background/80 shadow-md backdrop-blur-lg">
          <CardHeader className="flex flex-col gap-3 text-left md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-2xl font-semibold">Live audit feed</CardTitle>
              <CardDescription>
                Streamed from{" "}
                <code className="rounded bg-muted px-2 py-1 text-xs">/api/screen</code> and stored
                in
                <span className="ml-1 font-medium text-foreground">agent_runs</span>.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-primary/50 bg-primary/5 text-primary">
              SSE - glass box mode
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-5">
              {runTimeline.map((step) => (
                <div
                  key={step.title}
                  className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/40 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <Badge
                      variant="outline"
                      className="w-fit border-border bg-background/70 text-[0.65rem] uppercase tracking-wide text-muted-foreground"
                    >
                      {step.label}
                    </Badge>
                    <p className="font-medium text-foreground">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {step.duration}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-background/60 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Risk summary
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  Medium - proceed with enhanced monitoring
                </p>
                <p className="mt-2 text-muted-foreground">
                  Backed by watchlist confidence scores, adverse media snippets, and Supabase
                  persisted report findings.
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Why Aura?</p>
                <p className="mt-2 text-muted-foreground">
                  Deploy on Vercel, wire Supabase auth, and let agents log every decision for
                  regulator-ready EDD workflows.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
