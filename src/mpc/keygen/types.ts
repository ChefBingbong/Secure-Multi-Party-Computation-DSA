import { PartyId } from "./partyKey";
import { PaillierPublicKey } from "../paillierKeyPair/paillierPublicKey";
import { PaillierSecretKey } from "../paillierKeyPair/paillierSecretKey";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { PedersenParametersJSON } from "../paillierKeyPair/Pedersen/types";
import { Exponent, ExponentJSON } from "../math/polynomial/exponent";
import { Polynomial } from "../math/polynomial/polynomial";
import { AffinePoint, AffinePointJSON } from "../types";
import { ZkSchCommitmentJSON, ZkSchRandomness } from "../zk/zksch";
import { KeygenBroadcastForRound2 } from "./round2";
import { KeygenBroadcastForRound3 } from "./round3";
import {
      KeygenBroadcastForRound4,
      KeygenDirectMessageForRound4,
      KeygenInputForRound4,
} from "./round4";

export type KeygenInputForRound1 = {
      vssSecret: Polynomial;
      precomputedPaillierPrimes?: {
            p: bigint;
            q: bigint;
      };

      // TODO: these are for refresh? not implemented yet
      previousSecretECDSA: null;
      previousPublicSharesECDSA: null;
      previousChainKey: null;
};

export type KeygenRound1Output = {
      broadcasts: Array<KeygenBroadcastForRound2>;
      inputForRound2: KeygenInputForRound2;
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

export type KeygenRound2Output = {
      broadcasts: Array<KeygenBroadcastForRound3>;
      inputForRound3: KeygenInputForRound3;
};

export type KeygenBroadcastForRound2JSON = {
      from: string;
      commitmentHex: string;
};

export type KeygenBroadcastForRound3JSON = {
      from: PartyId;
      RIDhex: string;
      Chex: string;
      vssPolynomial: ExponentJSON;
      schnorrCommitment: ZkSchCommitmentJSON;
      elGamalPublic: AffinePointJSON;
      pedersenPublic: PedersenParametersJSON;
      decommitmentHex: string;
};

export type KeygenRound3Output = {
      broadcasts: Array<KeygenBroadcastForRound4>;
      directMessages: Array<KeygenDirectMessageForRound4>;
      inputForRound4: KeygenInputForRound4;
};

export type KeygenInputForRound3 = {
      inputForRound2: KeygenInputForRound2;
      commitments: Record<PartyId, Uint8Array>;
};
