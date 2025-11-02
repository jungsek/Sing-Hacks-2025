import type { RuleHit, SentinelState } from "@/app/langgraph/common/state";
import { ChatGroq } from "@langchain/groq";
import { getTransactionById, type TransactionRecord } from "@/lib/supabase/dao/transactions";
import type { SerializableRecord } from "@/lib/types";

const toPrimitive = (value: unknown): string | number | boolean | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num;
    }
  }
  return fallback;
};

const extractText = (response: unknown): string => {
  if (typeof response === "string") return response;
  if (!response || typeof response !== "object") {
    return String(response ?? "");
  }

  const container = response as { content?: unknown };
  const { content } = container;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as { text?: unknown; content?: unknown };
        if (typeof record.text === "string") return record.text;
        if (typeof record.content === "string") return record.content;
        return "";
      })
      .join("");
    if (joined.trim().length > 0) {
      return joined;
    }
  }
  return String(response ?? "");
};

const buildTransactionContext = (
  state: SentinelState,
  txn: TransactionRecord | undefined,
): Record<string, string | number | boolean | null> => {
  const metaSources: Array<SerializableRecord | null | undefined> = [
    txn?.meta ?? null,
    state.transaction?.meta ?? null,
  ];
  const meta: Record<string, unknown> =
    metaSources.find((m): m is SerializableRecord => !!m && typeof m === "object") ?? {};

  const getMetaValue = (key: string) => toPrimitive(meta[key]);

  return {
    transaction_id: txn?.id ?? state.transaction_id ?? null,
    amount: toNumber(txn?.amount ?? meta["amount"], 0),
    currency:
      typeof (txn?.currency ?? meta["currency"]) === "string"
        ? (txn?.currency ?? (meta["currency"] as string))
        : null,
    customer_id:
      typeof (txn?.customer_id ?? meta["customer_id"]) === "string"
        ? (txn?.customer_id ?? (meta["customer_id"] as string))
        : null,
    booking_jurisdiction: getMetaValue("booking_jurisdiction") as string | null,
    regulator: getMetaValue("regulator") as string | null,
    booking_datetime: getMetaValue("booking_datetime") as string | null,
    value_date: getMetaValue("value_date") as string | null,
    channel: getMetaValue("channel") as string | null,
    product_type: getMetaValue("product_type") as string | null,
    originator_country: getMetaValue("originator_country") as string | null,
    beneficiary_country: getMetaValue("beneficiary_country") as string | null,
    sanctions_screening: getMetaValue("sanctions_screening"),
    customer_type: getMetaValue("customer_type") as string | null,
    customer_risk_rating: getMetaValue("customer_risk_rating") as string | null,
    customer_is_pep: getMetaValue("customer_is_pep"),
    travel_rule_complete: getMetaValue("travel_rule_complete"),
    swift_f50_present: getMetaValue("swift_f50_present"),
    swift_f59_present: getMetaValue("swift_f59_present"),
    swift_f71_charges: getMetaValue("swift_f71_charges"),
    daily_cash_total_customer: getMetaValue("daily_cash_total_customer"),
    daily_cash_txn_count: getMetaValue("daily_cash_txn_count"),
    fx_indicator: getMetaValue("fx_indicator"),
    fx_spread_bps: getMetaValue("fx_spread_bps"),
    edd_required: getMetaValue("edd_required"),
    edd_performed: getMetaValue("edd_performed"),
    kyc_last_completed: getMetaValue("kyc_last_completed") as string | null,
    kyc_due_date: getMetaValue("kyc_due_date") as string | null,
    suspicion_determined_datetime: getMetaValue("suspicion_determined_datetime") as string | null,
    str_filed_datetime: getMetaValue("str_filed_datetime") as string | null,
    purpose_code: getMetaValue("purpose_code") as string | null,
    narrative: getMetaValue("narrative") as string | null,
  };
};

const RULE_CATALOG = [
  "txn:large_amount",
  "cash:large_cash_deposit",
  "cash:velocity_structuring",
  "screening:sanctions_potential",
  "kyc:pep",
  "kyc:customer_high_risk",
  "kyc:customer_medium_risk",
  "corridor:high_risk_country",
  "compliance:travel_rule_incomplete",
  "swift:missing_mandatory_fields",
  "swift:unusual_charges_code",
  "fx:unusual_spread",
  "txn:odd_tail",
  "kyc:edd_missing",
  "kyc:overdue",
  "str:suspicion_recorded",
];

const SYSTEM_PROMPT = [
  "You are a bank-grade AML Transaction Analysis agent.",
  "Level 1 focus only: derive AML signals from a single transaction's raw data (no Level 2+).",
  "Evaluate a single transaction and produce structured outputs strictly as JSON.",
  "Follow these rules:",
  "- Only pick rule_ids from the provided RULE_CATALOG when applicable.",
  "- Each rule hit MUST include a brief rationale (<= 160 chars) and a weight between 0.05 and 0.5.",
  "- Compute a final score in [0,1] as an aggregate of weights with light dampening if many minor hits.",
  "- Be conservative: use only the provided fields; if data is missing, avoid speculative hits.",
  "- Do not include personally identifying details in rationales.",
  "- If suspicion_determined_datetime is present, include str:suspicion_recorded.",
  "Return ONLY valid JSON per the schema with no markdown fences.",
].join("\n");

