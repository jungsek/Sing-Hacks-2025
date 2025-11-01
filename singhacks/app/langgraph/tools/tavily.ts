type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_BASE_URL = "https://api.tavily.com";

export type TavilySearchParams = {
  query: string;
  include_domains?: string[];
  start_date?: string;
  end_date?: string;
  topic?: "general" | "news" | string;
  search_depth?: "basic" | "advanced";
  max_results?: number;
  include_answer?: boolean;
  include_images?: boolean;
  exclude_domains?: string[];
  filter_duplicates?: boolean;
};

export type TavilySearchResult = {
  query: string;
  results: Array<{
    title?: string;
    url: string;
    content?: string;
    snippet?: string;
    published_date?: string;
    score?: number;
  }>;
  answer?: string;
};

export type TavilyExtractParams = {
  urls: string[];
};

export type TavilyExtractResult = {
  results: Array<{
    url: string;
    content: string;
    title?: string;
    language?: string;
    media_type?: string;
  }>;
};

class TavilyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TavilyConfigError";
  }
}

function getFetcher(): Fetcher {
  if (typeof fetch !== "undefined") {
    return fetch.bind(globalThis);
  }
  throw new Error("Global fetch is not available in this runtime environment");
}

function getBaseUrl(): string {
  const base = process.env.TAVILY_API_URL?.trim();
  if (!base) return DEFAULT_BASE_URL;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function getApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key || key.length === 0) {
    throw new TavilyConfigError("TAVILY_API_KEY is not configured");
  }
  return key;
}

async function tavilyRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const fetcher = getFetcher();
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const response = await fetcher(`${baseUrl}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

export async function tavilySearch(params: TavilySearchParams): Promise<TavilySearchResult> {
  const body = {
    query: params.query,
    include_domains: params.include_domains,
    exclude_domains: params.exclude_domains,
    start_date: params.start_date,
    end_date: params.end_date,
    topic: params.topic ?? "news",
    search_depth: params.search_depth ?? "advanced",
    max_results: params.max_results ?? 8,
    include_answer: params.include_answer ?? false,
    include_images: params.include_images ?? false,
    filter_duplicates: params.filter_duplicates ?? undefined,
  };

  return await tavilyRequest<TavilySearchResult>("search", body);
}

export async function tavilyExtract(params: TavilyExtractParams): Promise<TavilyExtractResult> {
  if (!Array.isArray(params.urls) || params.urls.length === 0) {
    return { results: [] };
  }

  const body = {
    urls: params.urls,
  };

  return await tavilyRequest<TavilyExtractResult>("extract", body);
}

export { TavilyConfigError };

