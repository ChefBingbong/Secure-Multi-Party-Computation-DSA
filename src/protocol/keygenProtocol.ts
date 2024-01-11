import assert from "assert";
import config from "../config/config";
import { AllKeyGenRounds } from "../mpc/keygen";
import { AbstractKeygenRound, SessionConfig } from "../mpc/keygen/abstractRound";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { Hasher } from "../mpc/utils/hasher";
import { ServerMessage, delay } from "../p2p/server";
import { Message as Msg } from "./message/message";

type Session = {
      session: KeygenSession;
      initialized: boolean;
      roundResponses: RoundResponse;
      finished: boolean;
};

export type Round = {
      round: AbstractKeygenRound<any, any, any, any>;
      initialized: boolean;
      roundResponses: RoundResponse;
      finished: boolean;
};
type Rounds = { [x: number]: Round };
type Message = { [round: number]: any };
type RoundResponse = { peer: { [id: string]: boolean }; number: number };

export class KeygenSessionManager {
      public static sessionComplete: boolean | undefined;
      public static isInitialized: boolean | undefined;
      public static threshold: number | undefined;
      public static validators: string[] = [];
      public static finalRound: number = 5;
      public static currentRound: number = 0;
      public static previousRound: number | undefined;
      public static session: Session | undefined;
      public static rounds: Rounds | undefined;

      public static messages: Message;
      public static directMessages: Message;
      public static proofs: Array<bigint> = [];

      constructor(threshold: number, validators: string[]) {
            KeygenSessionManager.threshold = threshold;
            KeygenSessionManager.validators = validators;
      }

      public static startNewSession(sessionConfig: SessionConfig): void {
            if (this.isInitialized) return;
            if (this.sessionComplete) this.resetSessionState();

            this.messages = this.messageQueue(this.finalRound + 1);
            this.directMessages = this.messageQueue(this.finalRound + 1);

            this.rounds = Object.values(AllKeyGenRounds).reduce((accumulator, round, i) => {
                  accumulator[i] = {
                        round,
                        initialized: false,
                        roundResponses: { peer: {}, number: 0 },
                        finished: false,
                  };
                  return accumulator;
            }, {} as Record<number, Round>);

            this.isInitialized = true;
            this.sessionComplete = false;

            this.rounds[0].round.init({ sessionConfig });
      }

      public static initNewRound(): Round {
            if (this.sessionComplete || !this.isInitialized) return;

            const input = this.rounds[this.previousRound].round.output;
            const round = this.rounds[this.currentRound].round;

            round.init({ session: this.rounds[0].round, input });
            this.rounds[this.currentRound] = {
                  round,
                  initialized: false,
                  roundResponses: { peer: {}, number: 0 },
                  finished: false,
            };
            return this.rounds[this.currentRound];
      }

      public static keygenRoundProcessor = async (
            data: ServerMessage,
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void,
            sendDirect: (destination: string, message: any, id?: string, origin?: string, ttl?: number) => void
      ) => {
            const { broadcasts, directMessages, proof } = data.data;
            const { round, roundState, currentRound } = this.getCurrentState();

            if (round.isBroadcastRound && broadcasts?.Data && data.senderNode !== config.p2pPort) {
                  this.messages[currentRound].push(broadcasts?.Data[0]);
            }
            if (round.isDirectMessageRound && this.canAccept(directMessages, config.p2pPort)) {
                  this.directMessages[currentRound] = [
                        ...this.directMessages[currentRound],
                        ...directMessages?.Data,
                  ];
            }

            if (proof) this.verifyProof(proof);
            else if (round.isBroadcastRound && round.isDirectMessageRound) {
                  if (
                        this.messages[currentRound].length === 6 &&
                        this.directMessages[currentRound].length === 25
                  ) {
                        await this.processRound(broadcast);
                  }
            } else {
                  if (this.messages[currentRound].length === 6) {
                        await this.processRound(broadcast);
                  }
            }
            console.log(this.directMessages[currentRound].length);
      };

      public static keygenRoundVerifier = async (
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void
      ) => {
            try {
                  const { round, roundState, currentRound } = this.getCurrentState();
                  roundState.initialized = true;
                  const roundResponses = roundState.roundResponses;

                  if (this.threshold < 3 || roundState.finished) {
                        throw new Error(`need 3 peers to start keygen`);
                  }

                  this.validateRoundBroadcasts();
                  this.validateRoundDirectMessages(config.p2pPort);

                  const roundOutput = await round.process();
                  console.log(roundOutput);

                  roundResponses.peer[config.p2pPort] = true;

                  const broadcasts = this.createMessage(round, roundOutput?.broadcasts, currentRound);
                  const directMessages = this.createMessage(round, roundOutput?.directMessages, currentRound);
                  const proof = this.getProofForOptions(currentRound, roundOutput);

                  if (round.isBroadcastRound)
                        this.messages[currentRound].push(roundOutput?.broadcasts[0].toJSON());

                  broadcast({
                        message: `${config.p2pPort}'s round${currentRound} input ${roundOutput}`,
                        type: "keygenRoundHandler",
                        senderNode: config.p2pPort,
                        data: { broadcasts, directMessages, proof },
                  });
            } catch (err) {
                  console.log(err);
            }
      };

