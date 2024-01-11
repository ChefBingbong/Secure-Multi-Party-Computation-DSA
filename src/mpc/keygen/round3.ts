import { Exponent } from "../math/polynomial/exponent";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { paillierValidateN } from "../paillierKeyPair/paillierCryptoUtils";
import { PaillierPublicKey } from "../paillierKeyPair/paillierPublicKey";
import { AffinePoint } from "../types";
import { Hasher } from "../utils/hasher";
import { ZkFacPrivate, ZkFacPublic, zkFacCreateProof } from "../zk/fac";
import { ZkModPrivate, ZkModPublic, zkModCreateProof } from "../zk/mod";
import { ZkPrmPrivate, ZkPrmPublic, zkPrmCreateProof } from "../zk/prm";
import { ZkSchCommitment } from "../zk/zksch";
import { AbstractKeygenRound } from "./abstractRound";
import { KeygenBroadcastForRound3, KeygenBroadcastForRound4 } from "./keygenMessages/broadcasts";
import { KeygenDirectMessageForRound4 } from "./keygenMessages/directMessages";
import { PartyId, partyIdToScalar } from "./partyKey";
import {
      KeygenRound3Output,
      KeygenBroadcastForRound4JSON,
      KeygenDirectMessageForRound4JSON,
      KeygenInputForRound4,
} from "./types";

export class KeygenRound3 extends AbstractKeygenRound {
      private RIDs: Record<PartyId, bigint> = {};
      private ChainKeys: Record<PartyId, bigint> = {};
      private PaillierPublic: Record<PartyId, PaillierPublicKey> = {};
      private Pedersen: Record<PartyId, PedersenParams> = {};
      private vssPolynomials: Record<PartyId, Exponent> = {};
      private SchnorrCommitments: Record<PartyId, ZkSchCommitment> = {};
      private ElGamalPublic: Record<PartyId, AffinePoint> = {};
      public output: KeygenInputForRound4;

      constructor() {
            super({ isBroadcastRound: true, isDriectMessageRound: true, currentRound: 3 });
      }

      public handleDirectMessage(bmsg: any): void {}

      public handleBroadcastMessage(bmsg: KeygenBroadcastForRound3): void {
            const from = bmsg.from;

            // TODO: check inputs

            Hasher.validateCommitment(bmsg.decommitment);

            const vssSecret = this.input.inputForRound2.inputRound1.vssSecret;
            const vssPolynomial = bmsg.vssPolynomial;
            if ((vssSecret.constant() === 0n) !== vssPolynomial.isConstant) {
                  throw new Error(`vss polynomial has incorrect constant from ${from}`);
            }
            if (vssPolynomial.degree() !== this.session.threshold) {
                  throw new Error(
                        `vss polynomial has incorrect degree ${vssPolynomial.degree()} for threshold ${
                              this.session.threshold
                        } from ${from}`
                  );
            }

            paillierValidateN(bmsg.pedersenPublic.n);

            bmsg.pedersenPublic.validate();

            const decomValid = this.session
                  .cloneHashForId(from)
                  .decommit(this.input.commitments[from], bmsg.decommitment, [
                        bmsg.RID,
                        bmsg.C,
                        vssPolynomial,
                        bmsg.schnorrCommitment.C,
                        bmsg.elGamalPublic,
                        bmsg.pedersenPublic,
                  ]);
            if (!decomValid) {
                  throw new Error(`failed to decommit from ${from}`);
            }

            this.RIDs[from] = bmsg.RID;
            this.ChainKeys[from] = bmsg.C;
            this.PaillierPublic[from] = new PaillierPublicKey(bmsg.pedersenPublic.n);
            this.Pedersen[from] = bmsg.pedersenPublic;
            this.vssPolynomials[from] = vssPolynomial;
            this.SchnorrCommitments[from] = bmsg.schnorrCommitment;
            this.ElGamalPublic[from] = bmsg.elGamalPublic;
      }

      public async process(): Promise<KeygenRound3Output> {
            let chainKey: bigint | null = this.input.inputForRound2.inputRound1.previousChainKey;
            if (chainKey === null) {
                  chainKey = 0n;
                  for (const j of this.session.partyIds) {
                        chainKey = chainKey ^ this.ChainKeys[j]; // XOR
                  }
            }

            let rid = 0n;
            for (const j of this.session.partyIds) {
                  rid = rid ^ this.RIDs[j]; // XOR
            }

            const hashWithRidAndPartyId = this.session.hasher.clone().updateMulti([rid, this.session.selfId]);

            const modPriv: ZkModPrivate = {
                  P: this.input.inputForRound2.paillierSecret.p,
                  Q: this.input.inputForRound2.paillierSecret.q,
                  Phi: this.input.inputForRound2.paillierSecret.phi,
            };
            const modPub: ZkModPublic = {
                  N: this.PaillierPublic[this.session.selfId].n,
            };
            const modProof = zkModCreateProof(modPriv, modPub, hashWithRidAndPartyId.clone());

            const prmPriv: ZkPrmPrivate = {
                  Lambda: this.input.inputForRound2.pedersenSecret,
                  Phi: this.input.inputForRound2.paillierSecret.phi,
                  P: this.input.inputForRound2.paillierSecret.p,
                  Q: this.input.inputForRound2.paillierSecret.q,
            };
            const prmPub: ZkPrmPublic = {
                  Aux: this.Pedersen[this.session.selfId],
            };
            const prmProof = zkPrmCreateProof(prmPriv, prmPub, hashWithRidAndPartyId.clone());

            const broadcasts: KeygenBroadcastForRound4JSON = new KeygenBroadcastForRound4(
                  this.session.selfId,
                  modProof,
                  prmProof
            ).toJSON();

            const directMessages: Array<KeygenDirectMessageForRound4JSON> = [];
            this.session.partyIds.forEach((j) => {
                  if (j === this.session.selfId) {
                        return;
                  }
                  // for other PartyIds:

                  const facPriv: ZkFacPrivate = {
                        P: this.input.inputForRound2.paillierSecret.p,
                        Q: this.input.inputForRound2.paillierSecret.q,
                  };
                  const facPub: ZkFacPublic = {
                        N: this.PaillierPublic[this.session.selfId].n,
                        Aux: this.Pedersen[j],
                  };
                  const facProof = zkFacCreateProof(facPriv, facPub, hashWithRidAndPartyId.clone());

                  const { vssSecret } = this.input.inputForRound2.inputRound1;
                  const share = vssSecret.evaluate(partyIdToScalar(j));
                  const { ciphertext: C } = this.PaillierPublic[j].encrypt(share);

                  directMessages.push(
                        KeygenDirectMessageForRound4.from({
                              from: this.session.selfId,
                              to: j,
                              share: C,
                              facProof,
                        }).toJSON()
                  );
            });

            this.session.hasher.update(rid);
            this.output = {
                  inputForRound3: this.input,
                  RID: rid,
                  ChainKey: chainKey,
                  PedersenPublic: this.Pedersen,
                  PaillierPublic: this.PaillierPublic,
                  vssPolynomials: this.vssPolynomials,
                  ElGamalPublic: this.ElGamalPublic,
                  SchnorrCommitments: this.SchnorrCommitments,
            };
            return {
                  broadcasts,
                  directMessages,
                  inputForRound4: this.output,
            };
      }
}
