import { secp256k1 } from "@noble/curves/secp256k1";

import Fn from "../math/polynomial/Fn";
import { Exponent } from "../math/polynomial/exponent";
import { ZkFacPublic, zkFacVerifyProof } from "../zk/fac";
import { ZkModPublic, zkModVerifyProof } from "../zk/mod";
import { ZkPrmPublic, zkPrmVerifyProof } from "../zk/prm";
import { zkSchProve } from "../zk/zksch";
import { AbstractKeygenRound } from "./abstractRound";
import { KeygenBroadcastForRound4, KeygenBroadcastForRound5 } from "./keygenMessages/broadcasts";
import { KeygenDirectMessageForRound4 } from "./keygenMessages/directMessages";
import { PartyId, PartyPublicKeyConfig, PartySecretKeyConfig, partyIdToScalar } from "./partyKey";
import { KeygenBroadcastForRound5JSON, KeygenInputForRound5, KeygenRound4Output } from "./types";

export class KeygenRound4 extends AbstractKeygenRound {
      private ShareReceived: Record<PartyId, bigint> = {};
      public output: KeygenInputForRound5;

      constructor() {
            super({ isBroadcastRound: true, isDriectMessageRound: false, currentRound: 4 });
      }

      public handleBroadcastMessage(bmsg: KeygenBroadcastForRound4) {
            const { from, modProof, prmProof } = bmsg;

            const modPub: ZkModPublic = {
                  N: this.input.PedersenPublic[from].n,
            };
            const modVerified = zkModVerifyProof(modProof, modPub, this.session.cloneHashForId(from));
            if (!modVerified) {
                  throw new Error(`failed to validate mod proof from ${from}`);
            }

            const prmPub: ZkPrmPublic = {
                  Aux: this.input.PedersenPublic[from],
            };
            const prmVerified = zkPrmVerifyProof(prmProof, prmPub, this.session.cloneHashForId(from));
            if (!prmVerified) {
                  throw new Error(`failed to validate prm proof from ${from}`);
            }
      }

      public handleDirectMessage(dmsg: KeygenDirectMessageForRound4) {
            const { from, to, share, facProof } = dmsg;

            // verify
            if (to !== this.session.selfId) {
                  throw new Error(`received direct message for ${to} but I am ${this.session.selfId}`);
            }

            if (!this.input.PaillierPublic[to].validateCiphertext(share)) {
                  throw new Error(`invalid ciphertext from ${from}`);
            }

            const facPub: ZkFacPublic = {
                  N: this.input.PaillierPublic[from].n,
                  Aux: this.input.PedersenPublic[to],
            };
            const facVerified = zkFacVerifyProof(facProof, facPub, this.session.cloneHashForId(from));
            if (!facVerified) {
                  throw new Error(`failed to validate fac proof from ${from}`);
            }

            // store
            const DecryptedShare = this.input.inputForRound3.inputForRound2.paillierSecret.decrypt(share);
            const Share = Fn.mod(DecryptedShare);
            console.log(Share, DecryptedShare);
            if (Share !== DecryptedShare) {
                  throw new Error(`decrypted share is not in correct range`);
            }

            const ExpectedPublicShare = this.input.vssPolynomials[from].evaluate(
                  partyIdToScalar(this.session.selfId)
            );
            const PublicShare = secp256k1.ProjectivePoint.BASE.multiply(Share);
            if (!secp256k1.ProjectivePoint.fromAffine(ExpectedPublicShare).equals(PublicShare)) {
                  throw new Error(`${to} failed to validate VSS share from ${from}`);
            }

            this.ShareReceived[from] = Share;
      }

      public async process(): Promise<KeygenRound4Output> {
            this.ShareReceived[this.session.selfId] = this.input.inputForRound3.inputForRound2.selfShare;
            let UpdatedSecretECDSA = 0n;
            if (this.input.inputForRound3.inputForRound2.inputRound1.previousSecretECDSA) {
                  // TODO: on refresh
                  throw new Error("not implemented");
            }
            for (const j of this.session.partyIds) {
                  UpdatedSecretECDSA = Fn.add(UpdatedSecretECDSA, this.ShareReceived[j]);
            }

            const ShamirPublicPolynomials: Exponent[] = [];
            for (const j of this.session.partyIds) {
                  ShamirPublicPolynomials.push(this.input.vssPolynomials[j]);
            }

            const ShamirPublicPolynomial = Exponent.sum(ShamirPublicPolynomials);

            const PublicData: Record<PartyId, PartyPublicKeyConfig> = {};
            for (const j of this.session.partyIds) {
                  const PublicECDSAShare = ShamirPublicPolynomial.evaluate(partyIdToScalar(j));
                  if (this.input.inputForRound3.inputForRound2.inputRound1.previousPublicSharesECDSA) {
                        // TODO: on refresh
                        throw new Error("not implemented");
                  }
                  PublicData[j] = PartyPublicKeyConfig.from({
                        partyId: j,
                        ecdsa: PublicECDSAShare,
                        elgamal: this.input.ElGamalPublic[j],
                        paillier: this.input.PaillierPublic[j],
                        pedersen: this.input.PedersenPublic[j],
                  });
            }

            const UpdatedConfig = PartySecretKeyConfig.from({
                  curve: "secp256k1",
                  partyId: this.session.selfId,
                  threshold: this.session.threshold,
                  ecdsa: UpdatedSecretECDSA,
                  elgamal: this.input.inputForRound3.inputForRound2.elGamalSecret,
                  paillier: this.input.inputForRound3.inputForRound2.paillierSecret,
                  rid: this.input.RID,
                  chainKey: this.input.ChainKey,
                  publicPartyData: PublicData,
            });

            const hashTmp = this.session.hasher.clone().updateMulti([UpdatedConfig, this.session.selfId]);

            const proof = zkSchProve(
                  this.input.inputForRound3.inputForRound2.schnorrRand,
                  hashTmp.clone(),
                  PublicData[this.session.selfId].ecdsa,
                  UpdatedSecretECDSA
            );
            if (!proof) {
                  throw new Error(`failed to create schnorr proof`);
            }

            const broadcasts: KeygenBroadcastForRound5JSON = new KeygenBroadcastForRound5(
                  this.session.selfId,
                  proof
            ).toJSON();

            this.session.hasher.updateMulti([UpdatedConfig]);

            this.output = {
                  inputForRound4: this.input,
                  UpdatedConfig,
            };
            return {
                  broadcasts,
                  inputForRound5: this.output,
            };
      }
}
