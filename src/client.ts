/** Query parameters appended to the request URL. `null`/`undefined` values are skipped. */
export type QueryParams = Record<string, string | number | boolean | null | undefined>;

/** A file part of a multipart/form-data request. */
export interface FormDataFile {
  filename: string;
  data: Uint8Array;
  contentType?: string;
}

export interface RubixClientOptions {
  /** Base URL of the Rubix node. Defaults to `http://localhost:20000`. */
  nodeUrl?: string;
  /** Request timeout in milliseconds. Defaults to 300000 (5 minutes). */
  timeout?: number;
}

/** Raised when a request to the Rubix node fails (timeout, connection failure, HTTP error). */
export class RubixRequestError extends Error {
  override name = "RubixRequestError";
}

/** Raised when the Rubix node responds with a 4xx or 5xx HTTP status. */
export class RubixHTTPError extends RubixRequestError {
  override name = "RubixHTTPError";

  constructor(
    message: string,
    /** HTTP status code of the response. */
    readonly status: number,
    /** Raw body of the response. */
    readonly body: string,
  ) {
    super(message);
  }
}

/**
 * Builds the request URL the way Python's `urljoin` does, and appends the query parameters.
 */
export function buildUrl(baseUrl: string, endpoint: string, params?: QueryParams | null): URL {
  const url = new URL(endpoint, baseUrl);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null) {
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

/** Throws a {@link RubixHTTPError} if the response has a 4xx or 5xx HTTP status. */
export async function raiseForStatus(response: Response, url: string): Promise<void> {
  if (response.status >= 400 && response.status < 600) {
    const kind = response.status < 500 ? "Client" : "Server";
    const body = await response.text().catch(() => "");
    throw new RubixHTTPError(
      `${response.status} ${kind} Error: ${response.statusText} for url: ${url}`,
      response.status,
      body,
    );
  }
}

/** Returns true if the error was raised because the request's timeout signal fired. */
export function isTimeoutError(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

export class RubixClient {
  /** Base URL of the Rubix node, without a trailing slash. */
  readonly nodeUrl: string;
  readonly #timeout: number;

  /**
   * Initialize Rubix client.
   */
  constructor(options: RubixClientOptions = {}) {
    const { nodeUrl = "http://localhost:20000", timeout = 300_000 } = options;

    this.nodeUrl = nodeUrl.replace(/\/+$/, ""); // Remove trailing slash
    this.#timeout = timeout;
  }

  async #request(
    label: string,
    endpoint: string,
    params: QueryParams | null | undefined,
    init: RequestInit,
  ): Promise<any> {
    // Build full URL
    const url = buildUrl(this.nodeUrl, endpoint, params).toString();

    let text: string;
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(this.#timeout) });

      // Raise for HTTP errors (4xx, 5xx)
      await raiseForStatus(response, url);

      text = await response.text();
    } catch (e) {
      if (e instanceof RubixRequestError) {
        throw e;
      }
      if (isTimeoutError(e)) {
        throw new RubixRequestError(`${label} request to ${url} timed out after ${this.#timeout}ms`, { cause: e });
      }
      throw new RubixRequestError(`Failed to connect to Rubix node at ${url}`, { cause: e });
    }

    // Parse and return JSON
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response from ${url}: ${(e as Error).message}`, { cause: e });
    }
  }

  /**
   * Make GET request to Rubix node.
   *
   * @internal Used by {@link Signer} and {@link Querier}.
   * @param endpoint - API endpoint path
   * @param params - Optional query parameters
   * @returns Parsed JSON response
   * @throws {RubixRequestError} If request fails
   * @throws {Error} If response is not valid JSON
   */
  async makeGetRequest(endpoint: string, params?: QueryParams | null): Promise<any> {
    return this.#request("GET", endpoint, params, { method: "GET" });
  }

  /**
   * Make POST request to Rubix node.
   *
   * @internal Used by {@link Signer} and {@link Querier}.
   * @param endpoint - API endpoint path (e.g., "/api/request-did-for-pubkey")
   * @param jsonData - Optional JSON body data
   * @param params - Optional query parameters
   * @returns Parsed JSON response
   * @throws {RubixRequestError} If request fails
   * @throws {Error} If response is not valid JSON
   */
  async makePostRequest(endpoint: string, jsonData?: unknown, params?: QueryParams | null): Promise<any> {
    const init: RequestInit = { method: "POST" };
    if (jsonData != null) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(jsonData);
    }
    return this.#request("POST", endpoint, params, init);
  }

  /**
   * Make multipart/form-data POST request to Rubix node.
   *
   * @internal Used by {@link Signer}.
   * @param endpoint - API endpoint path (e.g., "/api/upload")
   * @param files - Files to upload, keyed by form field name
   * @param data - Form fields (non-file data)
   * @param params - Optional query parameters
   * @returns Parsed JSON response
   * @throws {RubixRequestError} If request fails
   * @throws {Error} If response is not valid JSON
   */
  async makeFormDataRequest(
    endpoint: string,
    files?: Record<string, FormDataFile> | null,
    data?: Record<string, string> | null,
    params?: QueryParams | null,
  ): Promise<any> {
    const form = new FormData();
    for (const [field, value] of Object.entries(data ?? {})) {
      form.append(field, value);
    }
    for (const [field, file] of Object.entries(files ?? {})) {
      const blob = new Blob([file.data as Uint8Array<ArrayBuffer>], file.contentType ? { type: file.contentType } : {});
      form.append(field, blob, file.filename);
    }

    return this.#request("Form-data POST", endpoint, params, {
      method: "POST",
      body: form,
    });
  }
}
