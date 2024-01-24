import { secp256k1 } from "@noble/curves/secp256k1";
import { PartyId, otherPartyIds } from "../keygen/partyKey";
import { isIdentity, pointFromJSON, pointToJSON } from "../math/curve";
import Fn from "../math/polynomial/Fn";
import { AffinePoint } from "../types";
import { ZkAffgProof, ZkAffgPublic, zkAffgVerifyProof } from "../zk/affg";
import {
      ZkLogstarPrivate,
      ZkLogstarProof,
      ZkLogstarPublic,
      zkLogstarCreateProof,
      zkLogstarVerifyProof,
} from "../zk/logstar";
import { SignBroadcastForRound4 } from "./signMessages/broadcasts";
import { SignSession } from "./signSession";
import {
      SignBroadcastForRound3JSON,
      SignInputForRound3,
      SignMessageForRound3JSON,
      SignPartyOutputRound3,
} from "./types";
import { SignMessageForRound3, SignMessageForRound4 } from "./signMessages/directMessages";
import { AbstractSignRound } from "./abstractSignRound";
import { SignBroadcastForRound3 } from "./signMessages/broadcasts";

export class SignerRound3 extends AbstractSignRound {
      public session: SignSession;
      private roundInput: SignInputForRound3;
      public output: any;

      private BigGammaShare: Record<PartyId, AffinePoint> = {};
      private DeltaShareAlpha: Record<PartyId, bigint> = {};
      private ChiShareAlpha: Record<PartyId, bigint> = {};

      public currentRound: number;
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;

      constructor() {
            super({ isBroadcastRound: true, isDriectMessageRound: true, currentRound: 3 });
      }
      public init({ session, input }: { session?: SignSession; input?: any }): void {
            this.session = session;
            this.roundInput = input;
      }

      public handleBroadcastMessage(bmsg: SignBroadcastForRound3): void {
            const point = secp256k1.ProjectivePoint.fromAffine(bmsg.BigGammaShare);
            if (isIdentity(point)) {
                  throw new Error("BigGammaShare is identity");
            }
            this.BigGammaShare[bmsg.from] = bmsg.BigGammaShare;
      }

      public handleDirectMessage(msg: SignMessageForRound3): void {
            if (msg.to !== this.session.selfId) {
                  throw new Error(`Message intended for ${msg.to} but received by ${this.session.selfId}`);
            }

            // TODO: deal with this mess (via session? or denormalize)
            const pubData = this.roundInput.inputForRound2.inputForRound1.partiesPublic;

            const deltaAffgPub: ZkAffgPublic = {
                  Kv: this.roundInput.K[msg.to],
                  Dv: msg.DeltaD,
                  Fp: msg.DeltaF,
                  Xp: this.BigGammaShare[msg.from],
                  prover: pubData[msg.from].paillier,
                  verifier: pubData[msg.to].paillier,
                  aux: pubData[msg.to].pedersen,
            };
            const deltaVerified = zkAffgVerifyProof(
                  msg.DeltaProof,
                  deltaAffgPub,
                  this.session.cloneHashForId(msg.from)
            );
            if (!deltaVerified) {
                  throw new Error(`Failed to validate affg proof for Delta MtA from ${msg.from}`);
            }

            const chiAffgPub: ZkAffgPublic = {
                  Kv: this.roundInput.K[msg.to],
                  Dv: msg.ChiD,
                  Fp: msg.ChiF,
                  Xp: pubData[msg.from].ecdsa,
                  prover: pubData[msg.from].paillier,
                  verifier: pubData[msg.to].paillier,
                  aux: pubData[msg.to].pedersen,
            };
            const chiVerified = zkAffgVerifyProof(msg.ChiProof, chiAffgPub, this.session.cloneHashForId(msg.from));
            if (!chiVerified) {
                  throw new Error(`Failed to validate affg proof for Chi MtA from ${msg.from}`);
            }

            const logPub: ZkLogstarPublic = {
                  C: this.roundInput.G[msg.from],
                  X: this.BigGammaShare[msg.from],
                  prover: pubData[msg.from].paillier,
                  aux: pubData[msg.to].pedersen,
            };
            const logVerified = zkLogstarVerifyProof(msg.ProofLog, logPub, this.session.cloneHashForId(msg.from));
            if (!logVerified) {
                  throw new Error(`Failed to validate log proof from ${msg.from}`);
            }

            // Store the verified values (TODO: split into separate function?)
            // TODO: handle decryption errors locally
            const DeltaShareAlpha = this.roundInput.inputForRound2.inputForRound1.secretPaillier.decrypt(
                  msg.DeltaD
            );
            const ChiShareAlpha = this.roundInput.inputForRound2.inputForRound1.secretPaillier.decrypt(msg.ChiD);
            this.DeltaShareAlpha[msg.from] = DeltaShareAlpha;
            this.ChiShareAlpha[msg.from] = ChiShareAlpha;
      }