const buildUserPrompt = (context: Record<string, string | number | boolean | null>) => ({
  RULE_CATALOG,
  SCHEMA: {
    type: "object",
    required: ["rule_hits", "score"],
    properties: {
      rule_hits: {
        type: "array",
        items: {
          type: "object",
          required: ["rule_id", "rationale", "weight"],
          properties: {
            rule_id: { type: "string", enum: RULE_CATALOG },
            rationale: { type: "string" },
            weight: { type: "number", minimum: 0.05, maximum: 0.5 },
          },
        },
      },
      score: { type: "number", minimum: 0, maximum: 1 },
    },
  },
  GUIDANCE: {
    transactional: {
      ask: "How are funds moved and how much?",
      fields: ["channel", "product_type", "amount", "currency"],
      indicators: [
        "cash deposits (placement risk)",
        "cross-border wires (layering)",
        "structuring: repetitive similar/round amounts",
        "single large amounts inconsistent with profile",
      ],
    },
    geographic: {
      ask: "Are parties in high-risk jurisdictions?",
      fields: ["originator_country", "beneficiary_country"],
      examples: ["IR", "RU"],
    },
    customer: {
      ask: "Is entity type high-risk or behavior anomalous?",
      fields: ["customer_type", "customer_id"],
      indicators: ["domiciliary_company / shell", "repeated high-risk corridors"],
    },
    screening: {
      ask: "Did screening/STR indicators trigger?",
      fields: ["sanctions_screening", "suspicion_determined_datetime", "str_filed_datetime"],
    },
    controls: {
      ask: "Were KYC/EDD controls met?",
      fields: ["kyc_due_date", "booking_datetime", "value_date", "edd_required", "edd_performed"],
    },
  },
  RULE_MAPPINGS: {
    sanctions_screening: "if not 'clear' or 'none' => screening:sanctions_potential",
    suspicion_determined_datetime: "if present => str:suspicion_recorded",
    travel_rule_complete: "if false => compliance:travel_rule_incomplete",
    swift_fields:
      "if swift_f50_present=false or swift_f59_present=false => swift:missing_mandatory_fields",
    swift_charges: "if swift_f71_charges in ['BEN','SHA'] => swift:unusual_charges_code",
    pep: "if customer_is_pep=true => kyc:pep",
    customer_risk: "if high => kyc:customer_high_risk; if medium => kyc:customer_medium_risk",
    corridor:
      "if originator or beneficiary in high-risk (e.g., IR, RU) => corridor:high_risk_country",
    fx: "if fx_spread_bps is materially high (e.g., >50bps) => fx:unusual_spread",
    kyc_overdue: "if kyc_due_date < booking_datetime/value_date => kyc:overdue",
    edd_missing: "if edd_required=true and edd_performed=false => kyc:edd_missing",
    cash_velocity:
      "use daily_cash_total_customer / daily_cash_txn_count with cash channel => cash:velocity_structuring",
    cash_large: "cash channel + large amount (jurisdiction-aware) => cash:large_cash_deposit",
    large_amount: "large amount (jurisdiction-aware) => txn:large_amount",
    odd_tail: "round-number amount pattern => txn:odd_tail",
  },
  CONTEXT: context,
});

const sanitizeRuleHits = (candidate: unknown): RuleHit[] => {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const ruleId = record.rule_id;
      const rationale = record.rationale;
      const weight = record.weight;
      if (typeof ruleId !== "string" || typeof rationale !== "string") {
        return null;
      }
      const numericWeight = toNumber(weight, 0);
      if (!Number.isFinite(numericWeight)) {
        return null;
      }
      return {
        rule_id: ruleId,
        rationale: rationale.slice(0, 220),
        weight: numericWeight,
      } satisfies RuleHit;
    })
    .filter((hit): hit is RuleHit => hit !== null);
};

export async function transactionNode(state: SentinelState): Promise<Partial<SentinelState>> {
  let txn: TransactionRecord | undefined = state.transaction;
  if (!txn) {
    try {
      const fetched = await getTransactionById(state.transaction_id);
      if (fetched) {
        txn = fetched;
      }
    } catch {
      // ignore fetch errors; operate with minimal info
    }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured for LLM transaction analysis");
  }

  const context = buildTransactionContext(state, txn);
  const userPrompt = buildUserPrompt(context);

  // Ensure we always pass a concrete model string to the LLM
  const modelId = "openai/gpt-oss-20b";

  const llm = new ChatGroq({
    apiKey,
    model: modelId,
    temperature: 0.1,
    maxTokens: 800,
  });

  const response = await llm.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(userPrompt) },
  ]);

  const text = extractText(response);
  const parsed = (() => {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as Record<string, unknown>;
        } catch {}
      }
      return null;
    }
  })();

  if (!parsed || !parsed.rule_hits || typeof parsed.score !== "number") {
    throw new Error("LLM returned invalid transaction analysis JSON");
  }

  const ruleHits = sanitizeRuleHits(parsed.rule_hits);
  const score = Math.max(0, Math.min(1, parsed.score));

  return {
    transaction: txn ?? state.transaction,
    rule_hits: [...(state.rule_hits ?? []), ...ruleHits],
    score,
    transaction_analysis_origin: "llm",
    transaction_analysis_model: modelId,
  };
}
