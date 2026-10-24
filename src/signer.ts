import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { hexToBytes } from "@noble/curves/utils.js";
import type { RubixClient } from "./client.js";
import { loadAccountFromFile, saveAccountToFile } from "./crypto/account.js";
import { generateBip39Mnemonic, getSeedFromMnemonic } from "./crypto/bip39.js";
import { Secp256k1Keypair } from "./crypto/secp256k1.js";
import { createDid } from "./did.js";
import type { RubixResponse } from "./models/result.js";
import { FTInfo, NFTInfo, SmartContractInfo, TransactionRequest, TransactionTokenDetails } from "./models/tx.js";
import { validateAssetAddress } from "./utils/validate.js";

export const CONFIG_ACCOUNTS_DIR = "account";

/** Response returned by the Rubix node for a transaction. */
export type TxResponse = RubixResponse<Record<string, any> | string | null>;

export interface SignerOptions {
  /** An instance of RubixClient for API interactions. */
  rubixClient: RubixClient;
  /** Alias for Rubix Account. */
  alias: string;
  /** 24-word mnemonic phrase for key generation or import. Defaults to "". */
  mnemonic?: string;
  /** SDK config path. Defaults to "" and internally is set to `<HOME_DIR>/.rubix_sdk`. */
  configPath?: string;
  /**
   * Passphrase for encrypting/decrypting the private key. Defaults to "mypassword".
   * It is HIGHLY RECOMMENDED to provide a passphrase.
   */
  passphrase?: string;
}

export type DeploySmartContractResult = { contractAddress: string; error?: undefined } | { error: string; contractAddress?: undefined };

export type DeployNftResult = { nftAddress: string; error?: undefined } | { error: string; nftAddress?: undefined };

/** A child NFT minted by {@link Signer.createChildNft}. */
export interface MintedNFTChild {
  parentNFTId: string;
  childNFTId: string;
}

export type CreateChildNftResult =
  | { childNfts: MintedNFTChild[]; txId: string; error?: undefined }
  | { error: string; childNfts?: undefined; txId?: undefined };

/** Returns true if the result is null, or contains a transaction ID (i.e. the transaction is complete). */
function hasTransactionId(result: unknown): boolean {
  if (typeof result === "string") {
    return result.includes("transactionID");
  }
  return typeof result === "object" && result !== null && "transactionID" in result;
}

/**
 * Signer provides abstraction for user keys management
 */
export class Signer {
  readonly #client: RubixClient;
  readonly #keypair: Secp256k1Keypair;
  readonly #mnemonic: string;

  /** DID of the account. */
  readonly did: string;
  readonly quorumType: number = 2;
  /** Directory holding the accounts: `<configPath>/account`. */
  readonly accountDir: string;

  private constructor(client: RubixClient, keypair: Secp256k1Keypair, mnemonic: string, did: string, accountDir: string) {
    this.#client = client;
    this.#keypair = keypair;
    this.#mnemonic = mnemonic;
    this.did = did;
    this.accountDir = accountDir;
  }

