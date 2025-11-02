import type { RegulatorySnippet, SentinelState } from "@/app/langgraph/common/state";
import { searchRegulatorySources } from "@/lib/supabase/dao/regulatorySources";

const KEYWORD_MAP: Array<{ id: string; keys: string[] }> = [
  {
    id: "compliance:travel_rule_incomplete",
    keys: ["travel rule", "FATF", "transfer information"],
  },
  {
    id: "swift:missing_mandatory_fields",
    keys: ["SWIFT", "MT103", "originator", "beneficiary", "remitter"],
  },
  { id: "swift:unusual_charges_code", keys: ["SWIFT", "charges", "F71", "BEN", "SHA"] },
  { id: "screening:sanctions_potential", keys: ["sanctions", "watchlist", "screening", "OFAC"] },
  { id: "kyc:overdue", keys: ["KYC", "CDD", "periodic review", "due diligence", "expiry"] },
  { id: "kyc:edd_missing", keys: ["EDD", "enhanced due diligence", "high risk"] },
  { id: "cash:large_cash_deposit", keys: ["cash", "threshold", "CTR", "reporting"] },
  {
    id: "corridor:high_risk_country",
    keys: ["high risk country", "sanctioned country", "jurisdiction"],
  },
];

function buildKeywords(state: SentinelState): string[] {
  const out = new Set<string>();
  const meta = ((state.transaction?.meta ?? {}) as Record<string, unknown>) ?? {};
  const regulator = typeof meta.regulator === "string" ? meta.regulator : undefined;
  const channel = typeof meta.channel === "string" ? meta.channel : undefined;
  const product = typeof meta.product_type === "string" ? meta.product_type : undefined;
  const swiftCharges =
    typeof meta.swift_f71_charges === "string" ? meta.swift_f71_charges : undefined;
  const travelRule = meta.travel_rule_complete === false ? "travel rule" : undefined;
  const pep = meta.customer_is_pep === true ? "pep" : undefined;
  const screening =
    typeof meta.sanctions_screening === "string" ? meta.sanctions_screening : undefined;

  [regulator, channel, product, swiftCharges, travelRule, pep, screening]
    .filter((x): x is string => !!x && x.trim().length > 0)
    .forEach((k) => out.add(k));

  for (const mapping of KEYWORD_MAP) {
    for (const k of mapping.keys) out.add(k);
  }
  return Array.from(out).slice(0, 12);
}

export async function crossReferenceNode(state: SentinelState): Promise<Partial<SentinelState>> {
  const meta = ((state.transaction?.meta ?? {}) as Record<string, unknown>) ?? {};
  const regulator = typeof meta.regulator === "string" ? meta.regulator : undefined;
  const keywords = buildKeywords(state);

  const sources = await searchRegulatorySources({ keywords, regulator, limit: 20 });
  const snippets: RegulatorySnippet[] = [];

  for (const src of sources) {
    const text = (src.description ?? src.title ?? src.policy_url).toString().slice(0, 280);
    // Try to tag to one of our keyword mappings
    const mapped = KEYWORD_MAP.find((m) =>
      m.keys.some((k) => text.toLowerCase().includes(k.toLowerCase())),
    );
    snippets.push({
      rule_id: mapped?.id ?? `reg:${(src.regulator_name || "source").toLowerCase()}`,
      text,
      source_url: src.policy_url,
      level: "info",
    });
  }

  // De-dup by source_url+rule_id
  const seen = new Set<string>();
  const deduped = snippets.filter((s) => {
    const key = `${s.rule_id}|${s.source_url ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    regulatory_snippets: [...(state.regulatory_snippets ?? []), ...deduped].slice(-50),
  };
}
