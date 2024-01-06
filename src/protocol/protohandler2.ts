import config from "../config/config";
import {
      KGInstance1,
      KeygenRound1,
      KeygenRound2,
      KeygenRound3,
      KeygenRound4,
      KeygenRound5,
      KeygenSession,
      KeygenSessionMap,
      keygenRounds,
} from "../mpc/keygen";
import { KeygenBroadcastForRound2 } from "../mpc/keygen/round2";
import { KeygenInputForRound1, KeygenRound1Output } from "../mpc/keygen/types";
import { Message as Msg } from "./message/message";
interface BaseRound {
      session: KeygenSession;
      input: any;
      output: any;
      process: () => Promise<any>;
      handleBroadcastMessage: (args: any) => void;
      handleDirectMessage(dmsg: any): void;
}
export interface AbstractRound extends BaseRound {}
export type KeyGenRounds =
      // | KeygenSession
      KeygenRound1 | KeygenRound2 | KeygenRound3 | KeygenRound4 | KeygenRound5;
export type Round<RoundType extends KeygenSession | AbstractRound> = {
      round: RoundType;
      initialized: boolean;
      roundResponses: { peer: { [id: string]: boolean }; number: number };
      finished: boolean;
      broadcast: {
            [round: number]: {
                  [id: string]: any;
            };
      };
};

type Rounds = { [x: number]: Round<AbstractRound> };
type Message = any;
type PartyID = string;
export class KeygenSessionManager {
      public static sessionComplete: boolean = false;
      public static threshold: number = 3;
      public static validators: string[] = [];
      public static finalRound: number = 5;
      public static currentRound: number = 0;
      public static session: Round<KeygenSession>;
      public static rounds: Rounds;
      public static messages: {
            [round: number]: {
                  [id: string]: any;
            };
      };
      public static directMessages: {
            [round: number]: {
                  [id: string]: any;
            };
      };

      constructor(partyIds: string[]) {}

      public static initNewRound<T extends any>(roundInputArgs: T) {
            if (this.sessionComplete) return;

            this.currentRound += 1;
            this.rounds[this.currentRound] = {
                  round: new KeygenSessionMap[this.currentRound](this.session.round, roundInputArgs),
                  initialized: false,
                  roundResponses: { peer: {}, number: 0 },
                  finished: false,
                  broadcast: this.messageQueue(this.validators, 5),
            };
            return this.rounds[this.currentRound];
      }

      public static startNewSession({ selfId, partyIds, threshold }): Round<KeygenSession> {
            this.sessionComplete = false;
            this.threshold = threshold;
            this.validators = partyIds;

            this.currentRound = 0;
            this.rounds = {};
            this.session = {
                  round: new KeygenSession(selfId, partyIds, threshold),
                  initialized: false,
                  roundResponses: { peer: {}, number: 0 },
                  finished: false,
                  broadcast: {},
            };
            KeygenSessionManager.messages = KeygenSessionManager.messageQueue(partyIds, 5);
            KeygenSessionManager.directMessages = KeygenSessionManager.messageQueue(partyIds, 5);
            return this.session;
      }

      public static incrementRound(roundId: number): void {
            if (this.sessionComplete) return;
            if (this.currentRound === 0) {
                  this.session.roundResponses.number += 1;
                  if (this.session.roundResponses.number >= this.threshold) {
                        this.session.finished = true;
                        this.currentRound += 1;
                        this.initNewRound<KeygenInputForRound1>(this.session.round.inputForRound1);
                  }
                  return;
            }
            const round = this.rounds[roundId];
            if (!round) return;

            round.roundResponses.number += 1;
            if (round.roundResponses.number >= 3) round.finished = true;

            if (round.finished) {
                  if (roundId === this.finalRound) this.sessionComplete = true;
                  this.currentRound += 1;
                  // @ts-ignore
                  this.initNewRound(round.round.output);
            }
      }

      public static getCurrentState(): {
            currentRound: number;
            rounds: Rounds;
            session: Round<KeygenSession>;
      } {
            const currentRound = this.currentRound;
            const rounds = this.rounds;
            const session = this.session;
            return {
                  currentRound,
                  rounds,
                  session,
            };
      }

      public static messageQueue(
            senders: PartyID[],
            rounds: number
      ): { [round: number]: { [id: string]: Message | null } } {
            const q: { [round: number]: { [id: string]: Message | null } } = {};

            for (let i = 0; i <= rounds; i++) {
                  const roundMap: { [id: string]: Message | null } = {};
                  q[i] = roundMap;

                  for (const id of senders) {
                        roundMap[id] = null;
                  }
            }

            return q;
      }

      public static async executeRounds(
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void
      ) {
            try {
                  // get first round (initiate if doesnt exists)
                  if (!this.rounds[this.currentRound]) this.initNewRound(this.session.round.inputForRound1);

                  const session = this.session;
                  const round = this.rounds[this.currentRound];

                  // only proceed to execute the round if everyone has
                  // broadcast their results from repvious round
                  console.log(this.messages);

                  if (!this.receivedAll(round)) {
                        if (this.currentRound > 1) {
                              console.log(this.currentRound);
                              console.log(this.messages);
                              const roundMessages = this.messages[this.currentRound].map((b) =>
                                    KeygenBroadcastForRound2.fromJSON(b)
                              );
                              roundMessages.forEach((b) => round.round.handleBroadcastMessage(b));
                        }
                  }

                  // console.log(this.messages);

                  // this.currentRound += 1;
                  // if (this.currentRound === 5) return;

                  if (this.currentRound === 3) return;

                  //process the current round a broadcast messages
                  const roundOutput = await round.round.process();
                  const broadcasts = roundOutput.broadcasts;

                  this.currentRound += 1;
                  this.messages[this.currentRound][config.p2pPort] = broadcasts;
                  await broadcast({
                        name: `keygenRound${this.currentRound}`,
                        text: `recived broadcast from ${config.p2pPort} for round${this.currentRound}`,
                        type: "broadcast-message",
                        options: broadcasts,
                        r: this.currentRound,
                        senderNode: config.p2pPort,
                  });
            } catch (error) {
                  console.log(error);
            }
      }

      private static receivedAll(round: Round<AbstractRound>): boolean {
            // Check all broadcast messages
            if (this.currentRound > 1) {
                  // if (round.broadcast[this.currentRound]) {
                  //       return true;
                  // }

                  for (const id of this.validators) {
                        const msg = round.broadcast[this.currentRound][id];
                        if (msg === null || msg === undefined) {
                              return false;
                        }
                  }
            }

            return true;
      }

      public static canAccept(message: Msg<any>, selfID: string): boolean {
            if (!Msg.isFor(selfID, message)) {
                  console.log("messagwe not for you");
                  return false;
            }

            if (this.session.round.protocolId !== message.Protocol) {
                  console.log("protocol does not match");

                  return false;
            }

            // if (!currentRound.output.SSID.equals(currentRound.SSID())) {
            //   return false;
            // }

            if (!this.session.round.partyIds.includes(message.From)) {
                  console.log("partyids dont include from");
                  return false;
            }

            if (!message.Data) {
                  console.log("no msg data");
                  return false;
            }

            if (this.session.round.finalRound < message.RoundNumber) {
                  return false;
            }

            return true;
      }
}
