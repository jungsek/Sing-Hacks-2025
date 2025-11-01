import { ChatGroq } from "@langchain/groq";
import { getTransactionById, type TransactionRecord } from "@/lib/supabase/dao/transactions";
import type { SerializableRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type Level1Request = {
  transaction?: {
    id?: string;
    amount?: number;
    currency?: string;
    customer_id?: string;
    meta?: SerializableRecord;
  };
  transaction_id?: string;
};

type Level1Context = {
  transaction_id: string | null;
  amount: number;
  currency: string | null;
  customer_id: string | null;
} & Record<string, string | number | boolean | null>;

type Level1GraphState = {
  context: Level1Context;
  analysis_text?: string;
};

type Level1GraphCompiled = {
  invoke: (state: Level1GraphState) => Promise<Level1GraphState>;
};

type Level1GraphInstance = {
  addNode: (
    name: string,
    handler: (state: Level1GraphState) => Promise<Partial<Level1GraphState>> | Partial<Level1GraphState>,
  ) => void;
  addEdge: (from: string, to: string) => void;
  compile: () => Level1GraphCompiled;
};

type Level1GraphConstructor = new (config: Record<string, unknown>) => Level1GraphInstance;

let stateGraphCtor: Level1GraphConstructor | undefined;

void import("@langchain/langgraph")
  .then((module) => {
    const ctor = module?.StateGraph as unknown;
    if (typeof ctor === "function") {
      stateGraphCtor = ctor as Level1GraphConstructor;
    }
  })
  .catch(() => {
    stateGraphCtor = undefined;
  });

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
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const parseLevel1Request = (payload: unknown): Level1Request => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const request: Level1Request = {};

  if (record.transaction_id && typeof record.transaction_id === "string") {
    request.transaction_id = record.transaction_id;
  }

  const txnInput = record.transaction;
  if (txnInput && typeof txnInput === "object") {
    const txnRecord = txnInput as Record<string, unknown>;
    request.transaction = {
      id: typeof txnRecord.id === "string" ? txnRecord.id : undefined,
      amount: typeof txnRecord.amount === "number" ? txnRecord.amount : undefined,
      currency: typeof txnRecord.currency === "string" ? txnRecord.currency : undefined,
      customer_id: typeof txnRecord.customer_id === "string" ? txnRecord.customer_id : undefined,
      meta:
        txnRecord.meta && typeof txnRecord.meta === "object"
          ? (txnRecord.meta as SerializableRecord)
          : undefined,
    };
  }

  return request;
};

const normalizeContext = (
  txn: TransactionRecord | undefined,
  fallbackId: string | undefined,
): Level1Context => {
  const meta = (txn?.meta && typeof txn.meta === "object" ? txn.meta : {}) as Record<string, unknown>;

  const getMetaValue = (key: string): string | number | boolean | null => toPrimitive(meta[key]);

  return {
    transaction_id: txn?.id ?? fallbackId ?? null,
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

const SYSTEM_PROMPT = [
  "You are a bank-grade AML Transaction Monitoring analyst focused on Level 1 data analysis.",
  "ONLY produce a formatted analysis of a single transaction. Do NOT provide any numeric risk score, weights, or rule IDs.",
  "Be conservative, rely only on provided fields. If data is missing, call it out.",
  "Do not include any personally identifying details beyond what is provided; summarize where appropriate.",
  "Output strictly as Markdown with the following sections:",
  "- Summary",
  "- Transactional Factors (What)",
  "- Geographic Factors (Where)",
  "- Customer Factors (Who)",
  "- Screening & Alerts (Flags)",
  "- Internal Controls (Compliance Gaps)",
  "- Preliminary Risk Signals (bulleted list; no scores or IDs)",
  "- Evidence (key fields & values used)",
  "- Caveats & Missing Data",
].join("\n");

const buildUserPrompt = (context: Level1Context) => ({
  TASK: "Level 1 transaction analysis (no scoring, no rule IDs).",
  CONTEXT: context,
  GUIDANCE: {
    transactional: {
      ask: "How are funds moved and how much?",
      indicators: [
        "cash deposits (placement risk)",
        "wire transfers across borders (layering)",
        "structuring: repetitive similar/round amounts",
        "single large amounts inconsistent with profile",
      ],
    },
    geographic: {
      ask: "Are parties in high-risk jurisdictions?",
      examples: ["IR, RU"],
    },
    customer: {
      ask: "Is entity type high-risk or behavior anomalous?",
      examples: ["domiciliary_company / shell", "repeated high-risk corridors"],
    },
    screening: {
      ask: "Did screening/STR indicators trigger?",
      fields: ["sanctions_screening", "suspicion_determined_datetime", "str_filed_datetime"],
    },
    controls: {
      ask: "Were KYC/EDD controls met?",
      fields: ["kyc_due_date vs booking/value date", "edd_required", "edd_performed"],
    },
  },
});

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
        const partRecord = part as { text?: unknown; content?: unknown };
        if (typeof partRecord.text === "string") return partRecord.text;
        if (typeof partRecord.content === "string") return partRecord.content;
        return "";
      })
      .join("");
    if (joined.trim().length > 0) {
      return joined;
    }
  }
  return String(response ?? "");
};

const runLevel1LLM = async (context: Level1Context, apiKey: string): Promise<string> => {
  const llm = new ChatGroq({
    apiKey,
    model: process.env.GROQ_MODEL ?? "llama3-70b-8192",
    temperature: 0.2,
    maxTokens: 1200,
  });

  const userPrompt = buildUserPrompt(context);
  const response = await llm.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(userPrompt) },
  ]);

  return extractText(response);
};

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response("GROQ_API_KEY not configured", { status: 500 });
  }

  const rawBody = await req.json().catch(() => ({}));
  const body = parseLevel1Request(rawBody);

  let txn: TransactionRecord | undefined;
  const incoming = body.transaction;
  const id = body.transaction_id ?? incoming?.id;

  if (incoming) {
    txn = {
      id: incoming.id ?? id ?? "",
      amount: incoming.amount ?? undefined,
      currency: incoming.currency ?? null,
      customer_id: incoming.customer_id ?? null,
      meta: incoming.meta ?? undefined,
    };
  } else if (id) {
    try {
      const fetched = await getTransactionById(id);
      if (fetched) {
        txn = fetched;
      }
    } catch {
      txn = { id, meta: {} };
    }
  }

  const context = normalizeContext(txn, id);

  if (stateGraphCtor) {
    const graph = new stateGraphCtor({});
    graph.addNode("level1", async (state: Level1GraphState) => {
      const analysis_text = await runLevel1LLM(state.context, apiKey);
      return { analysis_text };
    });
    graph.addEdge("__start__", "level1");
    graph.addEdge("level1", "__end__");

    const compiled = graph.compile();
    const out = await compiled.invoke({ context });
    const analysis = out.analysis_text ?? "";
    return new Response(analysis, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const analysis = await runLevel1LLM(context, apiKey);
  return new Response(analysis, {
    status: 200,
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

