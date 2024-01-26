import { PartyId } from "../../keygen/partyKey";
import { pointFromJSON, pointToJSON } from "../../math/curve";
import { AffinePoint } from "../../types";
import {
      SignBroadcastForRound2JSON,
      SignBroadcastForRound3JSON,
      SignBroadcastForRound4JSON,
      SignBroadcastForRound5JSON,
} from "../types";
import { AbstractSignBroadcast } from "./abstractSignBroadcast";

export class SignBroadcastForRound2 {
      public readonly from: PartyId;
      public readonly K: bigint; // Paillier ciphertext
      public readonly G: bigint; // Paillier ciphertext
      public readonly type: 2;

      private constructor(from: PartyId, K: bigint, G: bigint) {
            this.from = from;
            this.type = 2;
            this.K = K;
            this.G = G;
      }

      public static from({ from, K, G }: { from: PartyId; K: bigint; G: bigint }): SignBroadcastForRound2 {
            const bmsg = new SignBroadcastForRound2(from, K, G);
            Object.freeze(bmsg);
            return bmsg;
      }

      public static fromJSON(json: SignBroadcastForRound2JSON): SignBroadcastForRound2 {
            return SignBroadcastForRound2.from({
                  from: json.from as PartyId,
                  K: BigInt(`0x${json.Khex}`),
                  G: BigInt(`0x${json.Ghex}`),
            });
      }

      public toJSON(): SignBroadcastForRound2JSON {
            return {
                  from: this.from,
                  Khex: this.K.toString(16),
                  Ghex: this.G.toString(16),
                  type: 2,
            };
      }
}
export class SignBroadcastForRound3 {
      public readonly type: 3;
      public readonly from: PartyId;
      public readonly BigGammaShare: AffinePoint;

      public constructor(from: PartyId, BigGammaShare: AffinePoint) {
            this.from = from;
            this.type = 3;
            this.BigGammaShare = BigGammaShare;
      }

      public static from({
            from,
            BigGammaShare,
      }: {
            from: PartyId;
            BigGammaShare: AffinePoint;
      }): SignBroadcastForRound3 {
            const bmsg = new SignBroadcastForRound3(from, BigGammaShare);
            Object.freeze(bmsg);
            return bmsg;
      }

      public static fromJSON(json: SignBroadcastForRound3JSON): SignBroadcastForRound3 {
            return SignBroadcastForRound3.from({
                  from: json.from as PartyId,
                  BigGammaShare: pointFromJSON(json.BigGammaShare),
            });
      }

      public toJSON(): SignBroadcastForRound3JSON {
            return {
                  from: this.from,
                  BigGammaShare: pointToJSON(this.BigGammaShare),
                  type: 3,
            };
      }
}

export class SignBroadcastForRound4 {
      public readonly type: 4;
      public readonly from: PartyId;
      public readonly DeltaShare: bigint;
      public readonly BigDeltaShare: AffinePoint;

      private constructor(from: PartyId, DeltaShare: bigint, BigDeltaShare: AffinePoint) {
            this.from = from;
            this.type = 4;
            this.DeltaShare = DeltaShare;
            this.BigDeltaShare = BigDeltaShare;
      }

      public static from({
            from,
            DeltaShare,
            BigDeltaShare,
      }: {
            from: PartyId;
            DeltaShare: bigint;
            BigDeltaShare: AffinePoint;
      }): SignBroadcastForRound4 {
            const bmsg = new SignBroadcastForRound4(from, DeltaShare, BigDeltaShare);
            Object.freeze(bmsg);
            return bmsg;
      }

      public static fromJSON({
            from,
            DeltaShareHex,
            BigDeltaShare,
      }: SignBroadcastForRound4JSON): SignBroadcastForRound4 {
            const DeltaShare = BigInt(`0x${DeltaShareHex}`);
            const bmsg = new SignBroadcastForRound4(from, DeltaShare, pointFromJSON(BigDeltaShare));
            Object.freeze(bmsg);
            return bmsg;
      }

      public toJSON(): SignBroadcastForRound4JSON {
            return {
                  from: this.from,
                  DeltaShareHex: this.DeltaShare.toString(16),
                  BigDeltaShare: pointToJSON(this.BigDeltaShare),
                  type: 4,
            };
      }
}

export class SignBroadcastForRound5 {
      public readonly type: 5;
      public readonly from: PartyId;
      public readonly SigmaShare: bigint;

      private constructor(from: PartyId, SigmaShare: bigint) {
            this.from = from;
            this.type = 5;
            this.SigmaShare = SigmaShare;
      }

      public static from({ from, SigmaShare }: { from: PartyId; SigmaShare: bigint }): SignBroadcastForRound5 {
            const bmsg = new SignBroadcastForRound5(from, SigmaShare);
            Object.freeze(bmsg);
            return bmsg;
      }

      public static fromJSON({ from, SigmaShareHex }: SignBroadcastForRound5JSON): SignBroadcastForRound5 {
            const SigmaShare = BigInt(`0x${SigmaShareHex}`);
            const bmsg = new SignBroadcastForRound5(from, SigmaShare);
            Object.freeze(bmsg);
            return bmsg;
      }

      public toJSON(): SignBroadcastForRound5JSON {
            return {
                  from: this.from,
                  SigmaShareHex: this.SigmaShare.toString(16),
                  type: 5,
            };
      }
}