  /**
   * Initializes Signer instance.
   *
   * If no account exists for the alias, a keypair is derived from the mnemonic (or a newly
   * generated one), a DID is created for it on the Rubix node, and the keys are saved to the
   * config directory. Otherwise the keys are loaded from the config directory, and the mnemonic
   * is ignored.
   */
  static async create(options: SignerOptions): Promise<Signer> {
    const { rubixClient, alias, mnemonic = "", configPath = "", passphrase = "mypassword" } = options;

    // Set config path
    let resolvedConfigPath: string;
    if (configPath === "") {
      const homeDir = homedir();
      const defaultConfigPath = join(homeDir, ".rubix_sdk");
      resolvedConfigPath = defaultConfigPath;
    } else {
      resolvedConfigPath = configPath;
    }

    // Set Rubix Client
    if (rubixClient == null) {
      throw new Error("RubixClient instance is required");
    }

    // Check if alias has been provided for their account
    if (alias === "") {
      throw new Error("alias must be provided to initiate Signer");
    }

    const accountDir = join(resolvedConfigPath, CONFIG_ACCOUNTS_DIR);

    // If the alias directory doesn't exists, create it with keypair. The keypair
    // could either come from a mnemonic or be newly generated.
    const completeKeyPath = join(accountDir, alias);
    if (!existsSync(completeKeyPath)) {
      // Get the secp256k1 keypair from mnemonic
      let signerMnemonic: string;
      if (mnemonic === "") {
        const mnemonicStr = generateBip39Mnemonic();
        if (mnemonicStr == null || mnemonicStr.trim() === "") {
          throw new Error("Failed to generate mnemonic phrase.");
        }
        signerMnemonic = mnemonicStr;
      } else {
        signerMnemonic = mnemonic;
      }

      const seed = getSeedFromMnemonic(signerMnemonic);
      const keypair = Secp256k1Keypair.fromMnemonicSeed(seed);

      // Request DID creation from Rubix node
      const createdDid = await createDid(keypair, rubixClient.nodeUrl);
      if (createdDid == null || createdDid.trim() === "") {
        throw new Error("Failed to create DID from mnemonic seed.");
      }

      // Save keys to config file
      await saveAccountToFile(
        accountDir,
        hexToBytes(keypair.publicKey),
        hexToBytes(keypair.privateKey),
        createdDid,
        alias,
        passphrase,
      );

      return new Signer(rubixClient, keypair, signerMnemonic, createdDid, accountDir);
    } else {
      // Load keys from config file
      const rubixAccount = await loadAccountFromFile(accountDir, alias, passphrase);
      return new Signer(rubixClient, rubixAccount.keypair, "", rubixAccount.did, accountDir);
    }
  }

  /**
   * Sends signature response to Rubix node
   *
   * @param id - Transaction request ID.
   * @param messageHash - The message hash.
   * @returns Response from the Rubix node.
   */
  async #signatureResponse(id: string, messageHash: Uint8Array): Promise<TxResponse> {
    const signatureBytes = this.#keypair.sign(messageHash);

    const signatureResponseBody = {
      id,
      signature: Buffer.from(signatureBytes).toString("base64"),
    };

    const response = await this.#client.makePostRequest("/rubix/v1/signature", signatureResponseBody);

