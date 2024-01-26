import { KeygenDirectMessageForRound4JSON } from "../types";
import { KeygenDirectMessageForRound4 } from "./directMessages";

export class AbstractKeygenDirectMessage {
      public static fromJSON(json: KeygenDirectMessageForRound4JSON): AbstractKeygenDirectMessage {
            switch (json.type) {
                  case 4:
                        return KeygenDirectMessageForRound4.fromJSON(json as KeygenDirectMessageForRound4JSON);
                  default:
                        throw new Error("Invalid round type");
            }
      }
}
