import { beforeAll, describe, expect, test } from "vitest";
import { Querier } from "../../src/querier.js";
import type { Signer } from "../../src/signer.js";
import { client, fundedSigner, hasFundedAccount, makeNftFiles, receiverDid as getReceiverDid } from "./helpers.js";

// Based on examples/nftOperations.ts. The tests depend on each other and run in order.
describe.skipIf(!hasFundedAccount)("NFT operations", () => {
  const rubixQuerier = new Querier(client);
  let signer: Signer;
  let nftAddress: string;
  let childNftAddress: string;
  let receiverDid: string;

  beforeAll(async () => {
    signer = await fundedSigner();
  });

  test("deploys an NFT", async () => {
    const { artifactFile, metadataFile } = await makeNftFiles();

    const response = await signer.deployNft({
      artifactFile,
      metadataFile,
      nftValue: 0.001,
      nftData: "init data",
    });

    expect(response.error, `NFT Deployment Failed!: ${response.error}`).toBeUndefined();
    nftAddress = response.nftAddress!;
    expect(nftAddress).toMatch(/^Qm/);

    expect(await rubixQuerier.getNftsByOwner(signer.did)).toContainEqual({ nft_id: nftAddress, value: 0.001 });
  });

  test("executes the NFT", async () => {
    const response = await signer.executeNft({
      nftAddress,
      nftData: "test execution data",
      nftValue: 0.001,
    });

    expect(response.status, `NFT Execution Failed!: ${response.message}`).toBe(true);

    const states = await rubixQuerier.getNftStates(nftAddress, { onlyLatestState: false });
    expect(states.length).toBeGreaterThan(1);
    expect(states.map((state) => state.data)).toContain("test execution data");

    const latest = await rubixQuerier.getNftStates(nftAddress, { onlyLatestState: true });
    expect(latest).toEqual([states.at(-1)]);
    expect(latest[0]!.data).toBe("test execution data");
  });

  test("creates a child NFT", async () => {
    const response = await signer.createChildNft({
      parentNftAddress: nftAddress,
      nftData: "child data",
      nftValue: 0.001,
      comment: "Test child NFT",
    });

    expect(response.error, `Child NFT Creation Failed!: ${response.error}`).toBeUndefined();
    expect(response.txId).toEqual(expect.any(String));
    expect(response.childNfts!.length).toBeGreaterThan(0);
    expect(response.childNfts![0]!.parentNFTId).toBe(nftAddress);
    childNftAddress = response.childNfts![0]!.childNFTId;

    expect(await rubixQuerier.getChildNfts(nftAddress)).toContainEqual({ nft_id: childNftAddress, value: expect.any(Number) });
    expect(await rubixQuerier.getParentNft(childNftAddress)).toEqual({ nft_id: nftAddress, value: expect.any(Number) });
  });

  test("transfers the NFT to another DID", async () => {
    receiverDid = await getReceiverDid();

    const response = await signer.transferNft({
      nftAddress,
      receiverDid,
      nftValue: 0.001,
      comment: "Test NFT Transfer",
    });

    expect(response.status, `NFT Transfer Failed!: ${response.message}`).toBe(true);
    expect(response.result).toMatchObject({ transactionID: expect.any(String) });
  });

  // Known issue, inherited from the Python SDK: transferNft does not set `transferNftOwnership`,
  // so the node records the transaction but the sender keeps ownership of the NFT.
  // When this starts passing, remove `.fails`.
  test.fails("moves NFT ownership to the receiver", async () => {
    expect(await rubixQuerier.getNftsByOwner(receiverDid)).toContainEqual({ nft_id: nftAddress, value: expect.any(Number) });
  });
});