    if (response.result == null || hasTransactionId(response.result) || response.status === false) {
      return response;
    } else {
      const newMessageHash = new Uint8Array(Buffer.from(response.result.hash, "base64"));
      const newRequestId = response.result.id;
      return this.#signatureResponse(newRequestId, newMessageHash);
    }
  }

  /**
   * Generates smart contract address by uploading necessary files to Rubix node.
   *
   * @param userDid - The DID of the user deploying the smart contract.
   * @param wasmFile - Path to the WASM file.
   * @param codeFile - Path to the code file.
   * @returns Smart contract address
   * @throws {Error} If any of the specified files do not exist, or if the Rubix node
   *   returns an error or empty result.
   */
  async #generateSmartContractAddress(userDid: string, wasmFile: string, codeFile: string): Promise<string> {
    if (!existsSync(wasmFile)) {
      throw new Error(`WASM file not found: ${wasmFile}`);
    }

    if (!existsSync(codeFile)) {
      throw new Error(`Code file not found: ${codeFile}`);
    }

    const files = {
      binaryCodePath: { filename: basename(wasmFile), data: await readFile(wasmFile) },
      rawCodePath: { filename: basename(codeFile), data: await readFile(codeFile) },
    };

    const data = {
      did: userDid,
    };

    const response = await this.#client.makeFormDataRequest("/rubix/v1/smart_contracts/generate", files, data);

    if (response.status === false) {
      throw new Error(`Smart contract hash generation failed: ${response.message}`);
    }

    if (response.result === "") {
      throw new Error(`Empty smart contract hash received from Rubix node. err: ${response.message}`);
    }

    return response.result;
  }

  /**
   * Generates NFT address
   *
   * @param userDid - The DID of the user deploying the NFT.
   * @param artifactFile - Path to the artifact file.
   * @param metadataFile - Path to the metadata file.
   * @returns NFT address
   * @throws {Error} If any of the specified files do not exist, or if the Rubix node
   *   returns an error or empty result.
   */
  async #generateNftAddress(userDid: string, artifactFile: string, metadataFile: string): Promise<string> {
    if (!existsSync(artifactFile)) {
      throw new Error(`Artifact file not found: ${artifactFile}`);
    }

    if (!existsSync(metadataFile)) {
      throw new Error(`Metadata file not found: ${metadataFile}`);
    }

    const files = {
      artifact: { filename: basename(artifactFile), data: await readFile(artifactFile) },
      metadata: { filename: basename(metadataFile), data: await readFile(metadataFile) },
    };

    const data = {
      did: userDid,
    };

    const response = await this.#client.makeFormDataRequest("/rubix/v1/nfts/generate", files, data);

    if (response.status === false) {
      throw new Error(`NFT address generation failed: ${response.message}`);
    }

    if (response.result === "") {
      throw new Error(`Empty NFT address received from Rubix node. err: ${response.message}`);
    }

    return response.result;
  }

  /** Returns the mnemonic phrase associated with the signer. Empty if the account was loaded from the config directory. */
  getMnemonic(): string {
    return this.#mnemonic;
  }

  /** Returns the Secp256k1 keypair associated with the signer. */
  getKeypair(): Secp256k1Keypair {
    return this.#keypair;
  }

  /**
   * Initiates a transaction
   *
   * @param request - The transaction request.
   * @returns Transaction response from the Rubix node.
   */
  async initTx(request: TransactionRequest): Promise<TxResponse> {
    const txResponse = await this.#client.makePostRequest("/rubix/v1/tx", request.toJSON());

    if (txResponse.status === false) {
      return txResponse;
    }

    const requestId = txResponse.result.id;
    const requestHash = new Uint8Array(Buffer.from(txResponse.result.hash, "base64"));

    // Return the final response
    return this.#signatureResponse(requestId, requestHash);
  }

  /**
   * Send RBT tokens
   *
   * @param params.receiverDid - The DID of the receiver.
   * @param params.rbtAmount - The amount of RBT tokens to send.
   * @param params.memo - An optional memo for the transaction. Defaults to "".
   * @returns Transaction response from the Rubix node.
   */
  async sendRbtTokens(params: { receiverDid: string; rbtAmount: number; memo?: string }): Promise<TxResponse> {
    const { receiverDid, rbtAmount, memo = "" } = params;

    const txRequest = new TransactionRequest({
      initiator: this.did,
      owner: receiverDid,
      tokens: new TransactionTokenDetails({
        rbt: rbtAmount,
      }),
      memo,
    });

    // Return the final response
    return this.initTx(txRequest);
  }

  /**
   * Creates a new FT token
   *
   * @param params.name - The name of the FT.
   * @param params.supply - The total supply of the FT.
   * @param params.rbtLockAmount - The amount of RBT tokens to lock for FT creation.
   * @returns Transaction response from the Rubix node.
   * @throws {Error} If the FT creation initiation fails.
   */
  async createFt(params: { name: string; supply: number; rbtLockAmount: number }): Promise<TxResponse> {
    const { name, supply, rbtLockAmount } = params;

    const txBody = {
      did: this.did,
      ft_count: supply,
      ft_name: name,
      ft_num_start_index: 0,
      token_count: rbtLockAmount,
    };

    const createFtResponse = await this.#client.makePostRequest("/rubix/v1/fts/mint", txBody);

    if (createFtResponse.status === false) {
      throw new Error(`FT creation initiation failed: ${createFtResponse.message}`);
    }

    // Sign the transaction
    const requestId = createFtResponse.result.id;
    const requestHash = new Uint8Array(Buffer.from(createFtResponse.result.hash, "base64"));

    // Return the final response
    return this.#signatureResponse(requestId, requestHash);
  }

  /**
   * Sends FT tokens
   *
   * @param params.receiverDid - The DID of the receiver.
   * @param params.ftName - The name of the FT.
   * @param params.ftCount - The amount of FT tokens to send.
   * @param params.ftCreatorDid - The DID of the FT creator.
   * @param params.comment - An optional comment for the transaction. Defaults to "".
   * @returns Transaction response from the Rubix node.
   */
  async sendFt(params: {
    receiverDid: string;
    ftName: string;
    ftCount: number;
    ftCreatorDid: string;
    comment?: string;
  }): Promise<TxResponse> {
    const { receiverDid, ftName, ftCount, ftCreatorDid, comment = "" } = params;

    const txBody = new TransactionRequest({
      initiator: this.did,
      owner: receiverDid,
      tokens: new TransactionTokenDetails({
        ft: [
          new FTInfo({
            ftName,
            numberOfFts: ftCount,
            creatorDid: ftCreatorDid,
          }),
        ],
      }),
      memo: comment,
    });

    // Return the final response
    return this.initTx(txBody);
  }

  /**
   * Deploys a smart contract
   *
   * @param params.wasmFile - Path to the WASM file.
   * @param params.codeFile - Path to the code file.
   * @param params.contractValue - Amount of RBT tokens to lock for contract deployment.
   * @param params.smartContractData - Arbitrary data for the smart contract deployment.
   * @param params.comment - An optional comment for the transaction.
   * @returns The contract address on success, otherwise the error message.
   * @throws {Error} If the smart contract address generation fails.
   */
  async deploySmartContract(params: {
    wasmFile: string;
    codeFile: string;
    contractValue: number;
    smartContractData: string;
    comment?: string;
  }): Promise<DeploySmartContractResult> {
    const { wasmFile, codeFile, contractValue, smartContractData, comment = "" } = params;

    const deployerDid = this.did;
    const smartContractAddress = await this.#generateSmartContractAddress(deployerDid, wasmFile, codeFile);

    const txBody = new TransactionRequest({
      initiator: this.did,
      owner: "",
      tokens: new TransactionTokenDetails({
        smartContract: [
          new SmartContractInfo({
            smartContractId: smartContractAddress,
            value: contractValue,
            data: smartContractData,
          }),
        ],
      }),
      memo: comment,
    });

    const txResponse = await this.initTx(txBody);

    // Return the final response
    if (txResponse.status === true) {
      return {
        contractAddress: smartContractAddress,
      };
    } else {
      return {
        error: txResponse.message ?? "Unknown error during smart contract deployment.",
      };
    }
  }

  /**
   * Executes a smart contract
   *
   * @param params.contractAddress - The address of the smart contract to execute.
   * @param params.smartContractData - Arbitrary data for the smart contract execution.
   * @param params.comment - An optional comment for the transaction.
   * @returns Transaction response from the Rubix node.
   */
  async executeSmartContract(params: {
    contractAddress: string;
    smartContractData: string;
    comment?: string;
  }): Promise<TxResponse> {
    const { contractAddress, smartContractData, comment = "" } = params;

    const txBody = new TransactionRequest({
      initiator: this.did,
      owner: "",
      tokens: new TransactionTokenDetails({
        smartContract: [
          new SmartContractInfo({
            smartContractId: contractAddress,
            value: 0,
            data: smartContractData,
          }),
        ],
      }),
      memo: comment,
    });

    // Return the final response
    return this.initTx(txBody);
  }

  /**
   * Deploys an NFT
   *
   * Either pass `nftId`, or both `artifactFile` and `metadataFile`.
   *
   * @param params.nftData - Arbitrary data for the NFT.
   * @param params.nftValue - The value of the NFT.
   * @param params.artifactFile - Path to the artifact file.
   * @param params.metadataFile - (To be Deprecated) Path to the metadata file.
   * @param params.nftId - Pre-computed IPFS CID v0. If this is passed, then `metadataFile`
   *   and `artifactFile` are ignored.
   * @returns The NFT address on success, otherwise the error message.
   * @throws {Error} If the arguments are invalid or the NFT address generation fails.
   */
  async deployNft(params: {
    nftData: string;
    nftValue: number;
    artifactFile?: string;
    metadataFile?: string;
    nftId?: string;
  }): Promise<DeployNftResult> {
    const { nftData, nftValue, artifactFile = "", metadataFile = "", nftId = "" } = params;

    const deployerDid = this.did;

    // Either nftId or both artifactFile and metadataFile should be passed.
    // Passing all of them or none of them would result in an error
    if (nftId !== "" && artifactFile !== "" && metadataFile !== "") {
      throw new Error(
        "values for `nftId`, `artifactFile` and `metadataFile` have been passed. " +
          " Either pass `nftId` or both `artifactFile` and `metadataFile`",
      );
    }

    if (nftId === "" && artifactFile === "" && metadataFile === "") {
      throw new Error(
        "`nftId`, `artifactFile` and `metadataFile` are empty. " +
          " Either pass `nftId` or both `artifactFile` and `metadataFile`",
      );
    }

    let nftAddress: string;
    if (nftId === "") {
      nftAddress = await this.#generateNftAddress(deployerDid, artifactFile, metadataFile);
    } else {
      // validate nftId
      if (!validateAssetAddress(nftId)) {
        throw new Error(`nftId passed is not in a valid format, value: ${nftId}`);
      }

      nftAddress = nftId;
    }

    const txBody = new TransactionRequest({
      initiator: this.did,
      owner: "",
      tokens: new TransactionTokenDetails({
        nft: [
          new NFTInfo({
            nftId: nftAddress,
            value: nftValue,
            data: nftData,
          }),
        ],
      }),
      memo: "",
    });

    const txResponse = await this.initTx(txBody);

    // Return the final response
    if (txResponse.status === true) {
      return {
        nftAddress,
      };
    } else {
      return {
        error: txResponse.message ?? "Unknown error during NFT deployment.",
      };
    }
  }

  /**
   * Executes an NFT
   *
   * @param params.nftAddress - The address of the NFT to execute.
   * @param params.nftData - Arbitrary data for the NFT execution.
   * @param params.nftValue - The value of the NFT. Defaults to 1.
   * @param params.comment - An optional comment for the transaction.
   * @returns Transaction response from the Rubix node.
   */
  async executeNft(params: {
    nftAddress: string;
    nftData: string;
    nftValue?: number;
    comment?: string;
  }): Promise<TxResponse> {
    const { nftAddress, nftData, nftValue = 1, comment = "" } = params;

    const txBody = new TransactionRequest({
      initiator: this.did,
      owner: this.did,
      tokens: new TransactionTokenDetails({
        nft: [
          new NFTInfo({
            nftId: nftAddress,
            value: nftValue,
            data: nftData,
          }),
        ],
      }),
      memo: comment,
    });

    // Return the final response
    return this.initTx(txBody);
  }

  /**
   * Creates a child NFT of an existing NFT
   *
   * @param params.parentNftAddress - The address of the parent NFT.
   * @param params.nftData - Arbitrary data for the child NFT. Defaults to "".
   * @param params.nftValue - The value of the child NFT. Defaults to 0.
   * @param params.comment - An optional comment for the transaction. Defaults to "".
   * @param params.childNftId - The ID of the child NFT. Defaults to "".
   * @returns The child NFT addresses and transaction ID if the transaction is successful,
   *   otherwise the error message.
   * @throws {Error} If the child NFT addresses are missing from a successful transaction response.
   */
  async createChildNft(params: {
    parentNftAddress: string;
    nftData?: string;
    nftValue?: number;
    comment?: string;
    childNftId?: string;
  }): Promise<CreateChildNftResult> {
    const { parentNftAddress, nftData = "", nftValue = 0.0, comment = "", childNftId = "" } = params;

    const txBody = new TransactionRequest({
      initiator: this.did,
      owner: this.did,
      tokens: new TransactionTokenDetails({
        nft: [
          new NFTInfo({
            nftId: childNftId,
            value: nftValue,
            data: nftData,
            parentNFTId: parentNftAddress,
          }),
        ],
      }),
      memo: comment,
    });

    const txResponse = await this.initTx(txBody);
    if (txResponse.status === true) {
      const result = txResponse.result as Record<string, any> | null;
      if (result == null || typeof result !== "object" || !("mintedNFTChildren" in result) || !("transactionID" in result)) {
        throw new Error("Child NFT address not found in the transaction response.");
      }
      return {
        childNfts: result.mintedNFTChildren,
        txId: result.transactionID,
      };
    } else {
      return {
        error: txResponse.message ?? "Unknown error during child NFT creation.",
      };
    }
  }

  /**
   * Transfers NFT ownership to another DID
   *
   * @param params.nftAddress - The address of the NFT to transfer.
   * @param params.receiverDid - The DID of the receiver.
   * @param params.nftValue - The value of the NFT.
   * @param params.nftData - Additional data for the NFT. Defaults to "".
   * @param params.comment - An optional comment for the transaction. Defaults to "".
   * @returns Transaction response from the Rubix node.
   */
  async transferNft(params: {
    nftAddress: string;
    receiverDid: string;
    nftValue: number;
    nftData?: string;
    comment?: string;
  }): Promise<TxResponse> {
    const { nftAddress, receiverDid, nftValue, nftData = "", comment = "" } = params;

    const txBody = new TransactionRequest({
      initiator: this.did,
      owner: receiverDid,
      tokens: new TransactionTokenDetails({
        nft: [
          new NFTInfo({
            nftId: nftAddress,
            value: nftValue,
            data: nftData,
          }),
        ],
      }),
      memo: comment,
    });

    // Return the final response
    return this.initTx(txBody);
  }
}
