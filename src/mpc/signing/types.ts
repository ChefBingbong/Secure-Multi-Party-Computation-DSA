import { PartyId } from "../keygen/partyKey";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { PaillierPublicKey, PaillierSecretKey } from "../paillierKeyPair/paillierKeygen";
import { AffinePoint, AffinePointJSON } from "../types";
import { ZkAffgProofJSON } from "../zk/affg";
import { ZkEncProofJSON } from "../zk/enc";
import { ZkLogstarProofJSON } from "../zk/logstar";
import {
      SignBroadcastForRound2,
      SignBroadcastForRound3,
      SignBroadcastForRound4,
      SignBroadcastForRound5,
} from "./signMessages/broadcasts";
import { SignMessageForRound2, SignMessageForRound3, SignMessageForRound4 } from "./signMessages/directMessages";

export type SignRequestJSON = {
      messageHex: string;
      signerIds: Array<string>;
};

export type SignPartyInputRound1 = {
      publicKey: AffinePoint;
      secretEcdsa: bigint;
      secretPaillier: PaillierSecretKey;
      partiesPublic: Record<
            string,
            {
                  paillier: PaillierPublicKey;
                  pedersen: PedersenParams;
                  ecdsa: AffinePoint;
            }
      >;
      message: Uint8Array;
};

export type SignPartyOutputRound1 = {
      broadcasts: [SignBroadcastForRound2];
      messages: Array<SignMessageForRound2>;
      inputForRound2: SignPartyInputRound2;
};

export type SignPartyInputRound2 = {
      inputForRound1: SignPartyInputRound1;
      K: bigint; // Paillier ciphertext
      G: bigint; // Paillier ciphertext
      BigGammaShare: AffinePoint;
      GammaShare: bigint;
      KShare: bigint;
      KNonce: bigint;
      GNonce: bigint;
};

export type SignPartyOutputRound2 = {
      broadcasts: Array<SignBroadcastForRound3>;
      messages: Array<SignMessageForRound3>;
      inputForRound3: SignInputForRound3;
};

export type SignMessageForRound2JSON = {
      from: string;
      to: string;
      proofEnc: ZkEncProofJSON;
      type: 2;
};

export type SignBroadcastForRound2JSON = {
      from: string;
      Khex: string;
      Ghex: string;
      type: 2;
};

export type SignBroadcastForRound3JSON = {
      from: string;
      BigGammaShare: AffinePointJSON;
      type: 3;
};

export type SignMessageForRound3JSON = {
      from: string;
      to: string;
      type: 3;

      DeltaDhex: string; // Ciphertext
      DeltaFhex: string; // Ciphertext
      DeltaProof: ZkAffgProofJSON;
      ChiDhex: string; // Ciphertext
      ChiFhex: string; // Ciphertext
      ChiProof: ZkAffgProofJSON;
      ProofLog: ZkLogstarProofJSON;
};

export type SignInputForRound3 = {
      DeltaShareBetas: Record<PartyId, bigint>;
      ChiShareBetas: Record<PartyId, bigint>;
      K: Record<PartyId, bigint>;
      G: Record<PartyId, bigint>;
      inputForRound2: SignPartyInputRound2;
};

export type SignPartyOutputRound3 = {
      broadcasts: Array<SignBroadcastForRound4>;
      messages: Array<SignMessageForRound4>;
      inputForRound4: SignInputForRound4;
};

export type SignBroadcastForRound4JSON = {
      from: string;
      DeltaShareHex: string;
      BigDeltaShare: AffinePointJSON;
      type: 4;
};

export type SignInputForRound4 = {
      DeltaShare: bigint;
      BigDeltaShare: AffinePoint;
      Gamma: AffinePoint;
      ChiShare: bigint;
      inputForRound3: SignInputForRound3;
};

export type SignMessageForRound4JSON = {
      from: string;
      to: string;
      ProofLog: ZkLogstarProofJSON;
      type: 4;
};

export type SignPartyOutputRound4 = {
      broadcasts: Array<SignBroadcastForRound5>;
      inputForRound5: SignInputForRound5;
};

export type SignBroadcastForRound5JSON = {
      from: string;
      SigmaShareHex: string;
      type: 5;
};

export type SignInputForRound5 = {
      Delta: bigint;
      BigDelta: AffinePoint;
      BigR: AffinePoint;
      R: bigint;
      inputForRound4: SignInputForRound4;
};

export type SignPartyOutputRound5 = {
      signature: {
            R: AffinePoint;
            S: bigint;
      };
};
