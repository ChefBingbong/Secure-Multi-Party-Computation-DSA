import { secp256k1 } from "@noble/curves/secp256k1";
import { PartyId } from "../keygen/partyKey";
import { isIdentity, pointFromJSON, pointToJSON, scalarFromHash } from "../math/curve";
import Fn from "../math/polynomial/Fn";
import { AffinePoint } from "../types";
import { ZkLogstarProof, ZkLogstarPublic, zkLogstarVerifyProof } from "../zk/logstar";
import { SignBroadcastForRound5 } from "./signRound5";
import { SignSession } from "./signSession";
import {
      SignBroadcastForRound4JSON,
      SignInputForRound4,
      SignMessageForRound4JSON,
      SignPartyOutputRound4,
} from "./types";
import { SignMessageForRound4 } from "./signMessages/directMessages";
import { AbstractSignRound } from "./abstractSignRound";

export class SignBroadcastForRound4 {
      public readonly from: PartyId;
      public readonly DeltaShare: bigint;
      public readonly BigDeltaShare: AffinePoint;

      private constructor(from: PartyId, DeltaShare: bigint, BigDeltaShare: AffinePoint) {
            this.from = from;
            this.DeltaShare = DeltaShare;
            this.BigDeltaShare = BigDeltaShare;
      }

      public static from({
            from,
            DeltaShare,
            BigDeltaShare,
      }: {
            from: PartyId;
            DeltaShare: bigint;
            BigDeltaShare: AffinePoint;
      }): SignBroadcastForRound4 {
            const bmsg = new SignBroadcastForRound4(from, DeltaShare, BigDeltaShare);
            Object.freeze(bmsg);
            return bmsg;
      }

      public static fromJSON({
            from,
            DeltaShareHex,
            BigDeltaShare,
      }: SignBroadcastForRound4JSON): SignBroadcastForRound4 {
            const DeltaShare = BigInt(`0x${DeltaShareHex}`);
            const bmsg = new SignBroadcastForRound4(from, DeltaShare, pointFromJSON(BigDeltaShare));
            Object.freeze(bmsg);
            return bmsg;
      }

      public toJSON(): SignBroadcastForRound4JSON {
            return {
                  from: this.from,
                  DeltaShareHex: this.DeltaShare.toString(16),
                  BigDeltaShare: pointToJSON(this.BigDeltaShare),
            };
      }
}

export class SignerRound4 extends AbstractSignRound {
      public session: SignSession;
      private roundInput: SignInputForRound4;
      public output: any;

      private DeltaShares: Record<PartyId, bigint> = {};
      private BigDeltaShares: Record<PartyId, AffinePoint> = {};

      public currentRound: number;
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;

      constructor() {
            super({ isBroadcastRound: true, isDriectMessageRound: false, currentRound: 4 });
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

      public async process(): Promise<SignPartyOutputRound4> {
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

            this.session.currentRound = "round5";
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
