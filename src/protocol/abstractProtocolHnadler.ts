import { Logger } from "winston";
import { AppLogger } from "../http/middleware/logger";
import { Message as Msg } from "./message/message";
import { MessageQueueArray, MessageQueueMap } from "./message/messageQueue";
import { app } from ".";
import { AbstractKeygenBroadcast } from "../mpc/keygen/keygenMessages/abstractKeygenBroadcast";
import { KeygenDirectMessageForRound4 } from "../mpc/keygen/keygenMessages/directMessages";
import P2pServer from "../p2p/server";
import { ServerDirectMessage, ServerMessage } from "./types";
import Validator from "./validators/validator";
import { PartyId } from "../mpc/keygen/partyKey";

export interface BaseProtocolHnadlerInterface {
      finalizeCurrentRound(currentRound: number): Promise<void>;
      startNewRound(): void;
      sessionRoundProcessor: (data: ServerMessage<any>) => Promise<void>;
      sessionRoundDirectMessageProcessor: (data: ServerDirectMessage) => Promise<void>;
      sessionRoundVerifier: () => Promise<void>;
}

export abstract class AbstractProcolManager<Protocol> extends AppLogger implements BaseProtocolHnadlerInterface {
      public protocolId: string = "cmp/sign";
      public protocol: "sign" | "keygen";

      public selfId: PartyId;
      public sessionInitialized: boolean | undefined;
      public threshold: number | undefined;
      public finalRound: number = 5;
      public currentRound: number = 0;

      protected static validators: string[] = [];
      protected session: Protocol | undefined;
      protected rounds: any;

      protected directMessages: MessageQueueArray<any>;
      protected messages: MessageQueueMap<any>;
      public log: Logger;

      constructor(protocol: "sign" | "keygen") {
            super();
            this.protocol = protocol;
      }

      public static updatePartyIds(updated: PartyId[]) {
            this.validators = updated;
      }

      public abstract init(selfId: PartyId): Promise<void>;
      public abstract finalizeCurrentRound(currentRound: number): Promise<void>;
      public abstract startNewRound(): void;
      public abstract sessionRoundProcessor(data: ServerMessage<any>): Promise<void>;
      public abstract sessionRoundDirectMessageProcessor(data: ServerDirectMessage): Promise<void>;
      public abstract sessionRoundVerifier(): Promise<void>;

      protected validateRoundBroadcasts(activeRound: any, currentRound: number) {
            const previousRound = this.rounds[currentRound - 1]?.round;
            if (!previousRound?.isBroadcastRound) return;

            this.messages
                  .getRoundValues(currentRound - 1)
                  .map((broadcast) => AbstractKeygenBroadcast.fromJSON(broadcast as any))
                  .forEach((broadcast) => activeRound.handleBroadcastMessage(broadcast));
      }

      protected validateRoundDirectMessages(activeRound: any, currentRound: number) {
            const previousRound = this.rounds[currentRound]?.round;
            if (!previousRound?.isDirectMessageRound) return;

            this.directMessages
                  .getRoundValues(currentRound - 1)
                  .map((directMsg) => KeygenDirectMessageForRound4.fromJSON(directMsg))
                  .filter((directMsg: any) => directMsg.to === app.p2pServer.NODE_ID)
                  .forEach((directMsg) => activeRound.handleDirectMessage(directMsg));
      }

      protected createDirectMessage = (round: any, messageType: any[], currentRound: number): Msg<any>[] => {
            if (!round.isDirectMessageRound) return [];

            return messageType.map((msg) => {
                  return Msg.create<any>(
                        app.p2pServer.NODE_ID,
                        msg?.to,
                        this.protocolId,
                        currentRound,
                        msg,
                        false
                  );
            });
      };

      protected createBroadcastMessage = (
            round: any,
            messageType: any,
            currentRound: number
      ): Msg<any> | undefined => {
            if (!round.isBroadcastRound) return undefined;
            return Msg.create<any>(app.p2pServer.NODE_ID, "", this.protocolId, currentRound, messageType, true);
      };

      protected storePeerBroadcastResponse(
            newMessage: Msg<any> | undefined,
            round: any,
            currentRound: number,
            senderNode: string
      ) {
            if (
                  round.isBroadcastRound &&
                  newMessage &&
                  app.p2pServer.validator.canAccept(newMessage, this.session as any, app.p2pServer.NODE_ID)
            ) {
                  console.log("yupp");
                  this.messages.set(currentRound, senderNode, newMessage.Data);
            }
            return this.messages.getRoundMessagesLen(currentRound);
      }

      protected storePeerDirectMessageResponse(newDirectMessage: Msg<any>, round: any, currentRound: number) {
            if (
                  round.isDirectMessageRound &&
                  newDirectMessage &&
                  app.p2pServer.validator.canAccept(newDirectMessage, this.session as any, app.p2pServer.NODE_ID)
            ) {
                  this.directMessages.set(currentRound, newDirectMessage.Data);
            }
            return this.directMessages.getNonNullValuesLength(currentRound);
      }

      public getCurrentState(): any {
            const currentRound = this.currentRound;
            const roundState = this.rounds[currentRound];
            const session = this.session;
            return {
                  currentRound,
                  roundState,
                  round: roundState.round,
                  session,
            };
      }
}
