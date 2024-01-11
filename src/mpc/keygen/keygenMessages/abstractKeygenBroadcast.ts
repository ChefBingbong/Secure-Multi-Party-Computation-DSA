import { PartyId } from "../partyKey";
import {
      KeygenBroadcastForRound2JSON,
      KeygenBroadcastForRound3JSON,
      KeygenBroadcastForRound4JSON,
      KeygenBroadcastForRound5JSON,
} from "../types";
import {
      KeygenBroadcastForRound2,
      KeygenBroadcastForRound3,
      KeygenBroadcastForRound4,
      KeygenBroadcastForRound5,
} from "./broadcasts";

export class AbstractKeygenBroadcast {
      public readonly from: PartyId;
      public readonly type: number;

      constructor(from: PartyId, type: number) {
            this.from = from;
            this.type = type;
      }

      public toJSON():
            | KeygenBroadcastForRound2JSON
            | KeygenBroadcastForRound3JSON
            | KeygenBroadcastForRound4JSON
            | KeygenBroadcastForRound5JSON {
            throw new Error("toJSON method must be implemented in derived classes");
      }

      public static fromJSON(
            json:
                  | KeygenBroadcastForRound2JSON
                  | KeygenBroadcastForRound3JSON
                  | KeygenBroadcastForRound4JSON
                  | KeygenBroadcastForRound5JSON
      ): AbstractKeygenBroadcast {
            switch (json.type) {
                  case 2:
                        return KeygenBroadcastForRound2.fromJSON(json as KeygenBroadcastForRound2JSON);
                  case 3:
                        return KeygenBroadcastForRound3.fromJSON(json as KeygenBroadcastForRound3JSON);
                  case 4:
                        return KeygenBroadcastForRound4.fromJSON(json as KeygenBroadcastForRound4JSON);
                  case 5:
                        return KeygenBroadcastForRound5.fromJSON(json as KeygenBroadcastForRound5JSON);
                  default:
                        throw new Error("Invalid round type");
            }
      }
}
