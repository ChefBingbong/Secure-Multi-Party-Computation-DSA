import config from "../../config/config";
import { GenericKeygenRoundBroadcast } from "../../mpc/keygen/abstractRound";
import { KeygenSession } from "../../mpc/keygen/keygenSession";
import { KeygenDirectMessageForRound4JSON } from "../../mpc/keygen/types";
import { KeygenSessionManager } from "../keygenProtocol";
import { Message } from "../message/message";
import { MessageQueueArray, MessageQueueMap } from "../message/messageQueue";
import { MessageQueue } from "../types";
import ChainUtil from "./chainUtil";
import { Message as Msg } from "../types";
import { PartySecretKeyConfig } from "../../mpc/keygen/partyKey";
import Wallet from "../../wallet/wallet";

export interface WalletInfo {
      publicKey: string;
      validatorId: string;
      port: string;
}

class Validator extends Wallet {
      public keyPair: any;
      public publicKey: string;
      public ID: string;
      public nodeId: string;
      public messages: MessageQueueArray<any>;
      public directMessagesMap: MessageQueueMap<KeygenDirectMessageForRound4JSON>;
      public PartyKeyShare: PartySecretKeyConfig;

      constructor() {
            const secret = Date.now().toString();
            super(secret);
            this.ID = ChainUtil.id();
            this.keyPair = ChainUtil.genKeyPair(secret);
            this.publicKey = this.keyPair.getPublic("hex");
            this.nodeId = config.p2pPort;
            this.directMessagesMap = new MessageQueueMap([this.nodeId], 6);
            this.messages = new MessageQueueArray(1);
      }

      public getDirectMessages(
            round?: number
      ): MessageQueue<KeygenDirectMessageForRound4JSON> | KeygenDirectMessageForRound4JSON[] {
            return !round ? this.directMessagesMap.getAll() : this.directMessagesMap.getRoundValues(round);
      }

      public getMessages(round?: number): Msg<any> | any[] {
            return !round ? this.messages.getAll() : this.messages.getRoundValues(round);
      }

      public getShare(): PartySecretKeyConfig | undefined {
            return this.PartyKeyShare;
      }

      public static parseWalletInfo(templateString: string): WalletInfo | null {
            const matches = templateString.match(/publicKey: (.+?) -\s+validatorId: (.+?) -\s+port: (.+?)$/);

            if (matches) {
                  const [_, publicKey, validatorId, port] = matches;
                  return {
                        publicKey,
                        validatorId,
                        port,
                  };
            }
            return null;
      }

      public canAccept<T extends Message<GenericKeygenRoundBroadcast> | Message<KeygenDirectMessageForRound4JSON>>(
            message: T,
            session: KeygenSession,
            nodeId: string
      ): boolean {
            if (!Message.isFor<T>(nodeId, message)) {
                  console.log("MESSAGE NOT FOR YOU\n");
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

      // Used for printing the wallet details
      public toString(): string {
            return `publicKey: ${this.publicKey.toString()} -
                  validatorId: ${this.ID} -
                  port: ${config.p2pPort}`;
      }
}

export default Validator;
