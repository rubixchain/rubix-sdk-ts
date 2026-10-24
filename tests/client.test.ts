import { afterEach, describe, expect, test, vi } from "vitest";
import { RubixClient, RubixHTTPError, RubixRequestError } from "../src/client.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RubixClient", () => {
  test("is created with a valid URL, and defaults to http://localhost:20000", () => {
    const validNodeUrl = "http://128.0.0.1:2345";

    const client = new RubixClient({ nodeUrl: validNodeUrl });

    expect(client).not.toBeNull();

    const clientDefaultUrl = new RubixClient();

    expect(clientDefaultUrl).not.toBeNull();
    expect(clientDefaultUrl.nodeUrl, "Default node URL should be http://localhost:20000").toBe("http://localhost:20000");
  });

  test("removes trailing slashes from the node URL", () => {
    expect(new RubixClient({ nodeUrl: "http://localhost:20000/" }).nodeUrl).toBe("http://localhost:20000");
  });

  test("sends query parameters, JSON bodies and multipart form data", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: true, message: "", result: null }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RubixClient({ nodeUrl: "http://node:20000" });
    await client.makeGetRequest("/rubix/v1/nfts", { a: "1", b: undefined });
    await client.makePostRequest("/rubix/v1/tx", { x: 1 });
    await client.makeFormDataRequest("/rubix/v1/nfts/generate", { f: { filename: "f.txt", data: new Uint8Array([1]) } }, { did: "d" });

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![0]).toBe("http://node:20000/rubix/v1/nfts?a=1");
    expect(calls[0]![1].headers).toBeUndefined();

    expect(calls[1]![0]).toBe("http://node:20000/rubix/v1/tx");
    expect(calls[1]![1].headers).toEqual({ "Content-Type": "application/json" });
    expect(calls[1]![1].body).toBe('{"x":1}');

    expect(calls[2]![1].headers).toBeUndefined();
    const form = calls[2]![1].body as FormData;
    expect(form.get("did")).toBe("d");
    expect((form.get("f") as File).name).toBe("f.txt");
  });

  test("raises RubixHTTPError on 4xx/5xx responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ status: false }, { status: 404, statusText: "Not Found" })));

    const error = await new RubixClient({ nodeUrl: "http://node:20000" }).makeGetRequest("/x").catch((e) => e);
    expect(error).toBeInstanceOf(RubixHTTPError);
    expect(error).toBeInstanceOf(RubixRequestError);
    expect(error.message).toBe("404 Client Error: Not Found for url: http://node:20000/x");
    expect(error.status).toBe(404);
  });

  test("raises RubixRequestError on connection failures and timeouts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(new RubixClient({ nodeUrl: "http://node:20000" }).makePostRequest("/x")).rejects.toThrow(
      new RubixRequestError("Failed to connect to Rubix node at http://node:20000/x"),
    );

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("timed out", "TimeoutError"))));
    await expect(new RubixClient({ nodeUrl: "http://node:20000", timeout: 5 }).makeGetRequest("/x")).rejects.toThrow(
      new RubixRequestError("GET request to http://node:20000/x timed out after 5ms"),
    );
  });

  test("raises on invalid JSON responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json")));
    await expect(new RubixClient({ nodeUrl: "http://node:20000" }).makeGetRequest("/x")).rejects.toThrow(
      /^Invalid JSON response from http:\/\/node:20000\/x: /,
    );
  });
});
