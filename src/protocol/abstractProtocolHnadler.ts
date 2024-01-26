import { createHash } from "crypto";
import { Logger } from "winston";
import { AppLogger } from "../http/middleware/logger";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { PartyId } from "../mpc/keygen/partyKey";
import { SignSession } from "../mpc/signing/signSession";
import Validator from "../p2p/validators/validator";
import { Message as Msg } from "./message/message";
import { MessageQueueArray, MessageQueueMap } from "./message/messageQueue";
import { ProtocolMessageParser } from "./protocolMessageParser";
import { ServerDirectMessage, ServerMessage } from "./types";

export interface BaseProtocolHnadlerInterface {
      finalizeCurrentRound(currentRound: number): Promise<void>;
      startNewRound(): void;
      sessionRoundProcessor: (data: ServerMessage<any>) => Promise<void>;
      sessionRoundDirectMessageProcessor: (data: ServerDirectMessage<any>) => Promise<void>;
      sessionRoundVerifier: () => Promise<void>;
}

export abstract class AbstractProcolManager<Protocol extends KeygenSession | SignSession>
      extends AppLogger
      implements BaseProtocolHnadlerInterface
{
      public protocolId: string = "cmp/sign";
      public protocol: "sign" | "keygen";

      public validators: string[] = [];
      public validator: Validator;
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

      constructor(validator: Validator, protocol: "sign" | "keygen") {
            super();
            this.log = this.getLogger(`${protocol}-protocol-handler`);
            this.validator = validator;
            this.selfId = validator.nodeId;
            this.protocol = protocol;
      }

      public static updatePartyIds(updated: PartyId[]) {
            this.validators = updated;
      }

      public abstract init(threshold: number, validators: string[]): Promise<void>;
      public abstract finalizeCurrentRound(currentRound: number): Promise<void>;
      public abstract startNewRound(): void;
      public abstract sessionRoundProcessor(data: ServerMessage<any>): Promise<void>;
      public abstract sessionRoundDirectMessageProcessor(data: ServerDirectMessage<any>): Promise<void>;
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
            const previousRound = this.rounds[currentRound - 1]?.round;
            if (!previousRound?.isDirectMessageRound) return;

            this.directMessages
                  .getRoundValues(currentRound - 1)
                  .map((directMsg) => ProtocolMessageParser.fromJSOND(directMsg, this.protocol))
                  .filter((directMsg) => directMsg.to === this.selfId)
                  .forEach((directMsg) => activeRound.handleDirectMessage(directMsg));
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

      public isFinalRound(currentRound?: number): boolean {
            if (currentRound) return currentRound === this.finalRound;
            return this.currentRound === this.finalRound;
      }

      protected storePeerBroadcastResponse(
            newMessage: Msg<any> | undefined,
            round: any,
            currentRound: number,
            senderNode: string
      ) {
            if (
                  round.isBroadcastRound &&
                  newMessage &&
                  this.validator.canAccept(newMessage, this.session, this.selfId)
            ) {
                  this.messages.set(currentRound, senderNode, newMessage.Data);
            }
            return this.messages.getRoundMessagesLen(currentRound);
      }

      protected storePeerDirectMessageResponse(newDirectMessage: Msg<any>, round: any, currentRound: number) {
            if (
                  round.isDirectMessageRound &&
                  newDirectMessage &&
                  this.validator.canAccept(newDirectMessage, this.session, this.selfId)
            ) {
                  this.directMessages.set(currentRound, newDirectMessage.Data);
            }
            return this.directMessages.getNonNullValuesLength(currentRound);
      }

      protected createDirectMessage = (round: any, messageType: any[], currentRound: number): Msg<any>[] => {
            if (!round.isDirectMessageRound) return [];

            return messageType.map((msg) => {
                  return Msg.create<any>(this.selfId, msg?.to, this.session.protocolId, currentRound, msg, false);
            });
      };

      protected createBroadcastMessage = (
            round: any,
            messageType: any,
            currentRound: number
      ): Msg<any> | undefined => {
            if (!round.isBroadcastRound) return undefined;
            return Msg.create<any>(this.selfId, "", this.session.protocolId, currentRound, messageType, true);
      };

      protected receivedAll(round: any, currentRound: number): boolean {
            const isBroadcastRound = round.isBroadcastRound;
            const isDirectMessageRound = round.isDirectMessageRound;

            const roundBroadcasts = this.messages.getRoundMessagesLen(currentRound);
            const roundMessages = this.directMessages.getNonNullValuesLength(currentRound);
            const partyId = this.validators.length;

            if (isBroadcastRound && isDirectMessageRound) {
                  return roundBroadcasts === partyId && roundMessages === partyId - 1;
            }
            if (isBroadcastRound && !isDirectMessageRound) {
                  return roundBroadcasts === partyId;
            }
            if (!isBroadcastRound && isDirectMessageRound) {
                  return roundMessages === partyId - 1;
            }
            return true;
      }

      protected hashMessageData(data: any): string {
            const hash = createHash("sha256");
            hash.update(JSON.stringify(data));
            return hash.digest("hex");
      }

      protected generateBroadcastHashes<T extends MessageQueueArray<any> | MessageQueueMap<any>>(
            messages: T,
            roundNumber: number,
            roundHashes: Record<number, string>
      ): string[] {
            if (!messages) {
                  throw new Error(`round messages do not exists something went wrong.`);
            }
            const dataForRound: string[] = ["0x0"];
            for (let round = 1; round <= roundNumber; round++) {
                  if (!this.rounds[round].round.isDirectMessageRound && round !== 3) continue;

                  const currentRoundData = dataForRound.join("");
                  const currentRoundHash = this.hashMessageData(currentRoundData);

                  if (currentRoundHash !== roundHashes[round - 1]) {
                        throw new Error(`Inconsistent hash detected for the last round: ${round - 1}`);
                  }

                  messages.getRoundValues(round).forEach((messageData) => {
                        if (messageData) {
                              const hashedData = this.hashMessageData(messageData);
                              dataForRound.push(hashedData);
                        }
                  });
            }

            const currentRoundData = dataForRound.join("");
            const currentRoundHash = this.hashMessageData(currentRoundData);
            roundHashes[roundNumber] = currentRoundHash;
            return dataForRound;
      }

      protected verifyInputForNextRound = (currentRound: number): any => {
            const round = this.rounds[currentRound - 1].round;

            if (currentRound === 2 && !round.output.inputRound1) {
                  throw new Error(`Round 2 has not beeen initialised`);
            }
            if (currentRound === 3 && !round.output.inputForRound2) {
                  throw new Error(`Round 3 has not beeen initialised`);
            }
            if (currentRound === 4 && !round.output.inputForRound3) {
                  throw new Error(`Round 4 has not beeen initialised`);
            }
            if (currentRound === 5 && !round.output.inputForRound4) {
                  throw new Error(`Round 5 has not beeen initialised`);
            }
            return round.output;
      };

      protected verifyOutputForCurrentRound = (currentRound: number, roundOutput: any): any => {
            if (currentRound === 1 && !roundOutput.inputForRound2) {
                  throw new Error(`Round 1 has not beeen processed`);
            }
            if (currentRound === 2 && !roundOutput.inputForRound3) {
                  throw new Error(`Round 2 has not beeen processed`);
            }
            if (currentRound === 3 && !roundOutput.inputForRound4) {
                  throw new Error(`Round 3 has not beeen processed`);
            }
            if (currentRound === 4 && !roundOutput.inputForRound5) {
                  throw new Error(`Round 4 has not beeen processed`);
            }
            return roundOutput;
      };

      protected resetSessionState() {
            this.currentRound = 0;
            this.sessionInitialized = false;
            this.rounds = undefined;
            this.session = undefined;
            this.messages = undefined;
            this.directMessages = undefined;
      }
}
