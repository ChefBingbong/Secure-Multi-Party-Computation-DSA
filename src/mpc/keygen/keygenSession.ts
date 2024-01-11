import { Polynomial } from "../math/polynomial/polynomial";
import { sampleScalar } from "../math/sample";
import { Hasher } from "../utils/hasher";
import { AbstractKeygenRound } from "./abstractRound";
import { PartyId } from "./partyKey";
import { KeygenInputForRound1, SessionConfig } from "./types";

export class KeygenSession extends AbstractKeygenRound {
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

      constructor() {
            super({ isBroadcastRound: false, isDriectMessageRound: false, currentRound: 0 });
      }

      init({ sessionConfig }: { sessionConfig?: SessionConfig }) {
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
      }

      public fromJSON(json: any): void {}
      public fromJSOND(json: any): void {}
      public handleBroadcastMessage(bmsg: any): void {}
      public handleDirectMessage(bmsg: any): void {}
      public async process(): Promise<any> {}

      public cloneHashForId(id: PartyId): Hasher {
            return this.hasher.clone().update(id);
      }
}
