/**
 * Represents the RBT balance details for a user.
 *
 * @property balance - RBT balance.
 * @property pledged - RBT balance pledged.
 * @property locked - RBT balance locked.
 */
export interface RBTBalance {
  balance: number;
  pledged: number;
  locked: number;
}

/**
 * Represents the balance details of a fungible token (FT).
 *
 * @property name - Name of the FT
 * @property creator - Creator DID of the FT
 * @property value - Value of the FT
 * @property count - Count of the FT
 */
export interface FTBalance {
  name: string;
  creator: string;
  value: number;
  count: number;
}

/**
 * Represents a block in the token chain of a smart contract or an NFT.
 *
 * @property transactionId - Transaction ID
 * @property initiator - DID of the initiator of the transaction
 * @property epoch - Epoch of the transaction
 * @property data - Data associated with the transaction
 */
export interface TokenChainBlock {
  transactionId: string;
  initiator: string;
  epoch: number;
  data: string;
}

/** Represents a block in the token chain of a smart contract. */
export type SmartContractChain = TokenChainBlock;

/** Represents a block in the token chain of an NFT. */
export type NFTTokenBlock = TokenChainBlock;

/**
 * Represents an NFT owned by a DID, or a parent/child NFT.
 *
 * @property nft_id - The address of the NFT.
 * @property value - The value of the NFT.
 */
export interface NFTBalance {
  nft_id: string;
  value: number;
}

/**
 * Represents an NFT present in a Rubix Subnet, as listed by {@link Querier.getAllNft}.
 */
export interface NFTRecord {
  TokenID: string;
  /** Address of the parent NFT; empty or null if the NFT has no parent. */
  ParentTokenID: string | null;
  TokenValue: number;
  TokenStatus: number;
  DID: string;
  TransactionID: string;
  TokenStateHash: string;
  TokenType: number;
  LatestPosition: number;
  LatestRole: number;
  CreatedAt: string;
  UpdatedAt: string;
  SyncStatus: number;
}
