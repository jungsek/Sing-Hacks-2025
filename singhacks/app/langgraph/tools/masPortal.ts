import { load } from "cheerio";
import { createHash } from "node:crypto";

import type { SerializableRecord } from "@/lib/types";

export type MasPortalListingParams = {
  topic: string;
  contentType: string;
  page?: number;
  maxPages?: number;
  updatedAfter?: string;
};

export type MasPortalListingCard = {
  url: string;
  title?: string;
  summary?: string;
  publishedAt?: string;
  topic: string;
  contentType: string;
  sourceHash?: string;
  metadata?: SerializableRecord;
};

export type MasPortalListingResult = {
  cards: MasPortalListingCard[];
  raw?: string;
  error?: Error;
};

export type MasPortalDetail = {
  url: string;
  title?: string;
  publishedAt?: string;
  pdfLinks: string[];
  html: string;
};

const MAS_BASE_URL = "https://www.mas.gov.sg";
const LISTING_PATH = "/regulation/regulations-and-guidance";
const SEARCH_COMPONENT_ENDPOINT =
  "https://www.mas.gov.sg/api/v1/MAS/SearchFromComponent?searchurl=%2fsearch";

export const MAS_PORTAL_TOPICS = ["anti-money-laundering", "regulatory-submissions"];

export const MAS_PORTAL_CONTENT_TYPES = [
  "Notices",
  "Circulars",
  "Guidelines",
  "Regulations",
  "Acts",
];

export const MAS_PORTAL_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

export const MAS_PORTAL_HTML_HEADERS: Record<string, string> = {
  "User-Agent": MAS_PORTAL_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const MAS_PORTAL_SEARCH_HEADERS: Record<string, string> = {
  "User-Agent": MAS_PORTAL_USER_AGENT,
  Accept: "application/json, text/plain, */*",
  "X-Requested-With": "XMLHttpRequest",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
};

function buildListingUrl(params: MasPortalListingParams): string {
  const url = new URL(LISTING_PATH, MAS_BASE_URL);
  url.searchParams.set("topics", params.topic);
  url.searchParams.set("contentType", params.contentType);
  if (params.page && params.page > 1) {
    url.searchParams.set("page", String(params.page));
  }
  return url.toString();
}

function absoluteUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (/^https?:/i.test(href)) return href;
  if (href.startsWith("//")) {
    return `https:${href}`;
  }
  if (href.startsWith("/")) {
    return `${MAS_BASE_URL}${href}`;
  }
  return `${MAS_BASE_URL}/${href}`;
}

function hashSource(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

type RawHeaderAccessor = {
  raw?: () => Record<string, string[]>;
};

async function bootstrapListingSession(
  params: MasPortalListingParams,
): Promise<{ token?: string; cookieHeader?: string; html: string }> {
  const listingUrl = buildListingUrl(params);
  const response = await fetch(listingUrl, {
    headers: MAS_PORTAL_HTML_HEADERS,
    redirect: "manual",
  });
  const html = await response.text();
  const tokenMatch = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i);
  const token = tokenMatch?.[1];
  let cookieHeader: string | undefined;

  const rawAccessor = response.headers as unknown as RawHeaderAccessor;
  const rawCookies =
    typeof rawAccessor.raw === "function" ? (rawAccessor.raw()?.["set-cookie"] ?? []) : [];
  const fallbackCookie = response.headers.get("set-cookie");
  const cookies = rawCookies.length > 0 ? rawCookies : fallbackCookie ? [fallbackCookie] : [];
  if (cookies.length > 0) {
    cookieHeader = cookies
      .map((cookie) => cookie.split(";")[0])
      .filter((value): value is string => Boolean(value))
      .join("; ");
  }

  return { token, cookieHeader, html };
}

function buildSearchBody(params: MasPortalListingParams): string {
  const form = new URLSearchParams();
  form.set("q", "");
  form.set("searchUrl", LISTING_PATH);
  form.set("topics", params.topic);
  form.set("contentType", params.contentType);
  if (params.page) {
    form.set("page", String(params.page));
  }
  if (params.updatedAfter) {
    form.set("updatedAfter", params.updatedAfter);
  }
  return form.toString();
}

function parseListingHtml(html: string, params: MasPortalListingParams): MasPortalListingCard[] {
  const $ = load(html);
  const cards: MasPortalListingCard[] = [];

  $(".listing__result").each((_, element) => {
    const anchor = $(element).find("a").first();
    const href = absoluteUrl(anchor.attr("href"));
    if (!href) {
      return;
    }

    const title = anchor.text().trim();
    const summary = $(element).find(".listing__item__summary").text().trim();
    const published = $(element).find("time").attr("datetime");

    const card: MasPortalListingCard = {
      url: href,
      title: title || undefined,
      summary: summary || undefined,
      publishedAt: published || undefined,
      topic: params.topic,
      contentType: params.contentType,
      sourceHash: hashSource(`${href}|${published ?? ""}`),
      metadata: {
        page: params.page ?? 1,
        listing_topic: params.topic,
        listing_content_type: params.contentType,
      },
    };

    cards.push(card);
  });

  return cards;
}

