"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { JbSidebar } from "@/components/ui/jb-sidebar";
import { JbTopbar } from "@/components/ui/jb-topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { ArrowUpRight, RefreshCcw } from "lucide-react";

type RegulatorySource = {
  id: string;
  regulator_name: string;
  title: string;
  description: string;
  policy_url: string;
  image_url: string;
  published_date: string;
  last_updated: string;
};

export default function RegulatorySourcesPage() {
  const [sources, setSources] = useState<RegulatorySource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchSources() {
      setLoading(true);
      const { data, error } = await supabase
        .from("regulatory_sources")
        .select("*")
        .order("published_date", { ascending: false });

      if (error) {
        console.error("Error fetching sources:", error);
      } else {
        setSources(data || []);
      }
      setLoading(false);
    }

    fetchSources();
  }, []);

  return (
    <div className="flex min-h-screen bg-[#e6ecf3] dark:bg-slate-950/10">
      {/* Sidebar */}
      <JbSidebar />

      <div className="flex flex-1 flex-col">
        {/* Topbar */}
        <JbTopbar />

        {/* Main content */}
        <main className="flex-1 space-y-6 p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Regulatory Sources
            </h1>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          {/* Cards grid */}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading sources...</p>
          ) : sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No regulatory data found.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {sources.map((src) => (
                <Card
                  key={src.id}
                  className="bg-white/70 dark:bg-slate-900/40 hover:shadow-md transition"
                >
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div className="flex items-center gap-3">
                      {src.image_url ? (
                        // you can replace <Image> with <img> if not whitelisted
                        <img
                          src={src.image_url}
                          alt={src.regulator_name}
                          width={40}
                          height={40}
                          className="rounded-md bg-white object-contain"
                        />
                      ) : null}
                      <div>
                        <CardTitle className="text-base font-semibold leading-tight">
                          {src.regulator_name}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                          Published {new Date(src.published_date).toLocaleDateString()}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[0.7rem]">
                      Updated {new Date(src.last_updated).toLocaleDateString()}
                    </Badge>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <h3 className="font-medium text-sm leading-snug">{src.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {src.description}
                    </p>

                    <div className="flex items-center justify-between pt-2">
                      <Button
                        variant="link"
                        size="sm"
                        className="gap-1 text-sm text-blue-600"
                        onClick={() => window.open(src.policy_url, "_blank")}
                      >
                        View policy
                        <ArrowUpRight className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs px-2">
                        Update
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
