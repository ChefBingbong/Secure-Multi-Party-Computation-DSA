import { PartyId } from "../keygen/partyKey";
import { verifySignature } from "../math/curve";
import Fn from "../math/polynomial/Fn";
import { SignBroadcastForRound5 } from "./signMessages/broadcasts";
import { SignSession } from "./signSession";
import { SignInputForRound5, SignPartyOutputRound5 } from "./types";

export class SignerRound5 {
      public session: SignSession;
      private roundInput: SignInputForRound5;
      public output: any;

      private SigmaShares: Record<PartyId, bigint> = {};

      public currentRound: number;
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;

      constructor() {
            this.isBroadcastRound = true;
            this.isDirectMessageRound = false;
            this.currentRound = 1;
      }

      public init({ session, input }: { session?: SignSession; input?: any }): void {
            this.session = session;
            this.roundInput = input;
      }

      public handleBroadcastMessage(bmsg: SignBroadcastForRound5): void {
            if (bmsg.SigmaShare === 0n) {
                  throw new Error(`SigmaShare from ${bmsg.from} is zero`);
            }
            this.SigmaShares[bmsg.from] = bmsg.SigmaShare;
      }

      public process(): SignPartyOutputRound5 {
            let Sigma = 0n;
            this.session.partyIds.forEach((partyId) => {
                  Sigma = Fn.add(Sigma, this.SigmaShares[partyId]);
            });

            const signature = {
                  R: this.roundInput.BigR,
                  S: Sigma,
            };

            const { publicKey, message } =
                  this.roundInput.inputForRound4.inputForRound3.inputForRound2.inputForRound1;

            const verified = verifySignature(signature.R, signature.S, publicKey, message);

            if (!verified) {
                  throw new Error("Signature verification failed");
            }

            return {
                  signature,
            };
      }
}
