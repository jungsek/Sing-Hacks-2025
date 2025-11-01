"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  CreditCard,
  FolderOpen,
  ShieldCheck,
  Settings,
  LogOut,
} from "lucide-react";
import Link from "next/link";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Transactions", icon: CreditCard, href: "/transactions" },
  { label: "Cases / Docs", icon: FolderOpen, href: "/documents" },
  { label: "Rules", icon: ShieldCheck, href: "/rules" },
];

export function JbSidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex h-screen w-60 flex-col border-r bg-[#f1f4f9] pb-4 pt-6 dark:bg-slate-950/40",
        className
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 px-5 pb-6">
        <div className="h-8 w-8 rounded-full bg-[#cf2b39] text-white flex items-center justify-center text-xs font-bold">
          JB
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Julius Baer</p>
          <p className="text-[0.65rem] text-muted-foreground">Compliance Hub</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-white/80 hover:text-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
                isActive
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800"
                  : "text-slate-700 dark:text-slate-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-4 space-y-1 px-3">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-800">
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-800">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
