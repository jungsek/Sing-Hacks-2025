import { MAS_PORTAL_USER_AGENT } from "@/app/langgraph/tools/masPortal";

import type { RegulatorConfig } from "./types";

export const DEFAULT_LOOKBACK_DAYS = 30;
export const MAX_RESULTS_PER_QUERY = 6;
export const MAX_EXTRACT_URLS = 12;
export const MAX_PORTAL_PAGES = 2;
export const GRAPH_NAME = "sentinel";
export const CRITERIA_KEYWORDS = [
  "must",
  "should",
  "shall",
  "required",
  "ensure",
  "prohibit",
  "oblig",
] as const;

export const MAS_PDF_HEADERS: Record<string, string> = {
  "User-Agent": MAS_PORTAL_USER_AGENT,
  Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export const REGULATOR_CONFIGS: RegulatorConfig[] = [
  {
    code: "MAS",
    regulator: "MAS",
    includeDomains: ["mas.gov.sg"],
    queries: [
      "MAS AML guidelines",
      "MAS Notice 626 updates",
      "MAS counter terrorism financing circular",
      "Monetary Authority of Singapore AML circular",
    ],
    tags: ["regulatory", "mas"],
  },
  {
    code: "FINMA",
    regulator: "FINMA",
    includeDomains: ["finma.ch"],
    queries: [
      "FINMA AML guidelines",
      "FINMA money laundering ordinance update",
      "site:finma.ch Geldwaescherei Rundschreiben",
    ],
    tags: ["regulatory", "finma"],
  },
  {
    code: "HKMA",
    regulator: "HKMA",
    includeDomains: ["hkma.gov.hk"],
    queries: [
      "HKMA AML guideline update",
      "HKMA counter terrorist financing circular",
      "site:hkma.gov.hk anti-money laundering guidance",
    ],
    tags: ["regulatory", "hkma"],
  },
];
