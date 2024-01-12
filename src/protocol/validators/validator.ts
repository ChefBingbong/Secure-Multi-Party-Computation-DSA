import config from "../../config/config";
import { GenericKeygenRoundBroadcast } from "../../mpc/keygen/abstractRound";
import { KeygenSession } from "../../mpc/keygen/keygenSession";
import { KeygenDirectMessageForRound4JSON } from "../../mpc/keygen/types";
import { Message } from "../message/message";
import ChainUtil from "./chainUtil";

class Validator {
      private keyPair: any;
      private publicKey: string;
      public ID: string;
      public nodeId: string;

      constructor() {
            this.ID = ChainUtil.id();
            this.keyPair = ChainUtil.genKeyPair(this.ID);
            this.publicKey = this.keyPair.getPublic("hex");
            this.nodeId = config.p2pPort;
      }

      // Used for printing the wallet details
      toString(): string {
            return `Wallet - 
            publicKey: ${this.publicKey.toString()} -
            validatorId: ${this.ID}
            port: ${config.p2pPort}`;
      }

      sign(dataHash: string): string {
            return this.keyPair.sign(dataHash).toHex();
      }

      getPublicKey(): string {
            return this.publicKey;
      }

      public canAccept<T extends Message<GenericKeygenRoundBroadcast> | Message<KeygenDirectMessageForRound4JSON>>(
            message: T,
            session: KeygenSession,
            nodeId: string
      ): boolean {
            if (!Message.isFor<T>(nodeId, message)) {
                  console.log("messagwe not for you");
                  return false;
            }

            if (session.protocolId !== message.Protocol) {
                  console.log("protocol does not match");
                  return false;
            }

            if (!session.partyIds.includes(message.From)) {
                  console.log("partyids dont include from");
                  return false;
            }

            if (!message.Data) {
                  console.log("no msg data");
                  return false;
            }

            if (session.finalRound < message.RoundNumber) {
                  return false;
            }
            return true;
      }
}

export default Validator;
