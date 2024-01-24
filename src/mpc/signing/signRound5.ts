import { PartyId } from "../keygen/partyKey";
import { verifySignature } from "../math/curve";
import Fn from "../math/polynomial/Fn";
import { AbstractSignRound } from "./abstractSignRound";
import { SignSession } from "./signSession";
import { SignBroadcastForRound5JSON, SignInputForRound5, SignPartyOutputRound5 } from "./types";

export class SignBroadcastForRound5 {
      public readonly from: PartyId;
      public readonly SigmaShare: bigint;

      private constructor(from: PartyId, SigmaShare: bigint) {
            this.from = from;
            this.SigmaShare = SigmaShare;
      }

      public static from({ from, SigmaShare }: { from: PartyId; SigmaShare: bigint }): SignBroadcastForRound5 {
            const bmsg = new SignBroadcastForRound5(from, SigmaShare);
            Object.freeze(bmsg);
            return bmsg;
      }

      public static fromJSON({ from, SigmaShareHex }: SignBroadcastForRound5JSON): SignBroadcastForRound5 {
            const SigmaShare = BigInt(`0x${SigmaShareHex}`);
            const bmsg = new SignBroadcastForRound5(from, SigmaShare);
            Object.freeze(bmsg);
            return bmsg;
      }

      public toJSON(): SignBroadcastForRound5JSON {
            return {
                  from: this.from,
                  SigmaShareHex: this.SigmaShare.toString(16),
            };
      }
}

export class SignerRound5 extends AbstractSignRound {
      public session: SignSession;
      private roundInput: SignInputForRound5;
      public output: any;

      private SigmaShares: Record<PartyId, bigint> = {};

      public currentRound: number;
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;

      constructor() {
            super({ isBroadcastRound: true, isDriectMessageRound: false, currentRound: 5 });
      }

      public init({ session, input }: { session?: SignSession; input?: any }): void {
            this.session = session;
            this.roundInput = input;
      }

      public handleDirectMessage(bmsg: any): void {}
      public handleBroadcastMessage(bmsg: SignBroadcastForRound5): void {
            if (bmsg.SigmaShare === 0n) {
                  throw new Error(`SigmaShare from ${bmsg.from} is zero`);
            }
            this.SigmaShares[bmsg.from] = bmsg.SigmaShare;
      }

      public async process(): Promise<SignPartyOutputRound5> {
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
