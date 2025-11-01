"use client";

import { Search, Globe } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function JbTopbar({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b bg-background/70 px-6 backdrop-blur",
        className
      )}
    >
      {/* search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-lg border bg-muted/40 pl-9 pr-3 text-sm outline-none focus:border-primary focus:bg-background"
          placeholder="Search transactions and cases..."
        />
      </div>

      {/* right */}
      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Globe className="h-4 w-4" />
          Eng (US)
        </button>
      </div>
    </header>
  );
}
