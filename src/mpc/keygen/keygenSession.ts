import { Hasher } from "../utils/hasher";
import { PartyId } from "./partyKey";
import { Polynomial } from "../math/polynomial/polynomial";
import { sampleScalar } from "../math/sample";
import { KeygenInputForRound1 } from "./types";
import { Helper, Info } from "../../protocol/helper/helper";

export class KeygenSession {
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

      constructor(
            selfId: PartyId,
            partyIds: Array<PartyId>,
            threshold: number,
            precomputedPaillierPrimes?: {
                  p: bigint;
                  q: bigint;
            }
      ) {
            this.partyIds = partyIds;
            this.selfId = selfId;
            this.threshold = threshold;
            this.precomputedPaillierPrimes = precomputedPaillierPrimes;

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

            this.inputForRound1 = {
                  vssSecret,
                  precomputedPaillierPrimes: this.precomputedPaillierPrimes,

                  // TODO: these are for refresh? not implemented yet
                  previousSecretECDSA: null,
                  previousPublicSharesECDSA: null,
                  previousChainKey: null,
            };
      }

      public start = async () => {
            for (let partyId of this.partyIds) {
                  this.hasher.update(partyId);
            }

            // set up for vss polynomial share generation. these are used for assigning shares
            // or random polynomial between all parties
            const vssConstant = sampleScalar();
            const vssSecret = Polynomial.new(this.threshold, vssConstant);

            const info: Info = {
                  ProtocolID: this.protocolId,
                  FinalRoundNumber: this.finalRound,
                  SelfID: this.selfId,
                  PartyIDs: this.partyIds,
                  Threshold: this.threshold,
                  hash: this.hasher,
            };

            const helper = new Helper(info);

            return (this.inputForRound1 = {
                  vssSecret,
                  helper,
                  precomputedPaillierPrimes: this.precomputedPaillierPrimes,

                  // TODO: these are for refresh? not implemented yet
                  previousSecretECDSA: null,
                  previousPublicSharesECDSA: null,
                  previousChainKey: null,
            });
      };

      public cloneHashForId(id: PartyId): Hasher {
            return this.hasher.clone().update(id);
      }
}
