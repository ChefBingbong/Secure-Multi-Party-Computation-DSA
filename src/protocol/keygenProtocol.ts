import assert from "assert";
import config from "../config/config";
import { AllKeyGenRounds } from "../mpc/keygen";
import { AbstractKeygenRound, SessionConfig } from "../mpc/keygen/abstractRound";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { KeygenBroadcastForRound2 } from "../mpc/keygen/round2";
import { KeygenBroadcastForRound3 } from "../mpc/keygen/round3";
import { KeygenBroadcastForRound4 } from "../mpc/keygen/round4";
import { KeygenBroadcastForRound5 } from "../mpc/keygen/round5";
import { Hasher } from "../mpc/utils/hasher";
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

      public static initNewRound() {
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
      }

      public static keygenRoundProcessor = async (
            options: any,
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void
      ) => {
            const { broadcasts, directMessages, proof } = options;
            const { round, roundState, currentRound } = this.getCurrentState();
            const roundResponses = roundState.roundResponses;

            if (!roundResponses.peer[config.p2pPort]) this.keygenRoundVerifier(broadcast);

            this.incrementRound(currentRound);

            if (round.isBroadcastRound) {
                  this.updateRoundMessages(broadcasts, currentRound);
            }
            if (round.isDirectMessageRound) {
                  this.updateRoundDirectMessages(directMessages, currentRound);
            }

            if (proof && roundResponses.number === this.threshold) {
                  const parsedProof = BigInt(proof);
                  assert.deepEqual(parsedProof[0], parsedProof[1]);
                  assert.deepEqual(parsedProof[1], parsedProof[2]);

                  console.log(`keygeneration was successful`);
            }

            if (roundResponses.number === this.threshold) {
                  console.log(`ready to start keygen round 1`);
                  if (config.p2pPort === "6001") this.keygenRoundVerifier(broadcast);
            }
      };

      public static keygenRoundVerifier = async (
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void
      ) => {
            try {
                  const { round, roundState, currentRound } = this.getCurrentState();
                  const roundResponses = roundState.roundResponses;

                  if (this.threshold < 3 || roundState.finished) {
                        throw new Error(`need 3 peers to start keygen`);
                  }

                  this.validateRoundBroadcasts();
                  this.validateRoundDirectMessages(config.p2pPort);

                  const inputForNextRound = await round.process();
                  roundResponses.peer[config.p2pPort] = true;

                  broadcast({
                        name: `round${currentRound}-response`,
                        text: `${config.p2pPort}'s round${currentRound} input ${inputForNextRound}`,
                        type: "keygenRoundHandler",
                        options: {
                              broadcasts: inputForNextRound?.broadcasts,
                              directMessages: inputForNextRound?.directMessages,

                              proof: KeygenSessionManager.getProofForOptions(currentRound, inputForNextRound),
                        },
                        senderNode: config.p2pPort,
                  });
                  if (currentRound === 5) console.log(inputForNextRound.UpdatedConfig);

                  roundState.initialized = true;
            } catch (err) {
                  console.log(err);
            }
      };

      private static resetSessionState() {
            this.sessionComplete = false;
            // this.threshold = undefined;
            // this.validators = [];
            this.finalRound = 5;
            this.currentRound = 0;
            // this.previousRound = undefined;
            // this.session = undefined;
            // this.rounds = undefined;
            this.isInitialized = true;
      }

      public static incrementRound(round: number): void {
            console.log(this.sessionComplete, this.isInitialized);
            if (this.sessionComplete || !this.isInitialized) return;
            if (this.rounds[round]) {
                  this.rounds[round].roundResponses.number += 1;

                  if (this.rounds[round].roundResponses.number >= 3) {
                        this.rounds[round].finished = true;
                  }

                  if (this.rounds[round].finished) {
                        if (round === this.finalRound) {
                              this.sessionComplete = true;
                        } else {
                              this.previousRound = this.currentRound;
                              this.currentRound += 1;
                              this.initNewRound();
                        }
                  }
            }
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
            KeygenSessionManager.messages[r] = [...KeygenSessionManager.messages[r], ...newMessages];
      }

      public static updateRoundDirectMessages(newDirectMessages: any, r: any) {
            KeygenSessionManager.directMessages[r] = [
                  ...KeygenSessionManager.directMessages[r],
                  ...newDirectMessages,
            ];
      }

      private static receivedAll(): boolean {
            const isBroadcastRound = this.rounds[this.currentRound].round.isBroadcastRound;
            const isDirectMessageRound = this.rounds[this.currentRound].round.isDirectMessageRound;

            const roundBroadcasts = this.messages[this.currentRound].length;
            const roundMessages = this.directMessages[this.currentRound].length;
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

            if (this.session.session.protocolId !== message.Protocol) {
                  console.log("protocol does not match");

                  return false;
            }

            // if (!currentRound.output.SSID.equals(currentRound.SSID())) {
            //   return false;
            // }

            if (!this.session.session.partyIds.includes(message.From)) {
                  console.log("partyids dont include from");
                  return false;
            }

            if (!message.Data) {
                  console.log("no msg data");
                  return false;
            }

            if (this.session.session.finalRound < message.RoundNumber) {
                  return false;
            }

            return true;
      }
}
