import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hexToBytes } from "@noble/curves/utils.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RubixClient } from "../src/client.js";
import { secp256k1Verify } from "../src/crypto/secp256k1.js";
import { DIDCreationError } from "../src/did.js";
import { Signer } from "../src/signer.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "python");
const vectors = JSON.parse(readFileSync(join(fixturesDir, "vectors.json"), "utf-8"));
const tx = vectors.tx;

// The DID that the mocked node assigns to every public key
const DID = tx.signer;

interface Call {
  method: string;
  path: string;
  body: any;
}

/**
 * A fake Rubix node. Every transaction requires `signatureRounds` signatures before completing,
 * and each signature is verified against the public key the DID was created for.
 */
function fakeNode(options: { signatureRounds?: number; txResult?: Record<string, any>; txStatus?: boolean } = {}) {
  const { signatureRounds = 1, txResult = { transactionID: "tx-1" }, txStatus = true } = options;
  const calls: Call[] = [];
  let publicKey: Uint8Array | undefined;
  const pending = new Map<string, { hash: Uint8Array; remaining: number; isTx: boolean }>();
  let counter = 0;

  const challenge = (remaining: number, isTx: boolean) => {
    const id = `req-${++counter}`;
    const hash = new Uint8Array(32).fill(counter);
    pending.set(id, { hash, remaining, isTx });
    return { id, hash: Buffer.from(hash).toString("base64") };
  };

  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, path: url.pathname, body });

    if (url.pathname === "/rubix/v1/dids/create") {
      publicKey = hexToBytes(body.public_key);
      return json({ status: true, message: "", result: { did: DID } });
    }
    if (url.pathname === `/rubix/v1/dids/${DID}/register`) {
      return json({ status: true, message: "", result: challenge(1, false) });
    }
    if (url.pathname === "/rubix/v1/tx" || url.pathname === "/rubix/v1/fts/mint") {
      return json({ status: true, message: "", result: challenge(signatureRounds, true) });
    }
    if (url.pathname === "/rubix/v1/smart_contracts/generate" || url.pathname === "/rubix/v1/nfts/generate") {
      return json({ status: true, message: "", result: tx.asset });
    }
    if (url.pathname === "/rubix/v1/signature") {
      const request = pending.get(body.id)!;
      pending.delete(body.id);
      const valid = secp256k1Verify(publicKey!, request.hash, new Uint8Array(Buffer.from(body.signature, "base64")));
      if (!valid) {
        return json({ status: false, message: "invalid signature", result: null });
      }
      if (request.remaining > 1) {
        return json({ status: true, message: "sign again", result: challenge(request.remaining - 1, request.isTx) });
      }
      if (!request.isTx) {
        return json({ status: true, message: "DID registered", result: null });
      }
      return json({ status: txStatus, message: txStatus ? "Transaction successful" : "Transaction failed", result: txResult });
    }
    return new Response("not found", { status: 404, statusText: "Not Found" });
  });

  return { fetchMock, calls };
}

