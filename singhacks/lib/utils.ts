import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

const REQUIRED_SUPABASE_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function hasEnvVars(
  envVars: readonly string[] = REQUIRED_SUPABASE_ENV_VARS,
): boolean {
  return envVars.every((envVar) => {
    const value = process.env[envVar]
    return typeof value === "string" && value.length > 0
  })
}