      public async process(): Promise<SignPartyOutputRound3> {
            let Gamma = secp256k1.ProjectivePoint.ZERO;
            Object.values(this.BigGammaShare).forEach((afPoint) => {
                  const point = secp256k1.ProjectivePoint.fromAffine(afPoint);
                  Gamma = Gamma.add(point);
            });

            const BigDeltaShare = Gamma.multiply(this.roundInput.inputForRound2.KShare);

            let DeltaShare = this.roundInput.inputForRound2.GammaShare * this.roundInput.inputForRound2.KShare;

            let ChiShare =
                  this.roundInput.inputForRound2.inputForRound1.secretEcdsa *
                  this.roundInput.inputForRound2.KShare;

            const otherIds = otherPartyIds(this.session.partyIds, this.session.selfId);
            otherIds.forEach((partyId) => {
                  DeltaShare = DeltaShare + this.DeltaShareAlpha[partyId];
                  DeltaShare = DeltaShare + this.roundInput.DeltaShareBetas[partyId];
                  ChiShare = ChiShare + this.ChiShareAlpha[partyId];
                  ChiShare = ChiShare + this.roundInput.ChiShareBetas[partyId];
            });

            const priv: ZkLogstarPrivate = {
                  X: this.roundInput.inputForRound2.KShare,
                  Rho: this.roundInput.inputForRound2.KNonce,
            };

            const DeltaShareScalar = Fn.mod(DeltaShare);
            const broadcasts: any = SignBroadcastForRound4.from({
                  from: this.session.selfId,
                  DeltaShare: DeltaShareScalar,
                  BigDeltaShare: BigDeltaShare.toAffine(),
            }).toJSON();

            const messages: Array<any> = [];
            const pubData = this.roundInput.inputForRound2.inputForRound1.partiesPublic;
            otherIds.forEach((partyId) => {
                  const pub: ZkLogstarPublic = {
                        C: this.roundInput.K[this.session.selfId],
                        X: BigDeltaShare.toAffine(),
                        G: Gamma.toAffine(),
                        prover: pubData[this.session.selfId].paillier,
                        aux: pubData[partyId].pedersen,
                  };
                  const proof = zkLogstarCreateProof(pub, priv, this.session.cloneHashForId(this.session.selfId));
                  messages.push(
                        SignMessageForRound4.from({
                              from: this.session.selfId,
                              to: partyId,
                              ProofLog: proof,
                        }).toJSON()
                  );
            });

            this.session.currentRound = "round4";
            this.output = {
                  DeltaShare,
                  BigDeltaShare,
                  Gamma: Gamma.toAffine(),
                  ChiShare: Fn.mod(ChiShare),
                  inputForRound3: this.roundInput,
            };
            return {
                  broadcasts,
                  messages,
                  inputForRound4: this.output,
            };
      }
}
