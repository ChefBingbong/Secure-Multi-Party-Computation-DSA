import { Helper } from "../../protocol/helper/helper";
import { Exponent } from "../math/polynomial/exponent";
import { Polynomial } from "../math/polynomial/polynomial";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { PaillierPublicKey } from "../paillierKeyPair/paillierPublicKey";
import { PaillierSecretKey } from "../paillierKeyPair/paillierSecretKey";
import { AffinePoint } from "../types";
import { ZkFacProofJSON } from "../zk/fac";
import { ZkSchCommitment, ZkSchRandomness } from "../zk/zksch";
import { PartyId, PartySecretKeyConfig } from "./partyKey";

// Keygen session input type
export type SessionConfig = {
      selfId: PartyId;
      partyIds: Array<PartyId>;
      threshold: number;
      precomputedPaillierPrimes?: {
            p: bigint;
            q: bigint;
      };
};

//Keygen round input types
export type KeygenInputForRound1 = {
      vssSecret: Polynomial;
      helper?: Helper;
      precomputedPaillierPrimes?: {
            p: bigint;
            q: bigint;
      };
      previousSecretECDSA: null;
      previousPublicSharesECDSA: null;
      previousChainKey: null;
};

export type KeygenInputForRound2 = {
      inputRound1: KeygenInputForRound1;
      selfVSSpolynomial: Exponent;
      selfCommitment: Uint8Array;
      selfRID: bigint;
      chainKey: bigint;
      selfShare: bigint;
      elGamalPublic: AffinePoint;
      selfPaillierPublic: PaillierPublicKey;
      selfPedersenPublic: PedersenParams;
      elGamalSecret: bigint;
      paillierSecret: PaillierSecretKey;
      pedersenSecret: bigint;
      schnorrRand: ZkSchRandomness;
      decommitment: Uint8Array;
};

export type KeygenInputForRound3 = {
      inputForRound2: KeygenInputForRound2;
      commitments: Record<PartyId, Uint8Array>;
};

export type KeygenInputForRound4 = {
      inputForRound3: KeygenInputForRound3;
      RID: bigint;
      ChainKey: bigint;
      PedersenPublic: Record<PartyId, PedersenParams>;
      PaillierPublic: Record<PartyId, PaillierPublicKey>;
      vssPolynomials: Record<PartyId, Exponent>;
      ElGamalPublic: Record<PartyId, AffinePoint>;
      SchnorrCommitments: Record<PartyId, ZkSchCommitment>;
};

export type KeygenInputForRound5 = {
      inputForRound4: KeygenInputForRound4;
      UpdatedConfig: PartySecretKeyConfig;
};

export type GenericKeygenRoundInput = KeygenInputForRound1 &
      KeygenInputForRound2 &
      KeygenInputForRound3 &
      KeygenInputForRound4 &
      KeygenInputForRound5;

// Keygen round output types
export type KeygenRound1Output = {
      broadcasts: KeygenBroadcastForRound2JSON;
      inputForRound2: KeygenInputForRound2;
};
export type KeygenRound2Output = {
      broadcasts: KeygenBroadcastForRound3JSON;
      inputForRound3: KeygenInputForRound3;
};

export type KeygenRound3Output = {
      broadcasts: KeygenBroadcastForRound4JSON;
      directMessages: Array<KeygenDirectMessageForRound4JSON>;
      inputForRound4: KeygenInputForRound4;
};

export type KeygenRound4Output = {
      broadcasts: KeygenBroadcastForRound5JSON;
      inputForRound5: any;
};

export type KeygenRound5Output = {
      UpdatedConfig: PartySecretKeyConfig;
};

export type GenericKeygenRoundOutput = Partial<
      KeygenRound1Output | KeygenRound2Output | KeygenRound3Output | KeygenRound4Output | KeygenRound5Output
>;

export type GenericRoundOutput = Partial<{
      vssSecret: Polynomial;
      precomputedPaillierPrimes: {
            p: bigint;
            q: bigint;
      };
      previousSecretECDSA: null;
      previousPublicSharesECDSA: null;
      previousChainKey: null;
      inputForRound1: KeygenInputForRound1;
      inputForRound3: KeygenInputForRound3;
      RIDs: Record<PartyId, bigint>;
      ChainKeys: Record<PartyId, bigint>;
      PaillierPublic: Record<PartyId, PaillierPublicKey>;
      Pedersen: Record<PartyId, PedersenParams>;
      vssPolynomials: Record<PartyId, Exponent>;
      SchnorrCommitments: Record<PartyId, ZkSchCommitment>;
      ElGamalPublic: Record<PartyId, AffinePoint>;
      inputRound1: KeygenInputForRound1;
      selfVSSpolynomial: Exponent;
      selfCommitment: Uint8Array;
      selfRID: bigint;
      chainKey: bigint;
      selfShare: bigint;
      elGamalPublic: AffinePoint;
      selfPaillierPublic: PaillierPublicKey;
      selfPedersenPublic: PedersenParams;
      elGamalSecret: bigint;
      paillierSecret: PaillierSecretKey;
      pedersenSecret: bigint;
      schnorrRand: ZkSchRandomness;
      decommitment: Uint8Array;
      inputForRound2: KeygenInputForRound2;
      commitments: Record<PartyId, Uint8Array>;
      inputForRound4: KeygenInputForRound4;
      UpdatedConfig: PartySecretKeyConfig;
      inputForRound5: KeygenInputForRound5;
}>;

// Keygen broadcast message types
export type KeygenBroadcastForRound2JSON = {
      from: PartyId;
      commitmentHex: string;
      type: 2;
};

export type KeygenBroadcastForRound3JSON = {
      from: PartyId;
      RIDhex: string;
      Chex: string;
      vssPolynomial: any; // Replace with the actual type
      schnorrCommitment: any; // Replace with the actual type
      elGamalPublic: any; // Replace with the actual type
      pedersenPublic: any; // Replace with the actual type
      decommitmentHex: string;
      type: 3;
};

export type KeygenBroadcastForRound4JSON = {
      from: PartyId;
      modProof: any; // Replace with the actual type
      prmProof: any; // Replace with the actual type
      type: 4;
};

export type KeygenBroadcastForRound5JSON = {
      from: PartyId;
      SchnorrResponse: any; // Replace with the actual type
      type: 5;
};

export type KeygenDirectMessageForRound4JSON = {
      from: string;
      to: string;
      shareHex: string;
      facProof: ZkFacProofJSON;
};
