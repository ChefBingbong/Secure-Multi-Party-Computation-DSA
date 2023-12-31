import { KGInstance, KeygenRound5, KeygenSession } from ".";
import { KeygenRound1 } from "./round1";
import { KeygenRound2 } from "./round2";
import { KeygenRound3 } from "./round3";
import { KeygenRound4 } from "./round4";

type KeygenRound = {
      process(): void;
};

export class KeygenSessionInstance {
      sessionId: number;
      currentRound: number;
      rounds: Record<
            number,
            {
                  session: KGInstance;
                  initialized: boolean;
                  roundResponses: number;
                  finished: boolean;
            }
      >;

      constructor() {
            this.sessionId = 0;
            this.currentRound = 0;
            this.rounds = {
                  0: {
                        session: KeygenSession,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  1: {
                        session: KeygenRound1,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  2: {
                        session: KeygenRound2,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  3: {
                        session: KeygenRound3,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  4: {
                        session: KeygenRound4,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  5: {
                        session: KeygenRound5,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
            };
      }
}

export class KeygenSessionManager {
      private sessionIdCounter: number;
      private sessions: Record<number, KeygenSessionInstance>;

      constructor() {
            this.sessionIdCounter = 0;
            this.sessions = {};
      }

      startNewSession(): number {
            const sessionId = this.sessionIdCounter++;
            const currentRound = 0;
            const rounds: Record<
                  number,
                  {
                        session: KGInstance;
                        initialized: boolean;
                        roundResponses: number;
                        finished: boolean;
                  }
            > = {
                  0: {
                        session: KeygenSession,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  1: {
                        session: KeygenRound1,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  2: {
                        session: KeygenRound2,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  3: {
                        session: KeygenRound3,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  4: {
                        session: KeygenRound4,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
                  5: {
                        session: KeygenRound5,
                        initialized: false,
                        roundResponses: 0,
                        finished: false,
                  },
            };

            this.sessions[sessionId] = {
                  sessionId,
                  currentRound,
                  rounds,
            };

            return sessionId;
      }

      initializeRound(sessionId: number, round: number): KeygenSessionManager {
            if (
                  this.sessions[sessionId] &&
                  this.sessions[sessionId].rounds[round]
            ) {
                  this.sessions[sessionId].rounds[round].initialized = true;
            }

            return this;
      }

      incrementRoundResponses(
            sessionId: number,
            round: number
      ): KeygenSessionManager {
            if (
                  this.sessions[sessionId] &&
                  this.sessions[sessionId].rounds[round]
            ) {
                  this.sessions[sessionId].rounds[round].roundResponses++;

                  if (
                        this.sessions[sessionId].rounds[round].roundResponses >=
                        Object.keys(this.sessions[sessionId].rounds).length
                  ) {
                        this.sessions[sessionId].rounds[round].finished = true;
                  }

                  if (this.sessions[sessionId].rounds[round].finished) {
                        return this.deleteFinishedSession(sessionId);
                  }
            }

            return this;
      }

      deleteFinishedSession(sessionId: number): KeygenSessionManager {
            if (this.sessions[sessionId]) {
                  delete this.sessions[sessionId];
                  // Create a new instance of KeygenSessionManager
                  return new KeygenSessionManager();
            }

            return this; // Return the same instance if the session was not found
      }

      getSession(sessionId: number): KeygenSessionInstance | undefined {
            return this.sessions[sessionId];
      }
}