      private static resetSessionState() {
            this.sessionComplete = false;
            this.currentRound = 0;
            this.isInitialized = true;
      }

      public static async processRound(
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void
      ) {
            this.previousRound = this.currentRound;
            this.currentRound += 1;
            this.initNewRound();
            await delay(500);
            await this.keygenRoundVerifier(broadcast);
      }

      public static getCurrentState(): {
            currentRound: number;
            roundState: Round;
            round: AbstractKeygenRound<any, any, any, any>;
            messages: any;
            directMessages: any;
      } {
            const currentRound = this.currentRound;
            const roundState = this.rounds[currentRound];
            const messages = this.messages[currentRound === 0 ? 0 : currentRound - 1];
            const directMessages = this.directMessages[currentRound === 0 ? 0 : currentRound - 1];
            return {
                  currentRound,
                  roundState,
                  round: roundState.round,
                  messages,
                  directMessages,
            };
      }

      public static validateRoundBroadcasts() {
            const activeRound = this.rounds[this.currentRound]?.round;
            const previousRound = this.rounds[this.currentRound - 1]?.round;

            if (!previousRound?.isBroadcastRound) return;

            const messages = this.messages[this.currentRound - 1];
            return messages
                  .map((b) => activeRound.fromJSON(b))
                  .forEach((b) => activeRound.handleBroadcastMessage(b));
      }

      public static validateRoundDirectMessages(selfId: string) {
            const activeRound = this.rounds[this.currentRound]?.round;
            const previousRound = this.rounds[this.currentRound - 1]?.round;

            if (!previousRound?.isDirectMessageRound) return;

            const directMessages = this.directMessages[this.currentRound - 1];
            return directMessages
                  .map((b: any) => activeRound.fromJSOND(b))
                  .filter((m) => m.to === selfId)
                  .forEach((b) => activeRound.handleDirectMessage(b));
      }

      public static messageQueue(rounds: number): { [round: number]: any[] } {
            const q: { [round: number]: any[] } = {};
            for (let i = 0; i <= rounds; i++) {
                  q[i] = [];
            }
            return q;
      }

      public static getProofForOptions(currentRound: number, inputForNextRound: any) {
            switch (currentRound) {
                  case 5:
                        return Hasher.create().update(inputForNextRound.UpdatedConfig).digestBigint().toString();
                  default:
                        return undefined;
            }
      }

      public static updateRoundMessages(newMessages: any, r: any) {
            this.messages[r] = [...this.messages[r], ...newMessages];
      }

      public static updateRoundDirectMessages(newDirectMessages: any, r: any) {
            this.directMessages[r] = [...this.directMessages[r], ...newDirectMessages];
      }

      private static receivedAll(round: Round, currentRound: number): boolean {
            const isBroadcastRound = round.round.isBroadcastRound;
            const isDirectMessageRound = round.round.isDirectMessageRound;

            const roundBroadcasts = this.messages[currentRound].length;
            const roundMessages = this.directMessages[currentRound].length;
            const partyId = this.validators.length;

            if (isBroadcastRound && isDirectMessageRound) {
                  return roundBroadcasts === partyId && roundMessages === partyId;
            }
            if (isBroadcastRound && !isDirectMessageRound) {
                  return roundBroadcasts === partyId;
            }
            if (!isBroadcastRound && isDirectMessageRound) {
                  return roundMessages === partyId;
            }
            return true;
      }

      public static canAccept(message: any, selfID: string): boolean {
            if (!Msg.isFor(selfID, message)) {
                  console.log("messagwe not for you");
                  return false;
            }

            if (this.rounds[0].round.protocolId !== message.Protocol) {
                  console.log("protocol does not match");

                  return false;
            }

            if (!this.rounds[0].round.partyIds.includes(message.From)) {
                  console.log("partyids dont include from");
                  return false;
            }

            if (!message.Data) {
                  console.log("no msg data");
                  return false;
            }

            if (this.rounds[0].round.finalRound < message.RoundNumber) {
                  return false;
            }

            return true;
      }

      public static createMessage = (
            round: AbstractKeygenRound<any, any, any, any>,
            messageType: any,
            currentRound: number
      ) => {
            const message = Msg.create<any>(
                  config.p2pPort,
                  messageType?.to ?? "",
                  round.protocolId,
                  currentRound,
                  messageType ?? undefined,
                  round.isDirectMessageRound
            );
            return message;
      };

      private static verifyProof = (proof: bigint) => {
            const parsedProof = BigInt(proof);
            this.proofs = [...this.proofs, parsedProof];

            if (this.proofs.length === this.threshold) {
                  for (let i = 0; i < this.threshold; i++) {
                        for (let j = i + 1; j < this.threshold; j++) {
                              assert.deepEqual(this.proofs[i], this.proofs[j]);
                        }
                  }

                  console.log(`keygeneration was successful, ${this.proofs}`);
            }
      };
}
