import type { RubixClient } from "./client.js";
import type { FTBalance, NFTBalance, NFTRecord, NFTTokenBlock, RBTBalance, SmartContractChain } from "./models/querier.js";
import { validateAssetAddress, validateDid } from "./utils/validate.js";

export interface StatesOptions {
  /** Whether to retrieve only the latest state. Default is false. */
  onlyLatestState?: boolean;
}

export class Querier {
  readonly #client: RubixClient;

  constructor(rubixClient: RubixClient) {
    // Set Rubix Client
    if (rubixClient == null) {
      throw new Error("RubixClient instance is required");
    }

    this.#client = rubixClient;
  }

  /** Keeps only the latest state of a token chain, which the node returns ordered oldest first. */
  #latestState<T>(states: T[]): T[] {
    return Array.isArray(states) ? states.slice(-1) : states;
  }

  /** Returns `response.result`, or throws `invalidMessage` if the response has no result. */
  #result(response: any, invalidMessage: string): any {
    if (!("result" in response)) {
      throw new Error(`${invalidMessage}, response value: ${JSON.stringify(response)}`);
    }
    return response.result;
  }

  /**
   * Retrieves the RBT balance for a given DID.
   *
   * @param did - User DID
   * @returns The RBT balance associated with the DID.
   * @throws {Error} If the DID is invalid or if the request fails.
   */
  async getRbtBalance(did: string): Promise<RBTBalance> {
    if (!validateDid(did)) {
      throw new Error(`Invalid DID: ${did}`);
    }

    const endpoint = `/rubix/v1/dids/${did}/balances/rbt`;
    const response = await this.#client.makeGetRequest(endpoint);

    if (response.status === false) {
      throw new Error(`Failed to get RBT balance: ${response.message}`);
    }

    return this.#result(response, "Invalid account information received");
  }

  /**
   * Retrieves the FT balances for a given DID.
   *
   * @param did - User DID
   * @returns A list of FT balances.
   * @throws {Error} If the DID is invalid or if the request fails.
   */
  async getFtBalances(did: string): Promise<FTBalance[]> {
    if (!validateDid(did)) {
      throw new Error(`Invalid DID: ${did}`);
    }

    const endpoint = `/rubix/v1/dids/${did}/balances/ft`;
    const response = await this.#client.makeGetRequest(endpoint);

    if (response.status === false) {
      throw new Error(`Failed to get FT balances: ${response.message}`);
    }

    return this.#result(response, "Invalid account information received");
  }

  /**
   * Retrieves the states of a smart contract by its address.
   *
   * @param contractAddress - The address of the smart contract.
   * @param options.onlyLatestState - Whether to retrieve only the latest state of the Smart Contract.
   *   Default is false.
   * @returns A list containing the smart contract states, oldest first. With `onlyLatestState`,
   *   the list holds only the latest state.
   * @throws {Error} If the contract address is invalid or if the request fails.
   */
  async getSmartContractStates(contractAddress: string, options: StatesOptions = {}): Promise<SmartContractChain[]> {
    const { onlyLatestState = false } = options;

    if (!validateAssetAddress(contractAddress)) {
      throw new Error(`Invalid smart contract address: ${contractAddress}`);
    }

    const response = await this.#client.makeGetRequest(`/rubix/v1/smart_contracts/${contractAddress}/chain`);

    if (response.status === false) {
      throw new Error(`Failed to get smart contract states: ${response.message}`);
    }

    const smartContractStates = this.#result(response, "Invalid contract information received");
    return onlyLatestState ? this.#latestState(smartContractStates) : smartContractStates;
  }

  /**
   * Retrieves the states of an NFT by its address.
   *
   * @param nftAddress - The address of the NFT.
   * @param options.onlyLatestState - Whether to retrieve only the latest state of the NFT.
   *   Default is false.
   * @returns List containing the NFT states, oldest first. With `onlyLatestState`,
   *   the list holds only the latest state.
   * @throws {Error} If the NFT address is invalid or if the request fails.
   */
  async getNftStates(nftAddress: string, options: StatesOptions = {}): Promise<NFTTokenBlock[]> {
    const { onlyLatestState = false } = options;

    if (!validateAssetAddress(nftAddress)) {
      throw new Error(`Invalid NFT address: ${nftAddress}`);
    }

    const endpoint = `/rubix/v1/nfts/${nftAddress}/chain`;
    const response = await this.#client.makeGetRequest(endpoint);

    if (response.status === false) {
      throw new Error(`Failed to get NFT states: ${response.message}`);
    }

    const nftStates = this.#result(response, "Invalid NFT information received");
    return onlyLatestState ? this.#latestState(nftStates) : nftStates;
  }

  /**
   * Retrieves all NFTs present in a Rubix Subnet
   *
   * @returns List containing information about all NFTs.
   */
  async getAllNft(): Promise<NFTRecord[]> {
    const response = await this.#client.makeGetRequest("/rubix/v1/nfts");

    if (response.status === false) {
      throw new Error(`Failed to get all NFTs: ${response.message}`);
    }

    return this.#result(response, "Invalid NFT information received");
  }

  /**
   * Retrieves all NFTs owned by a specific DID.
   *
   * @param ownerDid - The DID of the owner.
   * @returns List containing information about NFTs owned by the specified DID,
   *   or null if the DID owns no NFTs.
   * @throws {Error} If the DID is invalid or if the request fails.
   */
  async getNftsByOwner(ownerDid: string): Promise<NFTBalance[] | null> {
    if (!validateDid(ownerDid)) {
      throw new Error(`Invalid DID: ${ownerDid}`);
    }

    const response = await this.#client.makeGetRequest(`/rubix/v1/dids/${ownerDid}/balances/nft`);

    if (response.status === false) {
      throw new Error(`Failed to get NFTs by owner: ${response.message}`);
    }

    return this.#result(response, "Invalid NFT information received");
  }

  /**
   * Retrieves all child NFTs of a given parent NFT.
   *
   * @param parentNftAddress - The address of the parent NFT.
   * @returns List containing information about child NFTs, or null if there are none.
   * @throws {Error} If the parent NFT address is invalid or if the request fails.
   */
  async getChildNfts(parentNftAddress: string): Promise<NFTBalance[] | null> {
    if (!validateAssetAddress(parentNftAddress)) {
      throw new Error(`Invalid parent NFT address: ${parentNftAddress}`);
    }

    const response = await this.#client.makeGetRequest(`/rubix/v1/nfts/${parentNftAddress}/children`);

    if (response.status === false) {
      throw new Error(`Failed to get child NFTs: ${response.message}`);
    }

    return this.#result(response, "Invalid NFT information received");
  }

  /**
   * Retrieves the parent NFT of a given child NFT.
   *
   * @param childNftAddress - The address of the child NFT.
   * @returns Information about the parent NFT. Returns an empty string if there is no parent NFT.
   * @throws {Error} If the child NFT address is invalid or if the request fails.
   */
  async getParentNft(childNftAddress: string): Promise<NFTBalance | ""> {
    if (!validateAssetAddress(childNftAddress)) {
      throw new Error(`Invalid child NFT address: ${childNftAddress}`);
    }

    const response = await this.#client.makeGetRequest(`/rubix/v1/nfts/${childNftAddress}/parent`);

    if (response.status === false) {
      throw new Error(`Failed to get parent NFT: ${response.message}`);
    }

    const parentNftInfo = this.#result(response, "Invalid NFT information received");
    if (parentNftInfo == null) {
      return "";
    }
    return parentNftInfo;
  }
}
