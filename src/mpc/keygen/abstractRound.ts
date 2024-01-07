import { Exponent } from "../math/polynomial/exponent";
import { Polynomial } from "../math/polynomial/polynomial";
import { sampleScalar } from "../math/sample";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { PaillierPublicKey } from "../paillierKeyPair/paillierPublicKey";
import { PaillierSecretKey } from "../paillierKeyPair/paillierSecretKey";
import { AffinePoint } from "../types";
import { Hasher } from "../utils/hasher";
import { ZkSchCommitment, ZkSchRandomness } from "../zk/zksch";
import { KeygenSession } from "./keygenSession";
import { PartyId, PartySecretKeyConfig } from "./partyKey";
import { KeygenInputForRound4 } from "./round4";
import { KeygenInputForRound1, KeygenInputForRound2, KeygenInputForRound3 } from "./types";

export interface BaseKeygenRound<O, B, D> {
      output: any;
      isBroadcastRound: boolean;
      isDirectMessageRound: boolean;
      handleBroadcastMessage(bmsg: B): void;
      handleDirectMessage(dmsg: D): void;
      fromJSON(json: any): B;
      fromJSOND(json: any): D;
      process(): Promise<O>;
}

export type SessionConfig = {
      selfId: PartyId;
      partyIds: Array<PartyId>;
      threshold: number;
      precomputedPaillierPrimes?: {
            p: bigint;
            q: bigint;
      };
};

export abstract class AbstractKeygenRound<I, O, B, D> implements BaseKeygenRound<O, B, D> {
      public currentRound = 0;
      public curve = "secp256k1";
      public finalRound: number = 5;
      public partyIds: Array<PartyId>;
      public protocolId = "cmp/sign";
      public selfId: PartyId;
      public threshold: number;
      public hasher: Hasher;
      public ssid: Hasher;

      public inputForRound1: KeygenInputForRound1;

      private precomputedPaillierPrimes?: {
            p: bigint;
            q: bigint;
      };
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;
      protected session: KeygenSession | undefined;
      protected input: I | undefined;
      public output: Partial<{
            vssSecret: Polynomial;
            precomputedPaillierPrimes: {
                  p: bigint;
                  q: bigint;
            };
            previousSecretECDSA: null;
            previousPublicSharesECDSA: null;
            previousChainKey: null;
            inputForRound1: KeygenInputForRound1;
            inputForRound3: KeygenInputForRound3;
            RIDs: Record<PartyId, bigint>;
            ChainKeys: Record<PartyId, bigint>;
            PaillierPublic: Record<PartyId, PaillierPublicKey>;
            Pedersen: Record<PartyId, PedersenParams>;
            vssPolynomials: Record<PartyId, Exponent>;
            SchnorrCommitments: Record<PartyId, ZkSchCommitment>;
            ElGamalPublic: Record<PartyId, AffinePoint>;
            inputRound1: KeygenInputForRound1;
            selfVSSpolynomial: Exponent;
            selfCommitment: Uint8Array;
            selfRID: bigint;
            chainKey: bigint;
            selfShare: bigint;
            elGamalPublic: AffinePoint;
            selfPaillierPublic: PaillierPublicKey;
            selfPedersenPublic: PedersenParams;
            elGamalSecret: bigint;
            paillierSecret: PaillierSecretKey;
            pedersenSecret: bigint;
            schnorrRand: ZkSchRandomness;
            decommitment: Uint8Array;
            inputForRound2: KeygenInputForRound2;
            commitments: Record<PartyId, Uint8Array>;
            inputForRound4: KeygenInputForRound4;
            UpdatedConfig: PartySecretKeyConfig;
      }>;

      public abstract handleBroadcastMessage(bmsg: B): void;
      public abstract handleDirectMessage(dmsg: D): void;
      public abstract process(): Promise<O>;
      public abstract fromJSON(json: any): B;
      public abstract fromJSOND(json: any): D;

      constructor({
            isBroadcastRound,
            isDriectMessageRound,
      }: {
            isBroadcastRound: boolean;
            isDriectMessageRound: boolean;
      }) {
            this.isBroadcastRound = isBroadcastRound;
            this.isDirectMessageRound = isDriectMessageRound;
      }

      public init({
            session,
            input,
            sessionConfig,
      }: {
            session?: KeygenSession;
            input?: I;
            sessionConfig?: SessionConfig;
      }): void {
            if (!sessionConfig) {
                  this.session = session;
                  this.input = input;
            } else {
                  this.partyIds = sessionConfig.partyIds;
                  this.selfId = sessionConfig.selfId;
                  this.threshold = sessionConfig.threshold;
                  this.precomputedPaillierPrimes = sessionConfig.precomputedPaillierPrimes;

                  this.hasher = Hasher.create().update("CMP-BLAKE");
                  this.hasher.update(this.protocolId);
                  this.hasher.update(this.curve);
                  this.hasher.update(BigInt(this.threshold));
                  this.ssid = this.cloneHashForId(this.selfId);

                  for (let partyId of this.partyIds) {
                        this.hasher.update(partyId);
                  }

                  // set up for vss polynomial share generation. these are used for assigning shares
                  // or random polynomial between all parties
                  const vssConstant = sampleScalar();
                  const vssSecret = Polynomial.new(this.threshold, vssConstant);

                  this.output = {
                        vssSecret,
                        precomputedPaillierPrimes: this.precomputedPaillierPrimes,

                        // TODO: these are for refresh? not implemented yet
                        previousSecretECDSA: null,
                        previousPublicSharesECDSA: null,
                        previousChainKey: null,
                  };
                  // this.session = this;
            }
      }

      public getProperties(): {
            session: KeygenSession;
            input: I;
      } {
            if (!this.session || !this.input) {
                  throw new Error("Properties not initialized");
            }

            return {
                  session: this.session,
                  input: this.input,
            };
      }

      public cloneHashForId(id: PartyId): Hasher {
            return this.hasher.clone().update(id);
      }
}
