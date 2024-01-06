import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { PartyId } from "./partyKey";
import { Hasher } from "../utils/hasher";
import { KeygenSession } from "./keygenSession";
import { KeygenBroadcastForRound3 } from "./round3";
import {
      KeygenBroadcastForRound2JSON,
      KeygenInputForRound2,
      KeygenInputForRound3,
      KeygenRound2Output,
} from "./types";
import { AbstractKeygenRound } from "./abstractRound";

export class KeygenBroadcastForRound2 {
      public readonly from: PartyId;
      public readonly commitment: Uint8Array;

      private constructor(from: PartyId, commitment: Uint8Array) {
            this.from = from;
            this.commitment = commitment;
      }

      public static from({
            from,
            commitment,
      }: {
            from: PartyId;
            commitment: Uint8Array;
      }): KeygenBroadcastForRound2 {
            const b = new KeygenBroadcastForRound2(from, commitment);
            Object.freeze(b);
            return b;
      }

      public toJSON(): KeygenBroadcastForRound2JSON {
            return {
                  from: this.from,
                  commitmentHex: bytesToHex(this.commitment),
            };
      }

      public static fromJSON(json: KeygenBroadcastForRound2JSON): KeygenBroadcastForRound2 {
            const commitment = hexToBytes(json.commitmentHex);
            return new KeygenBroadcastForRound2(json.from, commitment);
      }
}

export class KeygenRound2 extends AbstractKeygenRound<
      KeygenInputForRound2,
      KeygenRound2Output,
      KeygenBroadcastForRound2,
      any
> {
      public output: KeygenInputForRound3;
      private commitments: Record<PartyId, Uint8Array> = {};

      constructor() {
            super();
      }

      public handleDirectMessage(bmsg: any): void {}

      public handleBroadcastMessage(bmsg: KeygenBroadcastForRound2): void {
            Hasher.validateCommitment(bmsg.commitment);
            this.commitments[bmsg.from] = bmsg.commitment;
      }

      public async process(): Promise<KeygenRound2Output> {
            const broadcasts: Array<KeygenBroadcastForRound3> = [
                  KeygenBroadcastForRound3.from({
                        from: this.session.selfId,
                        RID: this.input.selfRID,
                        C: this.input.chainKey,
                        vssPolynomial: this.input.selfVSSpolynomial,
                        schnorrCommitment: this.input.schnorrRand.commitment,
                        elGamalPublic: this.input.elGamalPublic,
                        pedersenPublic: this.input.selfPedersenPublic,
                        decommitment: this.input.decommitment,
                  }),
            ];

            this.output = {
                  inputForRound2: this.input,
                  commitments: this.commitments,
            };
            return {
                  broadcasts,
                  inputForRound3: this.output,
            };
      }
}
