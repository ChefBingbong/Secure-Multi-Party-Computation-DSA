import { app } from "../../protocol";
import { zkSchIsResponseValid, zkSchVerifyResponse } from "../zk/zksch";
import { AbstractKeygenRound } from "./abstractRound";
import { KeygenBroadcastForRound5 } from "./keygenMessages/broadcasts";
import { KeygenRound5Output } from "./types";

export class KeygenRound5 extends AbstractKeygenRound {
      constructor() {
            super({ isBroadcastRound: false, isDriectMessageRound: false, currentRound: 5 });
      }

      public handleDirectMessage(bmsg: any): void {}

      public handleBroadcastMessage(bmsg: KeygenBroadcastForRound5) {
            const { from, SchnorrResponse } = bmsg;

            try {
                  if (!zkSchIsResponseValid(SchnorrResponse)) {
                        throw new Error(`invalid schnorr response from ${from}`);
                  }

                  const verified = zkSchVerifyResponse(
                        SchnorrResponse,
                        this.session.cloneHashForId(from),
                        this.input.UpdatedConfig.publicPartyData[from].ecdsa,
                        this.input.inputForRound4.SchnorrCommitments[from]
                  );
                  if (!verified) {
                        throw new Error(`failed to validate schnorr response from ${from}`);
                  }
            } catch (error) {
                  console.log(error);
            }
      }

      public async process(): Promise<KeygenRound5Output> {
            this.output = {
                  UpdatedConfig: this.input.UpdatedConfig,
            };
            app.p2pServer.validator.PartyKeyShare = this.input.UpdatedConfig;
            return {
                  UpdatedConfig: this.input.UpdatedConfig,
            };
      }
}
