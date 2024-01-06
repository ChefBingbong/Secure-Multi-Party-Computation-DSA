import { KGInstance1, KeygenSession, KeygenSessionMap, keygenRounds } from "../mpc/keygen";
import { KeygenBroadcastForRound2 } from "../mpc/keygen/round2";
import { KeygenBroadcastForRound3 } from "../mpc/keygen/round3";
import { KeygenBroadcastForRound4 } from "../mpc/keygen/round4";
import { KeygenBroadcastForRound5 } from "../mpc/keygen/round5";
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
export type Round = {
      round: AbstractRound2;
      initialized: boolean;
      roundResponses: { peer: { [id: string]: boolean }; number: number };
      finished: boolean;
};
export class KeygenSessionManager {
      public sessionComplete: boolean = false;
      public isInitialized: boolean = false;
      public threshold: number = undefined;
      public validators: string[] = [];
      public finalRound: number = 5;
      public currentRound: number = undefined;
      public previousRound: number = undefined;
      public session: {
            session: KeygenSession;
            initialized: boolean;
            roundResponses: { peer: { [id: string]: boolean }; number: number };
            finished: boolean;
      } = undefined;
      public rounds: {
            [x: number]: {
                  round: AbstractRound2;
                  initialized: boolean;
                  roundResponses: { peer: { [id: string]: boolean }; number: number };
                  finished: boolean;
            };
      } = undefined;
      public static messages: {
            [round: number]: any;
      };
      public static directMessages: {
            [round: number]: any;
      };

      constructor() {}

      initNewRound(isFirst: boolean = false) {
            if (this.sessionComplete || !this.isInitialized) return;
            const roundInput = isFirst
                  ? this.session.session.inputForRound1
                  : this.rounds[this.previousRound].round.output;
            const round = new KeygenSessionMap[this.currentRound](this.session.session, roundInput);
            this.rounds[this.currentRound] = {
                  round: round,
                  initialized: false,
                  roundResponses: { peer: {}, number: 0 },
                  finished: false,
            };
      }

      startNewSession({ selfId, partyIds, threshold }): {
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
            this.rounds = {};
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

      resetSessionState() {
            this.sessionComplete = false;
            this.threshold = undefined;
            this.validators = [];
            this.finalRound = 5;
            this.currentRound = undefined;
            this.previousRound = undefined;
            this.session = undefined;
            this.rounds = undefined;
      }

      incrementRound(round: number): void {
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

      logState() {
            const s = this.getCurrentState();
            // console.log({
            //       session: s.currentProtocol,
            //       rounds: s.rounds,
            // });
      }

      getCurrentState(): {
            currentRound: number;
            rounds: Record<
                  number,
                  {
                        [x: number]: {
                              round: AbstractRound2;
                              initialized: boolean;
                              roundResponses: {
                                    peer: { [id: string]: boolean };
                                    number: number;
                              };
                              finished: boolean;
                        };
                  }
            >;
            session: {
                  session: KeygenSession;
                  initialized: boolean;
                  roundResponses: { peer: { [id: string]: boolean }; number: number };
                  finished: boolean;
            };
            currentProtocol:
                  | {
                          round: AbstractRound2;
                          initialized: boolean;
                          roundResponses: {
                                peer: { [id: string]: boolean };
                                number: number;
                          };
                          finished: boolean;
                    }
                  | {
                          session: KeygenSession;
                          initialized: boolean;
                          roundResponses: {
                                peer: { [id: string]: boolean };
                                number: number;
                          };
                          finished: boolean;
                    };
      } {
            const currentRound = this.currentRound;
            const rounds = this.rounds;
            const round = rounds[currentRound];
            const session = this.session;
            const currentProtocol = currentRound !== 0 ? round : session;
            return {
                  currentRound,
                  rounds,
                  session,
                  currentProtocol,
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
}
