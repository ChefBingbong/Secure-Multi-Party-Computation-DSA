import { PartyId } from "../../keygen/partyKey";
import {
      SignBroadcastForRound2JSON,
      SignBroadcastForRound3JSON,
      SignBroadcastForRound4JSON,
      SignBroadcastForRound5JSON,
} from "../types";
import {
      SignBroadcastForRound2,
      SignBroadcastForRound3,
      SignBroadcastForRound4,
      SignBroadcastForRound5,
} from "./broadcasts";

export abstract class AbstractSignBroadcast {
      public readonly from: PartyId;
      public readonly type: number;

      constructor(from: PartyId, type: number) {
            this.from = from;
            this.type = type;
      }

      public toJSON():
            | SignBroadcastForRound2JSON
            | SignBroadcastForRound3JSON
            | SignBroadcastForRound4JSON
            | SignBroadcastForRound5JSON {
            throw new Error("toJSON method must be implemented in derived classes");
      }

      public static fromJSON(
            json:
                  | SignBroadcastForRound2JSON
                  | SignBroadcastForRound3JSON
                  | SignBroadcastForRound4JSON
                  | SignBroadcastForRound5JSON
      ): AbstractSignBroadcast {
            switch (json.type) {
                  case 2:
                        return SignBroadcastForRound2.fromJSON(json as SignBroadcastForRound2JSON);
                  case 3:
                        return SignBroadcastForRound3.fromJSON(json as SignBroadcastForRound3JSON);
                  case 4:
                        return SignBroadcastForRound4.fromJSON(json as SignBroadcastForRound4JSON);
                  case 5:
                        return SignBroadcastForRound5.fromJSON(json as SignBroadcastForRound5JSON);
                  default:
                        throw new Error("Invalid round type");
            }
      }
}
