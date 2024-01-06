import { AllKeyGenRounds } from "../mpc/keygen";
import { AbstractKeygenRound } from "../mpc/keygen/abstractRound";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { KeygenBroadcastForRound2 } from "../mpc/keygen/round2";
import { KeygenBroadcastForRound3 } from "../mpc/keygen/round3";
import { KeygenBroadcastForRound4 } from "../mpc/keygen/round4";
import { KeygenBroadcastForRound5 } from "../mpc/keygen/round5";
import {
      GenericKeygenRoundBroadcast,
      GenericKeygenRoundDirectMessage,
      GenericKeygenRoundInput,
      GenericKeygenRoundOutput,
} from "../mpc/keygen/types";
import { Hasher } from "../mpc/utils/hasher";

interface AbstractRound {
      session: KeygenSession;
      input: any;
      output: any;
      process: () => Promise<any>;
      handleBroadcastMessage: (args: any) => void;
      handleDirectMessage(dmsg: any): void;
}
export interface AbstractRound2 extends AbstractRound {}

type RoundResponse = { peer: { [id: string]: boolean }; number: number };
type Session = {
      session: KeygenSession;
      initialized: boolean;
      roundResponses: RoundResponse;
      finished: boolean;
};
type AbstractR = AbstractKeygenRound<
      GenericKeygenRoundInput,
      GenericKeygenRoundOutput,
      GenericKeygenRoundBroadcast,
      GenericKeygenRoundDirectMessage
>;
export type Round = {
      round: AbstractKeygenRound<
            GenericKeygenRoundInput,
            GenericKeygenRoundOutput,
            GenericKeygenRoundBroadcast,
            GenericKeygenRoundDirectMessage
      >;
      initialized: boolean;
      roundResponses: RoundResponse;
      finished: boolean;
};
type Rounds = { [x: number]: Round };
type Message = { [round: number]: any };

export class KeygenSessionManager {
      public static sessionComplete: boolean | undefined;
      public static isInitialized: boolean | undefined;
      public static threshold: number | undefined;
      public static validators: string[] = [];
      public static finalRound: number = 5;
      public static currentRound: number | undefined;
      public static previousRound: number | undefined;
      public static session: Session | undefined;
      public static rounds: Rounds | undefined;

      public static messages: Message;
      public static directMessages: Message;

      constructor() {}

      public static initNewRound(isFirst: boolean = false) {
            if (this.sessionComplete || !this.isInitialized) return;

            const session = this.session.session;
            const input = isFirst
                  ? this.session.session.inputForRound1
                  : this.rounds[this.previousRound].round.output;

            console.log(this.currentRound);
            const round = this.rounds[this.currentRound].round;
            round.init({ session, input });

            this.rounds[this.currentRound] = {
                  round,
                  initialized: false,
                  roundResponses: { peer: {}, number: 0 },
                  finished: false,
            };
      }

      public static startNewSession({ selfId, partyIds, threshold }): {
            session: KeygenSession;
            initialized: boolean;
            roundResponses: { peer: { [id: string]: boolean }; number: number };
            finished: boolean;
      } {
            if (this.isInitialized) return;
            if (this.sessionComplete) this.resetSessionState();

            this.sessionComplete = false;
            this.isInitialized = true;
            this.threshold = threshold;
            this.validators = this.validators;

            this.currentRound = 0;
            this.rounds = Object.values(AllKeyGenRounds).reduce((accumulator, round, i) => {
                  accumulator[i + 1] = {
                        round,
                        initialized: false,
                        roundResponses: { peer: {}, number: 0 },
                        finished: false,
                  };
                  return accumulator;
            }, {} as Record<number, Round>);

            console.log(this.rounds);
            this.session = {
                  session: new KeygenSession(selfId, partyIds, threshold),
                  initialized: false,
                  roundResponses: { peer: {}, number: 0 },
                  finished: false,
            };
            KeygenSessionManager.messages = KeygenSessionManager.messageQueue(5);
            KeygenSessionManager.directMessages = KeygenSessionManager.messageQueue(5);
            return this.session;
      }

      private static resetSessionState() {
            this.sessionComplete = false;
            this.threshold = undefined;
            this.validators = [];
            this.finalRound = 5;
            this.currentRound = undefined;
            this.previousRound = undefined;
            this.session = undefined;
            this.rounds = undefined;
      }

      public static incrementRound(round: number): void {
            if (this.sessionComplete || !this.isInitialized) return;
            if (this.currentRound === 0) {
                  this.session.roundResponses.number += 1;
                  if (this.session.roundResponses.number >= 3) {
                        this.session.finished = true;
                        this.currentRound += 1;
                        this.initNewRound(true);
                  }
                  return;
            }
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
            round: Round;
            session: Session;
            messages: any;
            directMessages: any;
      } {
            const currentRound = this.currentRound;
            const round = this.rounds[currentRound];
            const messages = this.messages[currentRound - 1];
            const directMessages = this.directMessages[currentRound - 1];
            return {
                  currentRound,
                  round,
                  session: this.session,
                  messages,
                  directMessages,
            };
      }

      public static messageQueue(rounds: number): { [round: number]: any[] } {
            const q: { [round: number]: any[] } = {};

            for (let i = 0; i <= rounds; i++) {
                  const roundMap = [];
                  q[i] = roundMap;
            }

            return q;
      }

      public static getDirectMessagesForOptions(currentRound: number, inputForNextRound: any) {
            // Implement logic to get direct messages for options based on the current round and input
            switch (currentRound) {
                  case 3:
                        return inputForNextRound.directMessages;
                  // Add more cases as needed
                  default:
                        return undefined;
            }
      }

      public static getProofForOptions(currentRound: number, inputForNextRound: any) {
            // Implement logic to get proof for options based on the current round and input
            switch (currentRound) {
                  case 5:
                        return Hasher.create().update(inputForNextRound.UpdatedConfig).digestBigint().toString();
                  // Add more cases as needed
                  default:
                        return undefined;
            }
      }

      public static getKeygenBroadcast(currentRound: number, data: any) {
            // Implement logic to create KeygenBroadcast based on the current round and data
            switch (currentRound) {
                  case 2:
                        return KeygenBroadcastForRound2.fromJSON(data);
                  case 3:
                        return KeygenBroadcastForRound3.fromJSON(data);
                  case 4:
                        return KeygenBroadcastForRound4.fromJSON(data);
                  case 5:
                        return KeygenBroadcastForRound5.fromJSON(data);
                  // Add more cases as needed
                  default:
                        throw new Error(`Unsupported round: ${currentRound}`);
            }
      }

      // function getKeygenRound(currentRound: number, inputData: any): KeyGenRound {
      //       const session = new YourSession(); // You can customize this instantiation based on your actual session class

      //       switch (currentRound) {
      //         case 2:
      //           return new KeygenRound2(session, inputData) as KeyGenRound;
      //         case 3:
      //           return new KeygenRound3(session, inputData) as KeyGenRound;
      //         case 4:
      //           return new KeygenRound4(session, inputData) as KeyGenRound;
      //         case 5:
      //           return new KeygenRound5(session, inputData) as KeyGenRound;
      //         // Add more cases as needed
      //         default:
      //           throw new Error(`Unsupported round: ${currentRound}`);
      //       }
      //     }
}
