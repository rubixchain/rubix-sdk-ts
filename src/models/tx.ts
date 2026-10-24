export class FTInfo {
  ftName: string;
  numberOfFts: number;
  creatorDid: string;

  constructor(params: { ftName: string; numberOfFts: number; creatorDid: string }) {
    this.ftName = params.ftName;
    this.numberOfFts = params.numberOfFts;
    this.creatorDid = params.creatorDid;
  }

  toJSON() {
    return {
      ftName: this.ftName,
      numberOfFts: this.numberOfFts,
      creatorDID: this.creatorDid,
    };
  }
}

export class NFTInfo {
  nftId: string;
  value: number;
  data: string;
  parentNFTId: string;

  constructor(params: { nftId: string; value: number; data: string; parentNFTId?: string }) {
    this.nftId = params.nftId;
    this.value = params.value;
    this.data = params.data;
    this.parentNFTId = params.parentNFTId ?? "";
  }

  toJSON() {
    return {
      nftId: this.nftId,
      value: this.value,
      data: this.data,
      parentNFTId: this.parentNFTId,
    };
  }
}

export class SmartContractInfo {
  smartContractId: string;
  value: number;
  data: string;

  constructor(params: { smartContractId: string; value: number; data: string }) {
    this.smartContractId = params.smartContractId;
    this.value = params.value;
    this.data = params.data;
  }

  toJSON() {
    return {
      smartContractId: this.smartContractId,
      value: this.value,
      data: this.data,
    };
  }
}

export class TransactionTokenDetails {
  rbt: number | undefined;
  ft: FTInfo[] | undefined;
  nft: NFTInfo[] | undefined;
  smartContract: SmartContractInfo[] | undefined;
  transferNftOwnership: boolean;

  constructor(params: {
    rbt?: number;
    ft?: FTInfo[];
    nft?: NFTInfo[];
    smartContract?: SmartContractInfo[];
    transferNftOwnership?: boolean;
  }) {
    if (params.rbt == null && params.ft == null && params.nft == null && params.smartContract == null) {
      throw new Error("At least one of rbt, ft, nft, smartContract must be provided");
    }

    this.rbt = params.rbt ?? undefined;
    this.ft = params.ft ?? undefined;
    this.nft = params.nft ?? undefined;
    this.smartContract = params.smartContract ?? undefined;
    this.transferNftOwnership = params.transferNftOwnership ?? false;
  }

  toJSON() {
    return {
      rbt: this.rbt ?? null,
      ft: this.ft ? this.ft.map((ft) => ft.toJSON()) : [],
      nft: this.nft ? this.nft.map((nft) => nft.toJSON()) : [],
      smartContract: this.smartContract ? this.smartContract.map((sc) => sc.toJSON()) : [],
      transferNftOwnership: this.transferNftOwnership,
    };
  }
}

export class TransactionRequest {
  initiator: string;
  owner: string;
  tokens: TransactionTokenDetails;
  memo: string;

  constructor(params: { initiator: string; owner: string; tokens: TransactionTokenDetails; memo?: string }) {
    this.initiator = params.initiator;
    this.owner = params.owner;
    this.tokens = params.tokens;
    this.memo = params.memo ?? "";
  }

  toJSON() {
    return {
      initiator: this.initiator,
      owner: this.owner,
      tokens: this.tokens.toJSON(),
      memo: this.memo,
    };
  }
}
