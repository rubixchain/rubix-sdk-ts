import { beforeAll, describe, expect, test } from "vitest";
import type { NFTRecord } from "../../src/models/querier.js";
import { Querier } from "../../src/querier.js";
import { client, FUNDED_DID, hasFundedAccount } from "./helpers.js";

describe("Querier", () => {
  const rubixQuerier = new Querier(client);
  let nfts: NFTRecord[];

  beforeAll(async () => {
    nfts = await rubixQuerier.getAllNft();
  });

  test("lists all NFTs", () => {
    expect(Array.isArray(nfts)).toBe(true);
    expect(nfts.length).toBeGreaterThan(0);
    expect(nfts[0]).toMatchObject({
      TokenID: expect.any(String),
      TokenValue: expect.any(Number),
      DID: expect.any(String),
      TransactionID: expect.any(String),
    });
  });

  test.skipIf(!hasFundedAccount || FUNDED_DID === "")("gets the RBT balance of a DID", async () => {
    const balance = await rubixQuerier.getRbtBalance(FUNDED_DID);
    expect(balance).toEqual({ balance: expect.any(Number), pledged: expect.any(Number), locked: expect.any(Number) });
  });

  test("gets the FT balances of a DID", async () => {
    const balances = await rubixQuerier.getFtBalances("bafybmicbopex4ydytrtremmculwpo7e5p2uvbkuw2ds775xmkcsc5lglai");
    expect(Array.isArray(balances)).toBe(true);
  });

  test("gets the NFTs owned by a DID", async () => {
    const owned = await rubixQuerier.getNftsByOwner(nfts[0]!.DID);
    expect(owned).toContainEqual({ nft_id: nfts[0]!.TokenID, value: expect.any(Number) });
  });

  test("gets the NFT token chain", async () => {
    const states = await rubixQuerier.getNftStates(nfts[0]!.TokenID, { onlyLatestState: false });
    expect(states.length).toBeGreaterThan(0);
    expect(states[0]).toEqual({
      transactionId: expect.any(String),
      initiator: expect.any(String),
      epoch: expect.any(Number),
      data: expect.any(String),
    });
  });

  test("gets the parent and children of an NFT", async () => {
    const child = nfts.find((nft) => nft.ParentTokenID);
    if (!child) {
      return;
    }
    const parentAddress = child.ParentTokenID!;

    const parent = await rubixQuerier.getParentNft(child.TokenID);
    expect(parent).toEqual({ nft_id: parentAddress, value: expect.any(Number) });

    const children = await rubixQuerier.getChildNfts(parentAddress);
    expect(children).toContainEqual({ nft_id: child.TokenID, value: expect.any(Number) });

    // An NFT without a parent
    expect(await rubixQuerier.getParentNft(parentAddress)).toBe("");
  });

  test("rejects invalid addresses and DIDs before calling the node", async () => {
    await expect(rubixQuerier.getRbtBalance("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG")).rejects.toThrow(
      "Invalid DID: QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    );
    await expect(rubixQuerier.getNftStates("bafybmicbopex4ydytrtremmculwpo7e5p2uvbkuw2ds775xmkcsc5lglai")).rejects.toThrow(
      "Invalid NFT address",
    );
  });

  test("raises when the node reports a failure", async () => {
    await expect(rubixQuerier.getNftStates("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG")).rejects.toThrow(
      "Failed to get NFT states: Failed to retrieve nft chain data",
    );
  });
});
