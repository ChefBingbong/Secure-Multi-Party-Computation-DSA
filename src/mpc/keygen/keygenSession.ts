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
            const precomputedPaillierPrimesA = {
                  p: 140656066935617068498146945231934875455216373658357415502745428687235261656648638287551719750772170167072660618746434922467026175316328679021082239834872641463481202598538804109033672325604594242999482643715131298123781048438272500363100287151576822437239577277536933950267625817888142008490020035657029276407n,
                  q: 175437726479818986625224700860380920063101111865374554740519436736586455912956005968158447930382949780886369408190562582756101804782170061689786605035300744632482593570950291647513234434906219657068892385520913477200820946242503153623041776816739567937245171318575515185901118752529992399233786355959816486303n,
            };
            this.partyIds = sessionConfig.partyIds;
            this.selfId = sessionConfig.selfId;
            this.threshold = sessionConfig.threshold;
            this.precomputedPaillierPrimes = precomputedPaillierPrimesA;

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

      public handleBroadcastMessage(bmsg: any): void {}
      public handleDirectMessage(bmsg: any): void {}
      public async process(): Promise<any> {}

      public cloneHashForId(id: PartyId): Hasher {
            return this.hasher.clone().update(id);
      }
}
