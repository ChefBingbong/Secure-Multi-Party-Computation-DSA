import { KGInstance1, KeygenSession, KeygenSessionMap, keygenRounds } from ".";

interface AbstractRound {
      session: KeygenSession;
      input: any;
      output: any;
      process: () => Promise<any>;
      handleBroadcastMessage: (args: any) => void;
}
export interface AbstractRound2 extends AbstractRound {}
export type Round = {
      round: AbstractRound2;
      initialized: boolean;
      roundResponses: number;
      finished: boolean;
};
export class KeygenSessionManager {
      private sessionComplete: boolean = false;
      public threshold: number;
      public validators: string[];
      public finalRound: number = 5;
      public currentRound: number = undefined;
      public previousRound: number = undefined;
      public session: {
            session: KeygenSession;
            initialized: boolean;
            roundResponses: number;
            finished: boolean;
      } = undefined;
      public rounds: {
            [x: number]: {
                  round: AbstractRound2;
                  initialized: boolean;
                  roundResponses: number;
                  finished: boolean;
            };
      } = undefined;

      constructor() {}

      initNewRound(isFirst: boolean = false) {
            if (this.sessionComplete) return;
            const roundInput = isFirst
                  ? this.session.session.inputForRound1
                  : this.rounds[this.previousRound].round.output;
            const round = new KeygenSessionMap[this.currentRound](
                  this.session.session,
                  roundInput
            );
            this.rounds[this.currentRound] = {
                  round: round,
                  initialized: false,
                  roundResponses: 0,
                  finished: false,
            };
            // console.log(this);
      }

      startNewSession({ selfId, partyIds, threshold }): {
            session: KeygenSession;
            initialized: boolean;
            roundResponses: number;
            finished: boolean;
      } {
            this.sessionComplete = false;
            this.threshold = threshold;
            this.validators = this.validators;

            this.currentRound = 0;
            this.rounds = {};
            this.session = {
                  session: new KeygenSession(selfId, partyIds, threshold),
                  initialized: false,
                  roundResponses: 0,
                  finished: false,
            };
            return this.session;
      }

      incrementRound(round: number): void {
            if (this.sessionComplete) return;
            if (this.currentRound === 0) {
                  this.session.roundResponses += 1;
                  if (this.session.roundResponses >= 3) {
                        this.session.finished = true;
                        this.currentRound += 1;
                        this.initNewRound(true);
                  }
                  return;
            }
            if (this.rounds[round]) {
                  this.rounds[round].roundResponses += 1;

                  if (this.rounds[round].roundResponses >= 3) {
                        this.rounds[round].finished = true;
                  }

                  if (this.rounds[round].finished) {
                        this.previousRound = this.currentRound;
                        this.currentRound += 1;
                        this.initNewRound();
                  }

                  if (
                        round === this.finalRound &&
                        this.rounds[this.finalRound]?.finished
                  ) {
                        this.sessionComplete = true;
                  }
            }
      }

      logState() {
            const s = this.getCurrentState();
            console.log({
                  session: s.currentProtocol,
                  rounds: s.rounds,
            });
      }

      getCurrentState(): {
            currentRound: number;
            rounds: Record<
                  number,
                  {
                        [x: number]: {
                              round: AbstractRound2;
                              initialized: boolean;
                              roundResponses: number;
                              finished: boolean;
                        };
                  }
            >;
            session: {
                  session: KeygenSession;
                  initialized: boolean;
                  roundResponses: number;
                  finished: boolean;
            };
            currentProtocol:
                  | {
                          round: AbstractRound2;
                          initialized: boolean;
                          roundResponses: number;
                          finished: boolean;
                    }
                  | {
                          session: KeygenSession;
                          initialized: boolean;
                          roundResponses: number;
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
}
