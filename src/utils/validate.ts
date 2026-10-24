import { bases } from "multiformats/basics";
import { CID } from "multiformats/cid";
import type { MultibaseDecoder } from "multiformats/bases/interface";

// Accept CIDs in any multibase encoding, as the Python SDK (py-cid) does.
// Each codec's decoder rejects strings that don't start with its own prefix.
const anyBaseDecoder: MultibaseDecoder<string> = {
  decode(multibase: string): Uint8Array<ArrayBuffer> {
    for (const codec of Object.values(bases)) {
      try {
        return codec.decoder.decode(multibase);
      } catch {
        // try the next encoding
      }
    }
    throw new Error(`Unable to decode multibase string: ${multibase}`);
  },
};

/** Parses `value` as a CID and returns its version, or `undefined` if it is not a valid CID. */
function cidVersion(value: string): number | undefined {
  try {
    return CID.parse(value, anyBaseDecoder).version;
  } catch {
    return undefined;
  }
}

/**
 * Validate the format of a DID (Decentralized Identifier).
 *
 * @param did - The DID string to validate.
 * @param isIpfs - If True, validate as an IPFS-based CID v1.
 * @returns True if the DID is valid, False otherwise.
 */
export function validateDid(did: string, isIpfs: boolean = false): boolean {
  isIpfs = true; // TODO: To be removed once non-IPFS DIDs are supported

  if (isIpfs) {
    return cidVersion(did) === 1;
  } else {
    return true; // TODO: validation logic for upcoming non-IPFS to be added once Core supports it
  }
}

/**
 * Validate the format of an asset address. The asset address format
 * is expected to follow IPFS CIDv0 conventions.
 *
 * @param address - The asset address string to validate.
 * @returns True if the asset address is valid, False otherwise.
 */
export function validateAssetAddress(address: string): boolean {
  return cidVersion(address) === 0;
}
