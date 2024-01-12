import { ZkFacProof } from "../../zk/fac";
import { PartyId } from "../partyKey";
import { KeygenDirectMessageForRound4JSON } from "../types";

export class KeygenDirectMessageForRound4 {
      public readonly from: PartyId;
      public readonly to: PartyId;
      public readonly share: bigint;
      public readonly facProof: ZkFacProof;

      private constructor(from: PartyId, to: PartyId, share: bigint, facProof: ZkFacProof) {
            this.from = from;
            this.to = to;
            this.share = share;
            this.facProof = facProof;
      }

      public static from({
            from,
            to,
            share,
            facProof,
      }: {
            from: PartyId;
            to: PartyId;
            share: bigint;
            facProof: ZkFacProof;
      }): KeygenDirectMessageForRound4 {
            const d = new KeygenDirectMessageForRound4(from, to, share, facProof);
            Object.freeze(d);
            return d;
      }

      public toJSON(): KeygenDirectMessageForRound4JSON {
            return {
                  from: this.from,
                  to: this.to,
                  shareHex: this.share.toString(16),
                  facProof: this.facProof.toJSON(),
            };
      }

      public static fromJSON(json: KeygenDirectMessageForRound4JSON): KeygenDirectMessageForRound4 {
            const { from, to, shareHex, facProof } = json;
            return KeygenDirectMessageForRound4.from({
                  from,
                  to,
                  share: BigInt(`0x${shareHex}`),
                  facProof: ZkFacProof.fromJSON(facProof),
            });
      }
}
