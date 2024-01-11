import { Hasher } from "../utils/hasher";
import { AbstractKeygenRound } from "./abstractRound";
import { KeygenBroadcastForRound2, KeygenBroadcastForRound3 } from "./keygenMessages/broadcasts";
import { PartyId } from "./partyKey";
import { KeygenInputForRound3, KeygenRound2Output, KeygenBroadcastForRound3JSON } from "./types";

export class KeygenRound2 extends AbstractKeygenRound {
      public output: KeygenInputForRound3;
      private commitments: Record<PartyId, Uint8Array> = {};

      constructor() {
            super({ isBroadcastRound: true, isDriectMessageRound: false, currentRound: 2 });
      }

      public handleDirectMessage(bmsg: any): void {}

      public handleBroadcastMessage(bmsg: KeygenBroadcastForRound2): void {
            Hasher.validateCommitment(bmsg.commitment);
            this.commitments[bmsg.from] = bmsg.commitment;
      }

      public async process(): Promise<KeygenRound2Output> {
            const broadcasts: KeygenBroadcastForRound3JSON = new KeygenBroadcastForRound3(
                  this.session.selfId,
                  this.input.selfRID,
                  this.input.chainKey,
                  this.input.selfVSSpolynomial,
                  this.input.schnorrRand.commitment,
                  this.input.elGamalPublic,
                  this.input.selfPedersenPublic,
                  this.input.decommitment
            ).toJSON();

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
