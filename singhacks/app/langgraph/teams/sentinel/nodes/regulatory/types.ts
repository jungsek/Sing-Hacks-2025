import type { GraphEvent } from "@/app/langgraph/common/events";

export type RegulatoryNodeContext = {
  runId?: string;
  emit?: (event: GraphEvent) => Promise<void>;
  regulatorCodes?: string[];
};

export type RegulatorConfig = {
  code: string;
  regulator: string;
  includeDomains: string[];
  queries: string[];
  tags: string[];
};
