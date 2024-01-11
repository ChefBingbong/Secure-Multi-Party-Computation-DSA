import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { PartyId } from "../partyKey";
import { PedersenParams } from "../../paillierKeyPair/Pedersen/pendersen";
import { AffinePoint } from "../../types";
import { ZkSchCommitment, ZkSchResponse } from "../../zk/zksch";
import { Exponent } from "../../math/polynomial/exponent";
import { pointFromJSON, pointToJSON } from "../../math/curve";
import { ZkPrmProof } from "../../zk/prm";
import { ZkModProof } from "../../zk/mod";
import { AbstractKeygenBroadcast } from "./abstractKeygenBroadcast";
import {
      KeygenBroadcastForRound2JSON,
      KeygenBroadcastForRound3JSON,
      KeygenBroadcastForRound4JSON,
      KeygenBroadcastForRound5JSON,
} from "../types";

export class KeygenBroadcastForRound2 extends AbstractKeygenBroadcast {
      public readonly commitment: Uint8Array;

      constructor(from: PartyId, commitment: Uint8Array) {
            super(from, 2);
            this.commitment = commitment;
      }

      public toJSON(): KeygenBroadcastForRound2JSON {
            return {
                  from: this.from,
                  commitmentHex: bytesToHex(this.commitment),
                  type: this.type as 2,
            };
      }

      public static fromJSON(json: KeygenBroadcastForRound2JSON): KeygenBroadcastForRound2 {
            const commitment = hexToBytes(json.commitmentHex);
            return new KeygenBroadcastForRound2(json.from, commitment);
      }
}

export class KeygenBroadcastForRound3 extends AbstractKeygenBroadcast {
      public readonly RID: bigint;
      public readonly C: bigint;
      public readonly vssPolynomial: Exponent;
      public readonly schnorrCommitment: ZkSchCommitment;
      public readonly elGamalPublic: AffinePoint;
      public readonly pedersenPublic: PedersenParams;
      public readonly decommitment: Uint8Array;

      constructor(
            from: PartyId,
            RID: bigint,
            C: bigint,
            vssPolynomial: Exponent,
            schnorrCommitment: ZkSchCommitment,
            elGamalPublic: AffinePoint,
            pedersenPublic: PedersenParams,
            decommitment: Uint8Array
      ) {
            super(from, 3);
            this.RID = RID;
            this.C = C;
            this.vssPolynomial = vssPolynomial;
            this.schnorrCommitment = schnorrCommitment;
            this.elGamalPublic = elGamalPublic;
            this.pedersenPublic = pedersenPublic;
            this.decommitment = decommitment;
      }

      public toJSON(): KeygenBroadcastForRound3JSON {
            return {
                  from: this.from,
                  RIDhex: this.RID.toString(16),
                  Chex: this.C.toString(16),
                  vssPolynomial: this.vssPolynomial.toJSON(),
                  schnorrCommitment: this.schnorrCommitment.toJSON(),
                  elGamalPublic: pointToJSON(this.elGamalPublic),
                  pedersenPublic: {
                        nHex: this.pedersenPublic.n.toString(16),
                        sHex: this.pedersenPublic.s.toString(16),
                        tHex: this.pedersenPublic.t.toString(16),
                  },
                  decommitmentHex: bytesToHex(this.decommitment),
                  type: this.type as 3,
            };
      }

      public static fromJSON(json: KeygenBroadcastForRound3JSON): KeygenBroadcastForRound3 {
            try {
                  return new KeygenBroadcastForRound3(
                        json.from,
                        BigInt(`0x${json.RIDhex}`),
                        BigInt(`0x${json.Chex}`),
                        Exponent.fromJSON(json.vssPolynomial),
                        ZkSchCommitment.fromJSON(json.schnorrCommitment),
                        pointFromJSON(json.elGamalPublic),
                        new PedersenParams(
                              BigInt("0x" + json.pedersenPublic.nHex),
                              BigInt("0x" + json.pedersenPublic.sHex),
                              BigInt("0x" + json.pedersenPublic.tHex)
                        ),
                        hexToBytes(json.decommitmentHex)
                  );
            } catch (error) {
                  console.log(error);
                  throw new Error("Failed to create KeygenBroadcastForRound3 from JSON");
            }
      }
}

export class KeygenBroadcastForRound4 extends AbstractKeygenBroadcast {
      public readonly modProof: ZkModProof;
      public readonly prmProof: ZkPrmProof;

      constructor(from: PartyId, modProof: ZkModProof, prmProof: ZkPrmProof) {
            super(from, 4);
            this.modProof = modProof;
            this.prmProof = prmProof;
      }

      public toJSON(): KeygenBroadcastForRound4JSON {
            return {
                  from: this.from,
                  modProof: this.modProof.toJSON(),
                  prmProof: this.prmProof.toJSON(),
                  type: this.type as 4,
            };
      }

      public static fromJSON(json: KeygenBroadcastForRound4JSON): KeygenBroadcastForRound4 {
            const { from, modProof, prmProof } = json;
            return new KeygenBroadcastForRound4(
                  from,
                  ZkModProof.fromJSON(modProof),
                  ZkPrmProof.fromJSON(prmProof)
            );
      }
}

export class KeygenBroadcastForRound5 extends AbstractKeygenBroadcast {
      public readonly SchnorrResponse: ZkSchResponse;

      constructor(from: PartyId, SchnorrResponse: ZkSchResponse) {
            super(from, 5);
            this.SchnorrResponse = SchnorrResponse;
      }

      public toJSON(): KeygenBroadcastForRound5JSON {
            return {
                  from: this.from,
                  SchnorrResponse: this.SchnorrResponse.toJSON(),
                  type: this.type as 5,
            };
      }

      public static fromJSON(json: KeygenBroadcastForRound5JSON): KeygenBroadcastForRound5 {
            return new KeygenBroadcastForRound5(json.from, ZkSchResponse.fromJSON(json.SchnorrResponse));
      }
}
