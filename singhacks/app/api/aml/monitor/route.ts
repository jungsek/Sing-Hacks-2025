import { createSSEController } from "@/app/langgraph/common/stream";
import type { SentinelState } from "@/app/langgraph/common/state";
import { runSentinelSequential } from "@/app/langgraph/teams/sentinel";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { logAgentRun } from "@/lib/supabase/dao/agentRuns";
import { logMonitorRow } from "@/lib/supabase/dao/monitorRows";
import type { TransactionRecord } from "@/lib/supabase/dao/transactions";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Node runtime to enable reading CSV files for the demo path
export const runtime = "nodejs";

// Helpers for robust parsing of CSV cell values
const parseBool = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "t", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "f", "0", "no", "n"].includes(normalized)) return false;
  return undefined;
};
const parseNum = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

type MonitorRequest = {
  transaction_ids?: string[] | string;
  window?: { from: string; to: string };
  stream?: boolean;
  csv_demo?: boolean;
  csv_path?: string; // optional custom path
  limit?: number; // optional limit of rows to process
  concurrency?: number; // optional concurrency for processing
};

function splitCSVRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // toggle quotes or handle escaped quotes
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++; // skip next
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as MonitorRequest;
  const { transaction_ids, csv_demo = false, csv_path, limit } = body;

  const ids = Array.isArray(transaction_ids)
    ? transaction_ids
    : typeof transaction_ids === "string"
      ? [transaction_ids]
      : [];

  const sse = createSSEController();

  (async () => {
    try {
      const write = sse.write;
      const runId = `sentinel_${Date.now()}`;

      await write({
        type: "on_node_start",
        payload: {
          run_id: runId,
          graph: "sentinel",
          node: "init",
          ts: Date.now(),
          data: { csv_demo, csv_path },
        },
      });
      try {
        await logAgentRun({
          run_id: runId,
          graph: "sentinel",
          node: "ingest",
          status: "start",
          payload: { csv_demo, csv_path },
        });
      } catch {}

      // If CSV driving is requested, parse the file and drive runs per row.
      if (csv_demo || csv_path) {
        const defaultCsv = path.resolve(
          process.cwd(),
          "../requirements/transactions_mock_1000_for_participants.csv",
        );
        const filePath = csv_path ? path.resolve(process.cwd(), csv_path) : defaultCsv;
        const content = await readFile(filePath, "utf8");
        const rawLines = content.split(/\r?\n/);
        const lines = rawLines.filter((l) => l !== "");

        // locate header row: look for a line that includes the expected field "transaction_id"
        let headerLineIdx = lines.findIndex((line) => splitCSVRow(line).includes("transaction_id"));
        if (headerLineIdx < 0) headerLineIdx = 0; // fallback

        const header = splitCSVRow(lines[headerLineIdx]);
        await write({
          type: "on_tool_call",
          payload: {
            run_id: runId,
            graph: "sentinel",
            node: "ingest",
            ts: Date.now(),
            data: { type: "csv_header", header_index: headerLineIdx, fields: header },
          },
        });

        const hIndex = (name: string) => header.indexOf(name);
        const idx = {
          // identifiers & basics
          transaction_id: hIndex("transaction_id"),
          booking_jurisdiction: hIndex("booking_jurisdiction"),
          regulator: hIndex("regulator"),
          booking_datetime: hIndex("booking_datetime"),
          value_date: hIndex("value_date"),
          amount: hIndex("amount"),
          currency: hIndex("currency"),
          channel: hIndex("channel"),
          product_type: hIndex("product_type"),
          // counterparties
          originator_name: hIndex("originator_name"),
          originator_account: hIndex("originator_account"),
          originator_country: hIndex("originator_country"),
          beneficiary_name: hIndex("beneficiary_name"),
          beneficiary_account: hIndex("beneficiary_account"),
          beneficiary_country: hIndex("beneficiary_country"),
          // SWIFT / travel rule
          swift_mt: hIndex("swift_mt"),
          ordering_institution_bic: hIndex("ordering_institution_bic"),
          beneficiary_institution_bic: hIndex("beneficiary_institution_bic"),
          swift_f50_present: hIndex("swift_f50_present"),
          swift_f59_present: hIndex("swift_f59_present"),
          swift_f70_purpose: hIndex("swift_f70_purpose"),
          swift_f71_charges: hIndex("swift_f71_charges"),
          travel_rule_complete: hIndex("travel_rule_complete"),
          // FX
          fx_indicator: hIndex("fx_indicator"),
          fx_base_ccy: hIndex("fx_base_ccy"),
          fx_quote_ccy: hIndex("fx_quote_ccy"),
          fx_applied_rate: hIndex("fx_applied_rate"),
          fx_market_rate: hIndex("fx_market_rate"),
          fx_spread_bps: hIndex("fx_spread_bps"),
          fx_counterparty: hIndex("fx_counterparty"),
          // customer & KYC
          customer_id: hIndex("customer_id"),
          customer_type: hIndex("customer_type"),
          customer_risk_rating: hIndex("customer_risk_rating"),
          customer_is_pep: hIndex("customer_is_pep"),
          kyc_last_completed: hIndex("kyc_last_completed"),
          kyc_due_date: hIndex("kyc_due_date"),
          edd_required: hIndex("edd_required"),
          edd_performed: hIndex("edd_performed"),
          sow_documented: hIndex("sow_documented"),
          // intention & narrative
          purpose_code: hIndex("purpose_code"),
          narrative: hIndex("narrative"),
          // product suitability
          is_advised: hIndex("is_advised"),
          product_complex: hIndex("product_complex"),
          client_risk_profile: hIndex("client_risk_profile"),
          suitability_assessed: hIndex("suitability_assessed"),
          suitability_result: hIndex("suitability_result"),
          product_has_va_exposure: hIndex("product_has_va_exposure"),
          va_disclosure_provided: hIndex("va_disclosure_provided"),
          // cash controls
          cash_id_verified: hIndex("cash_id_verified"),
          daily_cash_total_customer: hIndex("daily_cash_total_customer"),
          daily_cash_txn_count: hIndex("daily_cash_txn_count"),
          // screening & STR
          sanctions_screening: hIndex("sanctions_screening"),
          suspicion_determined_datetime: hIndex("suspicion_determined_datetime"),
          str_filed_datetime: hIndex("str_filed_datetime"),
        } as const;

        let count = 0;
        const dataRowCount = Math.max(0, lines.length - (headerLineIdx + 1));
        const max = typeof limit === "number" && limit > 0 ? limit : dataRowCount;

        // Process strictly one-by-one: emit, process, then continue
        for (let i = headerLineIdx + 1; i < lines.length && count < max; i++) {
          try {
            const row = splitCSVRow(lines[i]);
            if (!row.length) continue;
            if (idx.transaction_id < 0) continue;
            const txnId = row[idx.transaction_id];
            if (!txnId || txnId.startsWith("//")) continue;

            const amountStr = idx.amount >= 0 ? row[idx.amount] : "0";
            const currency = idx.currency >= 0 ? row[idx.currency] : undefined;
            const meta = {
              // basics
              booking_jurisdiction:
                idx.booking_jurisdiction >= 0 ? row[idx.booking_jurisdiction] : undefined,
              regulator: idx.regulator >= 0 ? row[idx.regulator] : undefined,
              booking_datetime: idx.booking_datetime >= 0 ? row[idx.booking_datetime] : undefined,
              value_date: idx.value_date >= 0 ? row[idx.value_date] : undefined,
              channel: idx.channel >= 0 ? row[idx.channel] : undefined,
              product_type: idx.product_type >= 0 ? row[idx.product_type] : undefined,
              // counterparties
              originator_name: idx.originator_name >= 0 ? row[idx.originator_name] : undefined,
              originator_account:
                idx.originator_account >= 0 ? row[idx.originator_account] : undefined,
              originator_country:
                idx.originator_country >= 0 ? row[idx.originator_country] : undefined,
              beneficiary_name: idx.beneficiary_name >= 0 ? row[idx.beneficiary_name] : undefined,
              beneficiary_account:
                idx.beneficiary_account >= 0 ? row[idx.beneficiary_account] : undefined,
              beneficiary_country:
                idx.beneficiary_country >= 0 ? row[idx.beneficiary_country] : undefined,
              // SWIFT / travel rule
              swift_mt: idx.swift_mt >= 0 ? row[idx.swift_mt] : undefined,
              ordering_institution_bic:
                idx.ordering_institution_bic >= 0 ? row[idx.ordering_institution_bic] : undefined,
              beneficiary_institution_bic:
                idx.beneficiary_institution_bic >= 0
                  ? row[idx.beneficiary_institution_bic]
                  : undefined,
              swift_f50_present:
                idx.swift_f50_present >= 0 ? parseBool(row[idx.swift_f50_present]) : undefined,
              swift_f59_present:
                idx.swift_f59_present >= 0 ? parseBool(row[idx.swift_f59_present]) : undefined,
              swift_f70_purpose:
                idx.swift_f70_purpose >= 0 ? row[idx.swift_f70_purpose] : undefined,
              swift_f71_charges:
                idx.swift_f71_charges >= 0 ? row[idx.swift_f71_charges] : undefined,
              travel_rule_complete:
                idx.travel_rule_complete >= 0
                  ? parseBool(row[idx.travel_rule_complete])
                  : undefined,
              // FX
              fx_indicator:
                idx.fx_indicator >= 0
                  ? (parseBool(row[idx.fx_indicator]) ?? row[idx.fx_indicator])
                  : undefined,
              fx_base_ccy: idx.fx_base_ccy >= 0 ? row[idx.fx_base_ccy] : undefined,
              fx_quote_ccy: idx.fx_quote_ccy >= 0 ? row[idx.fx_quote_ccy] : undefined,
              fx_applied_rate:
                idx.fx_applied_rate >= 0 ? parseNum(row[idx.fx_applied_rate]) : undefined,
              fx_market_rate:
                idx.fx_market_rate >= 0 ? parseNum(row[idx.fx_market_rate]) : undefined,
              fx_spread_bps: idx.fx_spread_bps >= 0 ? parseNum(row[idx.fx_spread_bps]) : undefined,
              fx_counterparty: idx.fx_counterparty >= 0 ? row[idx.fx_counterparty] : undefined,
              // customer & KYC
              customer_id: idx.customer_id >= 0 ? row[idx.customer_id] : undefined,
              customer_type: idx.customer_type >= 0 ? row[idx.customer_type] : undefined,
              customer_risk_rating:
                idx.customer_risk_rating >= 0 ? row[idx.customer_risk_rating] : undefined,
              customer_is_pep:
                idx.customer_is_pep >= 0 ? parseBool(row[idx.customer_is_pep]) : undefined,
              kyc_last_completed:
                idx.kyc_last_completed >= 0 ? row[idx.kyc_last_completed] : undefined,
              kyc_due_date: idx.kyc_due_date >= 0 ? row[idx.kyc_due_date] : undefined,
              edd_required: idx.edd_required >= 0 ? parseBool(row[idx.edd_required]) : undefined,
              edd_performed: idx.edd_performed >= 0 ? parseBool(row[idx.edd_performed]) : undefined,
              sow_documented:
                idx.sow_documented >= 0 ? parseBool(row[idx.sow_documented]) : undefined,
              // intention & narrative
              purpose_code: idx.purpose_code >= 0 ? row[idx.purpose_code] : undefined,
              narrative: idx.narrative >= 0 ? row[idx.narrative] : undefined,
              // product suitability
              is_advised: idx.is_advised >= 0 ? parseBool(row[idx.is_advised]) : undefined,
              product_complex:
                idx.product_complex >= 0 ? parseBool(row[idx.product_complex]) : undefined,
              client_risk_profile:
                idx.client_risk_profile >= 0 ? row[idx.client_risk_profile] : undefined,
              suitability_assessed:
                idx.suitability_assessed >= 0
                  ? parseBool(row[idx.suitability_assessed])
                  : undefined,
              suitability_result:
                idx.suitability_result >= 0 ? row[idx.suitability_result] : undefined,
              product_has_va_exposure:
                idx.product_has_va_exposure >= 0
                  ? parseBool(row[idx.product_has_va_exposure])
                  : undefined,
              va_disclosure_provided:
                idx.va_disclosure_provided >= 0
                  ? parseBool(row[idx.va_disclosure_provided])
                  : undefined,
              // cash controls
              cash_id_verified:
                idx.cash_id_verified >= 0 ? parseBool(row[idx.cash_id_verified]) : undefined,
              daily_cash_total_customer:
                idx.daily_cash_total_customer >= 0
                  ? parseNum(row[idx.daily_cash_total_customer])
                  : undefined,
              daily_cash_txn_count:
                idx.daily_cash_txn_count >= 0 ? parseNum(row[idx.daily_cash_txn_count]) : undefined,
              // screening & STR
              sanctions_screening:
                idx.sanctions_screening >= 0 ? row[idx.sanctions_screening] : undefined,
              suspicion_determined_datetime:
                idx.suspicion_determined_datetime >= 0
                  ? row[idx.suspicion_determined_datetime]
                  : undefined,
              str_filed_datetime:
                idx.str_filed_datetime >= 0 ? row[idx.str_filed_datetime] : undefined,
            };

            await write({
              type: "on_tool_call",
              payload: {
                run_id: runId,
                graph: "sentinel",
                node: "ingest",
                ts: Date.now(),
                data: {
                  type: "csv_row",
                  index: i,
                  transaction_id: txnId,
                  meta: {
                    booking_jurisdiction: meta.booking_jurisdiction,
                    regulator: meta.regulator,
                    booking_datetime: meta.booking_datetime,
                    amount: Number(amountStr || 0),
                    currency,
                    originator_name: meta.originator_name,
                    originator_country: meta.originator_country,
                    beneficiary_name: meta.beneficiary_name,
                    beneficiary_country: meta.beneficiary_country,
                    travel_rule_complete: meta.travel_rule_complete,
                    sanctions_screening: meta.sanctions_screening,
                    customer_risk_rating: meta.customer_risk_rating,
                  },
                },
              },
            });
            try {
              await logMonitorRow({
                run_id: runId,
                index: i,
                transaction_id: txnId,
                meta: {
                  booking_jurisdiction: meta.booking_jurisdiction,
                  regulator: meta.regulator,
                  booking_datetime: meta.booking_datetime,
                  amount: Number(amountStr || 0),
                  currency,
                  originator_name: meta.originator_name,
                  originator_country: meta.originator_country,
                  beneficiary_name: meta.beneficiary_name,
                  beneficiary_country: meta.beneficiary_country,
                  travel_rule_complete: meta.travel_rule_complete,
                  sanctions_screening: meta.sanctions_screening,
                  customer_risk_rating: meta.customer_risk_rating,
                },
              });
            } catch {}

            const transactionRecord: TransactionRecord = {
              id: txnId,
              amount: Number(amountStr || 0),
              currency: currency ?? null,
              customer_id: typeof meta.customer_id === "string" ? meta.customer_id : null,
              meta,
            };

            const init: SentinelState = {
              transaction_id: txnId,
              transaction: transactionRecord,
              rule_hits: [],
              score: 0,
            };

            try {
              await runSentinelSequential(init, write);
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : String(error ?? "");
              await write({
                type: "on_error",
                payload: {
                  run_id: runId,
                  graph: "sentinel",
                  node: "transaction",
                  ts: Date.now(),
                  data: { index: i, transaction_id: txnId, message },
                },
              });
              try {
                await logAgentRun({
                  run_id: runId,
                  graph: "sentinel",
                  node: "transaction",
                  status: "error",
                  payload: {
                    index: i,
                    transaction_id: txnId,
                    message,
                  },
                });
              } catch {}
            }
            count++;
          } catch (rowError: unknown) {
            const message =
              rowError instanceof Error ? rowError.message : String(rowError ?? "");
            await write({
              type: "on_error",
              payload: {
                run_id: runId,
                graph: "sentinel",
                node: "ingest",
                ts: Date.now(),
                data: { index: i, message },
              },
            });
            try {
              await logAgentRun({
                run_id: runId,
                graph: "sentinel",
                node: "ingest",
                status: "error",
                payload: { index: i, message },
              });
            } catch {}
          }
        }

        await write({
          type: "on_node_end",
          payload: {
            run_id: runId,
            graph: "sentinel",
            node: "ingest",
            ts: Date.now(),
            data: { processed: count, total_lines: lines.length, data_rows: dataRowCount },
          },
        });
        try {
          await logAgentRun({
            run_id: runId,
            graph: "sentinel",
            node: "ingest",
            status: "end",
            payload: { processed: count, total_lines: lines.length, data_rows: dataRowCount },
          });
        } catch {}

        await sse.close();
        return;
      }

      // Otherwise process the explicit list of ids
      for (const txnId of ids) {
        try {
          const init: SentinelState = {
            transaction_id: txnId,
            rule_hits: [],
            score: 0,
          };
          await runSentinelSequential(init, write);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error ?? "");
          await write({
            type: "on_error",
            payload: {
              run_id: runId,
              graph: "sentinel",
              node: "transaction",
              ts: Date.now(),
              data: { transaction_id: txnId, message },
            },
          });
          try {
            await logAgentRun({
              run_id: runId,
              graph: "sentinel",
              node: "transaction",
              status: "error",
              payload: { transaction_id: txnId, message },
            });
          } catch {}
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
      await sse.write({
        type: "on_error",
        payload: {
          run_id: `sentinel_${Date.now()}`,
          graph: "sentinel",
          ts: Date.now(),
          data: { message },
        },
      });
    } finally {
      await sse.close();
    }
  })();

  // If not streaming, we could accumulate and return JSON; for MVP we stream
  return sse.response;
}
