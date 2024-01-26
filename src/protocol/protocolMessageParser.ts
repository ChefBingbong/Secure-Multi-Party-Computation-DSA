import { AbstractKeygenBroadcast } from "../mpc/keygen/keygenMessages/abstractKeygenBroadcast";
import { AbstractKeygenDirectMessage } from "../mpc/keygen/keygenMessages/abstractKeygenDirectMessage";
import {
      KeygenBroadcastForRound2JSON,
      KeygenBroadcastForRound3JSON,
      KeygenBroadcastForRound4JSON,
      KeygenBroadcastForRound5JSON,
      KeygenDirectMessageForRound4JSON,
} from "../mpc/keygen/types";
import { AbstractSignDirectMessage } from "../mpc/signing/signMessages/abstractDirectMessage";
import { AbstractSignBroadcast } from "../mpc/signing/signMessages/abstractSignBroadcast";
import {
      SignBroadcastForRound2JSON,
      SignBroadcastForRound3JSON,
      SignBroadcastForRound4JSON,
      SignBroadcastForRound5JSON,
      SignMessageForRound2JSON,
      SignMessageForRound3JSON,
      SignMessageForRound4JSON,
} from "../mpc/signing/types";

export type BroadcastSignReturn =
      | SignBroadcastForRound2JSON
      | SignBroadcastForRound3JSON
      | SignBroadcastForRound4JSON
      | SignBroadcastForRound5JSON;

export type BroadcastKeygenReturn =
      | KeygenBroadcastForRound2JSON
      | KeygenBroadcastForRound3JSON
      | KeygenBroadcastForRound4JSON
      | KeygenBroadcastForRound5JSON;

export type DirectMessageSignReturnType =
      | SignMessageForRound2JSON
      | SignMessageForRound3JSON
      | SignMessageForRound4JSON;
export type DirectMessageKeygenReturnType = KeygenDirectMessageForRound4JSON;

export type ProtoclBroadcastReturnType = BroadcastSignReturn | BroadcastKeygenReturn;
export type ProtoclDirectMessageReturnType = DirectMessageSignReturnType | DirectMessageKeygenReturnType;

export class ProtocolMessageParser {
      public static fromJSONB(
            json: ProtoclBroadcastReturnType,
            protocol: "keygen" | "sign"
      ): ProtoclBroadcastReturnType {
            switch (protocol) {
                  case "keygen":
                        return AbstractKeygenBroadcast.fromJSON(
                              json as BroadcastKeygenReturn
                        ) as unknown as BroadcastKeygenReturn;
                  case "sign":
                        return AbstractSignBroadcast.fromJSON(json as BroadcastSignReturn) as BroadcastSignReturn;
                  default:
                        throw new Error("Invalid round parser broadcast type");
            }
      }

      public static fromJSOND(
            json: ProtoclDirectMessageReturnType,
            protocol: "keygen" | "sign"
      ): ProtoclDirectMessageReturnType {
            switch (protocol) {
                  case "keygen":
                        return AbstractKeygenDirectMessage.fromJSON(
                              json as DirectMessageKeygenReturnType
                        ) as ProtoclDirectMessageReturnType;
                  case "sign":
                        return AbstractSignDirectMessage.fromJSON(
                              json as DirectMessageSignReturnType
                        ) as DirectMessageSignReturnType;
                  default:
                        throw new Error("Invalid round parser direct message type");
            }
      }
}
