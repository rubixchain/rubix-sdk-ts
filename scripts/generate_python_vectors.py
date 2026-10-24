"""
Generates cross-compatibility test vectors from the reference Python SDK (rubix-py).

The TS test-suite consumes the output to prove that keys, signatures, PEM files
and CID validation behave identically in both SDKs.

Usage (from the rubix-sdk-ts directory, with rubix-py installed in the interpreter):

    python -I scripts/generate_python_vectors.py tests/fixtures/python
"""
import hashlib
import json
import os
import shutil
import sys

from ecpy.curves import Curve
from ecpy.formatters import decode_sig

from rubix.crypto.account import save_account_to_file
from rubix.crypto.bip39 import get_seed_from_mnemonic
from rubix.crypto.secp256k1 import Secp256k1Keypair, secp256k1_verify
from rubix.models.tx import FTInfo, NFTInfo, SmartContractInfo, TransactionRequest, TransactionTokenDetails
from rubix.utils.validate import validate_asset_address, validate_did

MNEMONIC = (
    "buffalo tumble defy laundry call almost little pig lift party property pool "
    "frame erosion mind library sample floor ring enemy word enemy foster ill"
)
PRIVATE_KEY_HEX = "1e99423a4edf5c3d2e8f6b8c3f4e5d6c7b8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c"

PEM_PUBLIC_KEY_HEX = (
    "04b8edb32c69e16b8d30de87b48aedc4fa09f1643fbaa3e85dbb1932498ea94b0a"
    "7fd48c325a591a08e350b8b1ddfb7416ff72f7d61dad9a33b46658ef77ca6625"
)
PEM_PRIVATE_KEY_HEX = "e32a09e939376358c37c8780beb632f5cf2fa12c8a53bc77984e60964fd59c78"
PEM_DID = "bafybmicbopex4ydytrtremmculwpo7e5p2uvbkuw2ds775xmkcsc5lglai"
PEM_ALIAS = "nero"
PEM_PASSPHRASE = "testpassphrase"

MESSAGES = [
    b"",
    b"Test message for signing",
    hashlib.sha256(b"Lorem ipsum dolor sit amet, consectetur adipiscing elit.").digest(),
    b"Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    bytes(range(200)),
]

CID_CASES = [
    "bafybmifxxg6xvzbu6cd5gqrtsl4mqizlnjioz6djp45kq6lq6fn7hl3cmq",
    "bafybmicbopex4ydytrtremmculwpo7e5p2uvbkuw2ds775xmkcsc5lglai",
    "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    "BAFYBMIFXXG6XVZBU6CD5GQRTSL4MQIZLNJIOZ6DJP45KQ6LQ6FN7HL3CMQ",
    "zb2rhe5P4gXftAwvA4eXQ5HJwsER2owDyS9sKaQRRVQPn93bA",
    "bafybmifxxg6xvzbu6cd5gqrtsl4mqizlnjioz6djp45kq6lq6fn7hl3cm",
    "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    "QmemZiUZkmsxg6nyYH718VXwSfgdsQoPXBd6nDNvWQ1srr",
    "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbd",
    "",
    "abc",
    "not a cid at all",
]


def signature_vectors(keypair: Secp256k1Keypair) -> list:
    n = Curve.get_curve("secp256k1").order
    public_key = bytes.fromhex(keypair.public_key)
    vectors = []
    for message in MESSAGES:
        # Collect both a low-S and a high-S signature, since ECPy does not normalise S
        wanted = {True, False}
        while wanted:
            signature = keypair.sign(message)
            _, s = decode_sig(signature, "DER")
            high_s = s > n // 2
            if high_s not in wanted:
                continue
            wanted.discard(high_s)
            vectors.append({
                "message": message.hex(),
                "signature": signature.hex(),
                "highS": high_s,
                "valid": secp256k1_verify(public_key, message, signature),
                "validForOtherMessage": secp256k1_verify(public_key, message + b"x", signature),
            })
    return vectors


def tx_vectors() -> dict:
    """Transaction request bodies, built the same way as the corresponding Signer methods."""
    signer = "bafybmigqhr3broqr77axocg3kpwrogxcrixmavf7oc267g2hphjf5t6feu"
    receiver = "bafybmicbopex4ydytrtremmculwpo7e5p2uvbkuw2ds775xmkcsc5lglai"
    asset = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
    parent = "QmQytWAMHzT6BvEVCEuHnpFhJZqetAL7JbPMW7ytC12bgK"

    def tx(owner, memo, **tokens):
        return TransactionRequest(
            initiator=signer, owner=owner, tokens=TransactionTokenDetails(**tokens), memo=memo
        ).to_json()

    return {
        "signer": signer,
        "receiver": receiver,
        "asset": asset,
        "parent": parent,
        "sendRbtTokens": tx(receiver, "Test RBT Transfer", rbt=0.001),
        "sendFt": tx(receiver, "Test FT Transfer", ft=[FTInfo(ft_name="ABC", number_of_fts=5, creator_did=signer)]),
        "deploySmartContract": tx("", "deploy", smartContract=[
            SmartContractInfo(smart_contract_id=asset, value=0.001, data="init")]),
        "executeSmartContract": tx("", "", smartContract=[
            SmartContractInfo(smart_contract_id=asset, value=0, data="test1")]),
        "deployNft": tx("", "", nft=[NFTInfo(nft_id=asset, value=0.001, data="init data")]),
        "executeNft": tx(signer, "", nft=[NFTInfo(nft_id=asset, value=1, data="test execution data")]),
        "createChildNft": tx(signer, "", nft=[NFTInfo(nft_id="", value=0.0, data="", parentNFTId=parent)]),
        "transferNft": tx(receiver, "gift", nft=[NFTInfo(nft_id=asset, value=0.001, data="")]),
    }


def main(out_dir: str) -> None:
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)

    seed = get_seed_from_mnemonic(MNEMONIC)
    seed_keypair = Secp256k1Keypair.from_mnemonic_seed(seed)
    priv_keypair = Secp256k1Keypair.from_private_key(bytes.fromhex(PRIVATE_KEY_HEX))

    # Account directory written by the Python SDK: <out>/account/<alias>/<did>/{pubKey,privKey}.pem
    account_dir = os.path.join(out_dir, "account")
    save_account_to_file(
        account_dir,
        bytes.fromhex(PEM_PUBLIC_KEY_HEX),
        bytes.fromhex(PEM_PRIVATE_KEY_HEX),
        PEM_DID,
        PEM_ALIAS,
        passphrase=PEM_PASSPHRASE,
    )

    vectors = {
        "mnemonic": MNEMONIC,
        "seed": seed.hex(),
        "seedKeypair": {
            "privateKey": seed_keypair.private_key,
            "publicKey": seed_keypair.public_key,
        },
        "privateKeyKeypair": {
            "privateKey": priv_keypair.private_key,
            "publicKey": priv_keypair.public_key,
        },
        "signatures": signature_vectors(priv_keypair),
        "account": {
            "dir": "account",
            "alias": PEM_ALIAS,
            "did": PEM_DID,
            "passphrase": PEM_PASSPHRASE,
            "publicKey": PEM_PUBLIC_KEY_HEX,
            "privateKey": PEM_PRIVATE_KEY_HEX,
        },
        "cids": [
            {"value": c, "isDid": validate_did(c), "isAssetAddress": validate_asset_address(c)}
            for c in CID_CASES
        ],
        "tx": tx_vectors(),
    }

    with open(os.path.join(out_dir, "vectors.json"), "w") as f:
        json.dump(vectors, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main(sys.argv[1])
