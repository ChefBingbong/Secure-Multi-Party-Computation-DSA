import { otherPartyIds, PartyId } from "../keygen/partyKey";
import { ZkEncPublic, zkEncVerifyProof } from "../zk/enc";
import { zkLogstarCreateProof, ZkLogstarPrivate, ZkLogstarPublic } from "../zk/logstar";
import { mtaProveAffG } from "../zk/mta";
import { SignBroadcastForRound2, SignBroadcastForRound3 } from "./signMessages/broadcasts";
import { SignMessageForRound2, SignMessageForRound3 } from "./signMessages/directMessages";
import { SignSession } from "./signSession";
import { SignPartyInputRound2, SignPartyOutputRound2 } from "./types.js";

export class SignerRound2 {
      public session: SignSession;
      private roundInput: SignPartyInputRound2;
      public output: any;

      private K: Record<PartyId, bigint> = {};
      private G: Record<PartyId, bigint> = {};

      public currentRound: number;
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;

      constructor() {
            this.isBroadcastRound = true;
            this.isDirectMessageRound = true;
            this.currentRound = 2;
      }

      public init({ session, input }: { session?: SignSession; input?: any }): void {
            this.session = session;
            this.roundInput = input;
      }

      public handleBroadcastMessage(bmsg: SignBroadcastForRound2): void {
            const paillierFrom = this.roundInput.inputForRound1.partiesPublic[bmsg.from].paillier;
            const cipherTextsValid =
                  paillierFrom.validateCiphertext(bmsg.K) && paillierFrom.validateCiphertext(bmsg.G);
            if (!cipherTextsValid) {
                  throw new Error(`Invalid ciphertexts from party ${bmsg.from}`);
            }
            this.K[bmsg.from] = bmsg.K;
            this.G[bmsg.from] = bmsg.G;
      }

      public handleDirectMessage(msg: SignMessageForRound2): void {
            if (msg.to !== this.session.selfId) {
                  throw new Error(`Received message for party ${msg.to} but I am party ${this.session.selfId}`);
            }
            if (msg.from === this.session.selfId) {
                  throw new Error(`Received message from myself`);
            }

            const { proofEnc: proof } = msg;
            const pub: ZkEncPublic = {
                  K: this.K[msg.from],
                  prover: this.roundInput.inputForRound1.partiesPublic[msg.from].paillier,
                  aux: this.roundInput.inputForRound1.partiesPublic[msg.to].pedersen,
            };
            const verified = zkEncVerifyProof(proof, pub, this.session.cloneHashForId(msg.from));

            if (!verified) {
                  throw new Error(`Invalid proof from party ${msg.from}`);
            }
      }

      public process(): SignPartyOutputRound2 {
            // TODO: check if all parties have sent their messages

            const broadcasts: any = SignBroadcastForRound3.from({
                  from: this.session.selfId,
                  BigGammaShare: this.roundInput.BigGammaShare,
            }).toJSON();

            const messages: Array<any> = [];

            const otherIds = otherPartyIds(this.session.partyIds, this.session.selfId);
            const pubData = this.roundInput.inputForRound1.partiesPublic;
            const mtaOuts = otherIds.map((partyId) => {
                  const {
                        Beta: DeltaBeta,
                        D: DeltaD,
                        F: DeltaF,
                        proof: DeltaProof,
                  } = mtaProveAffG(
                        this.roundInput.GammaShare,
                        this.roundInput.BigGammaShare,
                        this.K[partyId],
                        this.roundInput.inputForRound1.secretPaillier,
                        pubData[partyId].paillier,
                        pubData[partyId].pedersen,
                        this.session.cloneHashForId(this.session.selfId)
                  );

                  const {
                        Beta: ChiBeta,
                        D: ChiD,
                        F: ChiF,
                        proof: ChiProof,
                  } = mtaProveAffG(
                        this.roundInput.inputForRound1.secretEcdsa,
                        pubData[this.session.selfId].ecdsa,
                        this.K[partyId],
                        this.roundInput.inputForRound1.secretPaillier,
                        pubData[partyId].paillier,
                        pubData[partyId].pedersen,
                        this.session.cloneHashForId(this.session.selfId)
                  );

                  const pub: ZkLogstarPublic = {
                        C: this.G[this.session.selfId],
                        X: this.roundInput.BigGammaShare,
                        prover: this.roundInput.inputForRound1.secretPaillier.publicKey,
                        aux: pubData[partyId].pedersen,
                  };
                  const priv: ZkLogstarPrivate = {
                        X: this.roundInput.GammaShare,
                        Rho: this.roundInput.GNonce,
                  };
                  const proof = zkLogstarCreateProof(pub, priv, this.session.cloneHashForId(this.session.selfId));

                  messages.push(
                        SignMessageForRound3.from({
                              from: this.session.selfId,
                              to: partyId,
                              ChiD,
                              ChiF,
                              ChiProof,
                              DeltaD,
                              DeltaF,
                              DeltaProof,
                              ProofLog: proof,
                        }).toJSON()
                  );

                  return { DeltaBeta, ChiBeta, partyId };
            });

            const DeltaShareBetas: Record<PartyId, bigint> = {};
            const ChiShareBetas: Record<PartyId, bigint> = {};
            mtaOuts.forEach(({ DeltaBeta, ChiBeta, partyId }) => {
                  DeltaShareBetas[partyId] = DeltaBeta;
                  ChiShareBetas[partyId] = ChiBeta;
            });

            this.output = {
                  DeltaShareBetas,
                  ChiShareBetas,
                  K: this.K,
                  G: this.G,
                  inputForRound2: this.roundInput,
            };
            const roundOutput: SignPartyOutputRound2 = {
                  broadcasts,
                  messages,
                  inputForRound3: {
                        DeltaShareBetas,
                        ChiShareBetas,
                        K: this.K,
                        G: this.G,
                        inputForRound2: this.roundInput,
                  },
            };

            this.session.currentRound = 3;

            return roundOutput;
      }
}
