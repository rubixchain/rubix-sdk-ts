import { afterEach, describe, expect, test, vi } from "vitest";
import { RubixClient } from "../src/client.js";
import { Querier } from "../src/querier.js";

const NFT = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

// Token chains are returned by the node ordered oldest first
const chain = [
  { transactionId: "tx-1", initiator: "did", epoch: 1, data: "init" },
  { transactionId: "tx-2", initiator: "did", epoch: 2, data: "" },
  { transactionId: "tx-3", initiator: "did", epoch: 3, data: "latest" },
];

function stubNode(result: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: true, message: "", result })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Querier", () => {
  const rubixQuerier = new Querier(new RubixClient({ nodeUrl: "http://node:20000" }));

  test.each([
    ["getNftStates", `/rubix/v1/nfts/${NFT}/chain`],
    ["getSmartContractStates", `/rubix/v1/smart_contracts/${NFT}/chain`],
  ] as const)("%s returns every state by default, or only the latest one", async (method, path) => {
    const fetchMock = stubNode(chain);

    expect(await rubixQuerier[method](NFT)).toEqual(chain);
    expect(await rubixQuerier[method](NFT, { onlyLatestState: false })).toEqual(chain);
    expect(await rubixQuerier[method](NFT, { onlyLatestState: true })).toEqual([chain[2]]);

    const calls = fetchMock.mock.calls as unknown as [string][];
    expect(calls[0]![0]).toBe(`http://node:20000${path}`);
  });

  test("returns an empty chain as-is when only the latest state is requested", async () => {
    stubNode([]);
    expect(await rubixQuerier.getNftStates(NFT, { onlyLatestState: true })).toEqual([]);
  });

  test("returns an empty string when an NFT has no parent", async () => {
    stubNode(null);
    expect(await rubixQuerier.getParentNft(NFT)).toBe("");
  });
});
