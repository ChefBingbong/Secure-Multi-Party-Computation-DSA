import { SignSession } from "./signSession";
import { SignBroadcastForRound2, SignMessageForRound2, SignPartyInputRound2 } from "./signRound2";
import { PaillierPublicKey } from "../paillierKeyPair/paillierPublicKey.js";
import { PaillierSecretKey } from "../paillierKeyPair/paillierSecretKey.js";
import { ZkEncPrivate, ZkEncPublic, zkEncCreateProof } from "../zk/enc";
import { sampleScalar } from "../math/sample";
import { AffinePoint } from "../types";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { sampleScalarPointPair } from "../math/sample";

export type SignPartyInputRound1 = {
      publicKey: AffinePoint;
      secretEcdsa: bigint;
      secretPaillier: PaillierSecretKey;
      partiesPublic: Record<
            string,
            {
                  paillier: PaillierPublicKey;
                  pedersen: PedersenParams;
                  ecdsa: AffinePoint;
            }
      >;
      message: Uint8Array;
};

export type SignPartyOutputRound1 = {
      broadcasts: [SignBroadcastForRound2];
      messages: Array<SignMessageForRound2>;
      inputForRound2: SignPartyInputRound2;
};

export class SignerRound1 {
      public session: SignSession;
      private roundInput: SignPartyInputRound1;

      constructor(session: SignSession, roundInput: SignPartyInputRound1) {
            this.session = session;
            this.roundInput = roundInput;
      }

      public process(): SignPartyOutputRound1 {
            const [GammaShare, BigGammaShare] = sampleScalarPointPair();
            const { ciphertext: G, nonce: GNonce } =
                  this.roundInput.partiesPublic[this.session.selfId].paillier.encrypt(GammaShare);

            const KShare = sampleScalar();
            const { ciphertext: K, nonce: KNonce } =
                  this.roundInput.partiesPublic[this.session.selfId].paillier.encrypt(KShare);

            const broadcast = SignBroadcastForRound2.from({
                  from: this.session.selfId,
                  K,
                  G,
            });

            const messages: Array<SignMessageForRound2> = [];

            Object.entries(this.roundInput.partiesPublic).forEach(([partyId, partyPublic]) => {
                  // Go over other parties
                  if (partyId === this.session.selfId) {
                        return;
                  }

                  const zkPublic: ZkEncPublic = {
                        K,
                        prover: this.roundInput.partiesPublic[this.session.selfId].paillier,
                        aux: partyPublic.pedersen,
                  };
                  const zkPrivate: ZkEncPrivate = {
                        k: KShare,
                        rho: KNonce,
                  };
                  const proof = zkEncCreateProof(
                        zkPublic,
                        zkPrivate,
                        this.session.cloneHashForId(this.session.selfId)
                  );
                  const message = SignMessageForRound2.from({
                        from: this.session.selfId,
                        to: partyId,
                        proofEnc: proof,
                  });
                  messages.push(message);
            });

            this.session.currentRound = "round2";

            return {
                  broadcasts: [broadcast],
                  messages,
                  inputForRound2: {
                        inputForRound1: this.roundInput,
                        K,
                        G,
                        BigGammaShare,
                        GammaShare,
                        KShare,
                        KNonce,
                        GNonce,
                  },
            };
      }
}