describe("Signer", () => {
  let configPath: string;
  const client = new RubixClient({ nodeUrl: "http://node:20000" });

  beforeEach(async () => {
    configPath = await mkdtemp(join(tmpdir(), "rubix-sdk-ts-signer-"));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(configPath, { recursive: true, force: true });
  });

  async function newSigner(node = fakeNode()) {
    vi.stubGlobal("fetch", node.fetchMock);
    const signer = await Signer.create({ rubixClient: client, alias: "nero", mnemonic: vectors.mnemonic, configPath });
    node.calls.length = 0;
    return { signer, calls: node.calls };
  }

  test("creates, registers and saves a new account, then loads it from disk", async () => {
    const node = fakeNode();
    vi.stubGlobal("fetch", node.fetchMock);

    const signer = await Signer.create({ rubixClient: client, alias: "nero", mnemonic: vectors.mnemonic, configPath });
    expect(signer.did).toBe(DID);
    expect(signer.quorumType).toBe(2);
    expect(signer.accountDir).toBe(join(configPath, "account"));
    expect(signer.getMnemonic()).toBe(vectors.mnemonic);
    expect(signer.getKeypair().publicKey).toBe(vectors.seedKeypair.publicKey);
    expect(node.calls.map((c) => c.path)).toEqual([
      "/rubix/v1/dids/create",
      `/rubix/v1/dids/${DID}/register`,
      "/rubix/v1/signature",
    ]);
    expect(node.calls[0]!.body).toEqual({ public_key: vectors.seedKeypair.publicKey });

    // The second time, the account is loaded from disk without contacting the node, and the mnemonic is ignored
    node.calls.length = 0;
    const loaded = await Signer.create({ rubixClient: client, alias: "nero", mnemonic: "ignored", configPath });
    expect(node.calls).toHaveLength(0);
    expect(loaded.did).toBe(DID);
    expect(loaded.getMnemonic()).toBe("");
    expect(loaded.getKeypair().privateKey).toBe(vectors.seedKeypair.privateKey);
  });

  test("generates a mnemonic when none is passed", async () => {
    vi.stubGlobal("fetch", fakeNode().fetchMock);
    const signer = await Signer.create({ rubixClient: client, alias: "random", configPath });
    expect(signer.getMnemonic().split(" ")).toHaveLength(24);
  });

  test("validates its options", async () => {
    await expect(Signer.create({ rubixClient: client, alias: "", configPath })).rejects.toThrow(
      "alias must be provided to initiate Signer",
    );
    await expect(Signer.create({ rubixClient: null as any, alias: "a", configPath })).rejects.toThrow(
      "RubixClient instance is required",
    );
  });

  test("raises DIDCreationError when the node rejects the DID creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: false, message: "bad key", result: null }))),
    );
    await expect(Signer.create({ rubixClient: client, alias: "nero", configPath })).rejects.toThrow(
      new DIDCreationError("DID creation failed: bad key"),
    );
  });

  test("keeps signing until the node returns a transaction ID", async () => {
    const { signer, calls } = await newSigner(fakeNode({ signatureRounds: 3 }));

    const response = await signer.sendRbtTokens({ receiverDid: tx.receiver, rbtAmount: 0.001, memo: "Test RBT Transfer" });

    expect(response).toEqual({ status: true, message: "Transaction successful", result: { transactionID: "tx-1" } });
    expect(calls.map((c) => c.path)).toEqual([
      "/rubix/v1/tx",
      "/rubix/v1/signature",
      "/rubix/v1/signature",
      "/rubix/v1/signature",
    ]);
    expect(calls[0]!.body).toEqual(tx.sendRbtTokens);
  });

  test("builds the same transaction requests as the Python SDK", async () => {
    const { signer, calls } = await newSigner();
    const txBody = () => calls.find((c) => c.path === "/rubix/v1/tx")!.body;

    await signer.sendFt({ receiverDid: tx.receiver, ftName: "ABC", ftCount: 5, ftCreatorDid: DID, comment: "Test FT Transfer" });
    expect(txBody()).toEqual(tx.sendFt);

    calls.length = 0;
    await signer.executeSmartContract({ contractAddress: tx.asset, smartContractData: "test1" });
    expect(txBody()).toEqual(tx.executeSmartContract);

    calls.length = 0;
    await signer.executeNft({ nftAddress: tx.asset, nftData: "test execution data" });
    expect(txBody()).toEqual(tx.executeNft);

    calls.length = 0;
    await signer.transferNft({ nftAddress: tx.asset, receiverDid: tx.receiver, nftValue: 0.001, comment: "gift" });
    expect(txBody()).toEqual(tx.transferNft);

    calls.length = 0;
    await signer.deployNft({ nftId: tx.asset, nftValue: 0.001, nftData: "init data" });
    expect(txBody()).toEqual(tx.deployNft);
  });

  test("creates FTs through the mint endpoint", async () => {
    const { signer, calls } = await newSigner();

    const response = await signer.createFt({ name: "ABC", supply: 10, rbtLockAmount: 1 });

    expect(response.status).toBe(true);
    expect(calls[0]).toMatchObject({
      path: "/rubix/v1/fts/mint",
      body: { did: DID, ft_count: 10, ft_name: "ABC", ft_num_start_index: 0, token_count: 1 },
    });
  });

  test("deploys a smart contract after uploading its files", async () => {
    const { signer, calls } = await newSigner();
    const wasmFile = join(configPath, "contract.wasm");
    const codeFile = join(configPath, "contract.rs");
    await writeFile(wasmFile, new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    await writeFile(codeFile, "fn main() {}\n");

    const result = await signer.deploySmartContract({
      wasmFile,
      codeFile,
      contractValue: 0.001,
      smartContractData: "init",
      comment: "deploy",
    });

    expect(result).toEqual({ contractAddress: tx.asset });
    const form = calls[0]!.body as FormData;
    expect(calls[0]!.path).toBe("/rubix/v1/smart_contracts/generate");
    expect(form.get("did")).toBe(DID);
    expect((form.get("binaryCodePath") as File).name).toBe("contract.wasm");
    expect((form.get("rawCodePath") as File).name).toBe("contract.rs");
    expect(calls[1]!.body).toEqual(tx.deploySmartContract);

    await expect(
      signer.deploySmartContract({ wasmFile: "missing.wasm", codeFile, contractValue: 1, smartContractData: "" }),
    ).rejects.toThrow("WASM file not found: missing.wasm");
  });

  test("returns the error message when a deployment transaction fails", async () => {
    const { signer } = await newSigner(fakeNode({ txStatus: false }));
    expect(await signer.deployNft({ nftId: tx.asset, nftValue: 0.001, nftData: "" })).toEqual({ error: "Transaction failed" });
  });

  test("validates the deployNft arguments", async () => {
    const { signer } = await newSigner();
    await expect(
      signer.deployNft({ nftData: "", nftValue: 1, nftId: tx.asset, artifactFile: "a", metadataFile: "m" }),
    ).rejects.toThrow("values for `nftId`, `artifactFile` and `metadataFile` have been passed.");
    await expect(signer.deployNft({ nftData: "", nftValue: 1 })).rejects.toThrow(
      "`nftId`, `artifactFile` and `metadataFile` are empty.",
    );
    await expect(signer.deployNft({ nftData: "", nftValue: 1, nftId: "not-a-cid" })).rejects.toThrow(
      "nftId passed is not in a valid format, value: not-a-cid",
    );
  });

  test("returns the minted child NFTs and transaction ID", async () => {
    const { signer, calls } = await newSigner(
      fakeNode({ txResult: { transactionID: "tx-9", mintedNFTChildren: [{ parentNFTId: tx.parent, childNFTId: "QmChild" }] } }),
    );

    const result = await signer.createChildNft({ parentNftAddress: tx.parent });

    expect(result).toEqual({ childNfts: [{ parentNFTId: tx.parent, childNFTId: "QmChild" }], txId: "tx-9" });
    expect(calls[0]!.body).toEqual(tx.createChildNft);
  });
});
