import { Logger } from "winston";
import { AppLogger } from "../http/middleware/logger";
import { Message as Msg } from "./message/message";
import { MessageQueueArray, MessageQueueMap } from "./message/messageQueue";
import { ProtocolMessageParser } from "./protocolMessageParser";
import { ServerDirectMessage, ServerMessage, SessionState } from "./types";
import Validator from "./validators/validator";

export interface BaseProtocolHnadlerInterface<Protocol> {
      // startNewSession(): boolean;
      finalizeCurrentRound(currentRound: number): Promise<void>;
      startNewRound(): void;
      sessionRoundProcessor: (data: ServerMessage<any>) => Promise<void>;
      sessionRoundDirectMessageProcessor: (data: ServerDirectMessage) => Promise<void>;
      sessionRoundVerifier: () => Promise<void>;
}
export abstract class AbstractProcolManager<Protocol>
      extends AppLogger
      implements BaseProtocolHnadlerInterface<Protocol>
{
      // public sessionInitialized: boolean | undefined;

      protected validators: string[] = [];
      protected selfId: string;
      public validator: Validator;
      public protocolId: string = "cmp/sign";
      public protocol: "sign" | "keygen";

      public sessionInitialized: boolean | undefined;
      public threshold: number | undefined;
      public finalRound: number = 5;
      public currentRound: number = 0;

      protected session: Protocol | undefined;
      protected rounds: any;

      protected directMessages: MessageQueueArray<any>;
      protected messages: MessageQueueMap<any>;
      public log: Logger;

      // initiate new session and all rounds
      constructor(protocol: "sign" | "keygen") {
            super();
            this.protocol = protocol;
      }

      public abstract init(threshold: number, validator: Validator, validators: string[]): Promise<void>;
      // public abstract startNewSession(): boolean;
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
                  .map((broadcast) => ProtocolMessageParser.fromJSONB(broadcast as any, this.protocol))
                  .forEach((broadcast) => activeRound.handleBroadcastMessage(broadcast));
      }

      protected validateRoundDirectMessages(activeRound: any, currentRound: number) {
            const previousRound = this.rounds[currentRound]?.round;
            if (!previousRound?.isDirectMessageRound) return;

            this.directMessages
                  .getRoundValues(currentRound - 1)
                  .map((directMsg) => ProtocolMessageParser.fromJSOND(directMsg, this.protocol))
                  .filter((directMsg: any) => directMsg.to === this.selfId)
                  .forEach((directMsg) => activeRound.handleDirectMessage(directMsg));
      }

      protected createDirectMessage = (round: any, messageType: any[], currentRound: number): Msg<any>[] => {
            if (!round.isDirectMessageRound) return [];

            return messageType.map((msg) => {
                  return Msg.create<any>(this.selfId, msg?.to, this.protocolId, currentRound, msg, false);
            });
      };

      protected createBroadcastMessage = (
            round: any,
            messageType: any,
            currentRound: number
      ): Msg<any> | undefined => {
            if (!round.isBroadcastRound) return undefined;
            return Msg.create<any>(this.selfId, "", this.protocolId, currentRound, messageType, true);
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
                  this.validator.canAccept(newMessage, this.session as any, this.selfId)
            ) {
                  this.messages.set(currentRound, senderNode, newMessage.Data);
            }
            return this.messages.getRoundMessagesLen(currentRound);
      }

      protected storePeerDirectMessageResponse(newDirectMessage: Msg<any>, round: any, currentRound: number) {
            console.log("madeee ittt");

            if (
                  round.isDirectMessageRound &&
                  newDirectMessage &&
                  this.validator.canAccept(newDirectMessage, this.session as any, this.selfId)
            ) {
                  console.log("madeee ittt");
                  this.directMessages.set(currentRound, newDirectMessage.Data);
            }
            return this.directMessages.getNonNullValuesLength(currentRound);
      }

      public getCurrentState(): SessionState<any> {
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
