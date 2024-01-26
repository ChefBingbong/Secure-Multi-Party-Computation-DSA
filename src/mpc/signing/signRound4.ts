import { secp256k1 } from "@noble/curves/secp256k1";
import { PartyId } from "../keygen/partyKey";
import { isIdentity, scalarFromHash } from "../math/curve";
import Fn from "../math/polynomial/Fn";
import { AffinePoint } from "../types";
import { ZkLogstarPublic, zkLogstarVerifyProof } from "../zk/logstar";
import { SignSession } from "./signSession";
import { SignInputForRound4, SignPartyOutputRound4 } from "./types";
import { SignBroadcastForRound4, SignBroadcastForRound5 } from "./signMessages/broadcasts";
import { SignMessageForRound4 } from "./signMessages/directMessages";

export class SignerRound4 {
      public session: SignSession;
      private roundInput: SignInputForRound4;
      public output: any;

      private DeltaShares: Record<PartyId, bigint> = {};
      private BigDeltaShares: Record<PartyId, AffinePoint> = {};

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

      public handleBroadcastMessage(bmsg: SignBroadcastForRound4): void {
            const point = secp256k1.ProjectivePoint.fromAffine(bmsg.BigDeltaShare);
            if (bmsg.DeltaShare === 0n || isIdentity(point)) {
                  throw new Error("Invalid broadcast message");
            }

            this.DeltaShares[bmsg.from] = bmsg.DeltaShare;
            this.BigDeltaShares[bmsg.from] = bmsg.BigDeltaShare;
      }

      public handleDirectMessage(msg: SignMessageForRound4): void {
            const pubData = this.roundInput.inputForRound3.inputForRound2.inputForRound1.partiesPublic;
            const pub: ZkLogstarPublic = {
                  C: this.roundInput.inputForRound3.K[msg.from],
                  X: this.BigDeltaShares[msg.from],
                  G: this.roundInput.Gamma,
                  prover: pubData[msg.from].paillier,
                  aux: pubData[msg.to].pedersen,
            };
            const verified = zkLogstarVerifyProof(msg.ProofLog, pub, this.session.cloneHashForId(msg.from));
            if (!verified) {
                  throw new Error(`${msg.to}: Invalid log proof from ${msg.from}`);
            }
      }

      public process(): SignPartyOutputRound4 {
            let Delta = 0n;
            let BigDelta = secp256k1.ProjectivePoint.ZERO;
            this.session.partyIds.forEach((partyId) => {
                  Delta = Fn.add(Delta, this.DeltaShares[partyId]);
                  BigDelta = BigDelta.add(secp256k1.ProjectivePoint.fromAffine(this.BigDeltaShares[partyId]));
            });
            const deltaComputed = secp256k1.ProjectivePoint.BASE.multiply(Delta);
            if (!deltaComputed.equals(BigDelta)) {
                  throw new Error("computed Delta is inconsistend withBigDelta");
            }

            const deltaInv = Fn.inv(Delta);
            const BigR = secp256k1.ProjectivePoint.fromAffine(this.roundInput.Gamma).multiply(deltaInv);
            const R = BigR.toAffine().x;

            const km = Fn.mul(
                  scalarFromHash(this.roundInput.inputForRound3.inputForRound2.inputForRound1.message),
                  this.roundInput.inputForRound3.inputForRound2.KShare
            );

            const sigmaShare = Fn.add(Fn.mul(R, this.roundInput.ChiShare), km);

            const broadcasts: any = SignBroadcastForRound5.from({
                  from: this.session.selfId,
                  SigmaShare: sigmaShare,
            }).toJSON();

            this.session.currentRound = 5;
            this.output = {
                  Delta,
                  BigDelta: BigDelta.toAffine(),
                  BigR: BigR.toAffine(),
                  R,
                  inputForRound4: this.roundInput,
            };
            return {
                  broadcasts,
                  inputForRound5: this.output,
            };
      }
}
