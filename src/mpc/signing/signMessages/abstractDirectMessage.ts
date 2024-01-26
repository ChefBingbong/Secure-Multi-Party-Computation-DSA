import { PartyId } from "../../keygen/partyKey";
import { SignMessageForRound2JSON, SignMessageForRound3JSON, SignMessageForRound4JSON } from "../types";
import { SignMessageForRound2, SignMessageForRound3, SignMessageForRound4 } from "./directMessages";

export class AbstractSignDirectMessage {
      public static fromJSON(
            json: SignMessageForRound2JSON | SignMessageForRound3JSON | SignMessageForRound4JSON
      ): AbstractSignDirectMessage {
            switch (json.type) {
                  case 2:
                        return SignMessageForRound2.fromJSON(json as SignMessageForRound2JSON);
                  case 3:
                        return SignMessageForRound3.fromJSON(json as SignMessageForRound3JSON);
                  case 4:
                        return SignMessageForRound4.fromJSON(json as SignMessageForRound4JSON);
                  default:
                        throw new Error("Invalid round type");
            }
      }
}