function parseListingJson(
  payload: unknown,
  params: MasPortalListingParams,
): MasPortalListingCard[] {
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown> & {
    results?: unknown;
    items?: unknown;
    data?: Record<string, unknown> | null;
  };
  const dataSection = record.data && typeof record.data === "object" ? record.data : undefined;
  const itemsCandidate =
    (record["results"] as unknown) ??
    (record["items"] as unknown) ??
    (dataSection ? (dataSection["results"] as unknown) : undefined) ??
    (dataSection ? (dataSection["items"] as unknown) : undefined) ??
    [];
  const items = Array.isArray(itemsCandidate) ? itemsCandidate : [];

  return items
    .map((entry): MasPortalListingCard | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const href = absoluteUrl(
        (item["url"] ?? item["link"] ?? item["permalink"]) as string | undefined,
      );
      if (!href) return null;

      const title = (item["title"] ?? item["name"] ?? item["heading"]) as string | undefined;
      const summary = (item["summary"] ?? item["description"] ?? item["snippet"]) as
        | string
        | undefined;
      const published = (item["published_at"] ?? item["publishDate"] ?? item["date"]) as
        | string
        | undefined;

      const card: MasPortalListingCard = {
        url: href,
        title: title || undefined,
        summary: summary || undefined,
        publishedAt: published || undefined,
        topic: params.topic,
        contentType: params.contentType,
        sourceHash: hashSource(`${href}|${published ?? ""}`),
        metadata: {
          page: params.page ?? 1,
          listing_topic: params.topic,
          listing_content_type: params.contentType,
          // Ensure raw is JSON-serializable by round-tripping unknown values
          raw: JSON.parse(JSON.stringify(item)),
        },
      };

      return card;
    })
    .filter((card): card is MasPortalListingCard => card !== null);
}

export async function fetchMasPortalListing(
  params: MasPortalListingParams,
): Promise<MasPortalListingResult> {
  try {
    const bootstrap = await bootstrapListingSession(params);
    if (!bootstrap.token || !bootstrap.cookieHeader) {
      return { cards: [], raw: bootstrap.html };
    }

    const response = await fetch(SEARCH_COMPONENT_ENDPOINT, {
      method: "POST",
      headers: {
        ...MAS_PORTAL_SEARCH_HEADERS,
        Cookie: bootstrap.cookieHeader,
        Referer: buildListingUrl(params),
        __RequestVerificationToken: bootstrap.token,
      },
      body: buildSearchBody(params),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`SearchFromComponent responded with ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = JSON.parse(raw);
      return { cards: parseListingJson(payload, params), raw };
    }

    return { cards: parseListingHtml(raw, params), raw };
  } catch (error: unknown) {
    const normalized = error instanceof Error ? error : new Error(String(error ?? ""));
    return { cards: [], error: normalized };
  }
}

export async function fetchMasPortalDetail(url: string): Promise<MasPortalDetail | null> {
  try {
    const response = await fetch(url, { headers: MAS_PORTAL_HTML_HEADERS });
    if (!response.ok) {
      return null;
    }
    const html = await response.text();
    const $ = load(html);

    const title =
      $("[data-analytics-title]").attr("data-analytics-title") ||
      $("meta[property='og:title']").attr("content") ||
      $("h1").first().text().trim() ||
      $("title").text().trim();

    const publishedAt =
      $("meta[property='article:published_time']").attr("content") ||
      $("meta[name='DC.Date']").attr("content") ||
      $("time").first().attr("datetime") ||
      undefined;

    const pdfLinks = new Set<string>();
    $("a[href$='.pdf'], a[data-file-extension='pdf']").each((_, el) => {
      const href = absoluteUrl($(el).attr("href"));
      if (href) pdfLinks.add(href);
    });

    $("a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && /\.pdf(\?|$)/i.test(href)) {
        const absolute = absoluteUrl(href);
        if (absolute) pdfLinks.add(absolute);
      }
    });

    return {
      url,
      title: title || undefined,
      publishedAt,
      pdfLinks: Array.from(pdfLinks),
      html,
    };
  } catch {
    return null;
  }
}

export function resolveMasPdfLinks(detail: MasPortalDetail | null | undefined): string[] {
  if (!detail) return [];
  const unique = new Set<string>();
  for (const link of detail.pdfLinks ?? []) {
    unique.add(link);
  }
  return Array.from(unique);
}
