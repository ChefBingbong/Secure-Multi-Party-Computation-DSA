import { Hasher } from "../utils/hasher";
import { PartyId } from "../keyConfig";
import { Polynomial } from "../polynomial/polynomial";
import { sampleScalar } from "../sample";
import { KeygenInputForRound1 } from "./types";

export class KeygenSession {
      public currentRound = "round1";
      public curve = "secp256k1";
      public finalRound = "round5";
      public partyIds: Array<PartyId>;
      public protocolId = "cmp/sign";
      public selfId: PartyId;
      public threshold: number;
      public hasher: Hasher;

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

      public cloneHashForId(id: PartyId): Hasher {
            return this.hasher.clone().update(id);
      }
}
