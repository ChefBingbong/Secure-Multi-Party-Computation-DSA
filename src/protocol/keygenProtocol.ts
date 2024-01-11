import assert from "assert";
import { AllKeyGenRounds } from "../mpc/keygen";
import { AbstractKeygenRound, GenericKeygenRoundBroadcast } from "../mpc/keygen/abstractRound";
import { AbstractKeygenBroadcast } from "../mpc/keygen/keygenMessages/abstractKeygenBroadcast";
import { KeygenDirectMessageForRound4 } from "../mpc/keygen/keygenMessages/directMessages";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { GenericRoundOutput, KeygenDirectMessageForRound4JSON, SessionConfig } from "../mpc/keygen/types";
import { Hasher } from "../mpc/utils/hasher";
import { delay } from "../p2p/server";
import { Message as Msg } from "./message/message";
import { Message, Round, Rounds, ServerMessage, KeygenCurrentState } from "./types";

const KeygenRounds = Object.values(AllKeyGenRounds);

export class KeygenSessionManager {
      public static sessionInitialized: boolean | undefined;
      public static threshold: number | undefined;
      public static validators: string[] = [];
      public static selfId: string;
      public static finalRound: number = 5;
      public static currentRound: number = 0;
      public static session: KeygenSession | undefined;
      public static rounds: Rounds | undefined;

      public static messages: Message;
      public static directMessages: Message;
      public static proofs: Array<bigint> = [];

      constructor(threshold: number, validators: string[]) {
            KeygenSessionManager.threshold = threshold;
            KeygenSessionManager.validators = validators;
      }

      public static startNewSession(sessionConfig: SessionConfig): void {
            if (this.sessionInitialized || this.currentRound > 0) {
                  throw new Error(`there is already a keygen session n progress`);
            }
            this.selfId = sessionConfig.selfId;
            this.messages = this.messageQueue(this.finalRound + 1);
            this.directMessages = this.messageQueue(this.finalRound + 1);

            this.rounds = KeygenRounds.reduce((accumulator, round, i) => {
                  accumulator[i] = {
                        round,
                        initialized: i === 0,
                        roundResponses: [i === 0],
                        finished: i === 0,
                  };
                  return accumulator;
            }, {} as Record<number, Round>);

            this.session = this.rounds[0].round as KeygenSession;
            this.session.init({ sessionConfig });

            if (!this.session.output.vssSecret) {
                  throw new Error(`session is not initialized`);
            }
            this.sessionInitialized = true;
      }

      public static startNewRound() {
            const previousRound = this.currentRound;
            const currentRound = ++this.currentRound;
            const lastRound = this.rounds[previousRound];

            if (!lastRound.finished || !this.sessionInitialized) {
                  throw new Error(`Session is not isnitilized or last round has not finished`);
            }
            const round = this.rounds[currentRound].round;
            this.rounds[this.currentRound] = {
                  round,
                  initialized: false,
                  roundResponses: [],
                  finished: false,
            };

            const roundInput = this.verifyInputForNextRound(currentRound);
            round.init({ session: this.session, input: roundInput });
      }

      public static keygenRoundProcessor = async (
            data: ServerMessage,
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void
      ) => {
            const { broadcasts, directMessages, proof } = data.data;
            const { round, currentRound } = this.getCurrentState();

            const bcsLen = this.storePeerBroadcastResponse(broadcasts, round, currentRound);
            const dmsLen = this.storePeerDirectMessageResponse(directMessages, round, currentRound);
            const proofsLen = this.storePeerProofs(proof, currentRound);

            if (proofsLen === this.threshold - 1) this.verifyAndEndSession();

            if (round.isBroadcastRound) {
                  if (
                        (round.isDirectMessageRound && bcsLen === 6 && dmsLen === 5) ||
                        (!round.isDirectMessageRound && bcsLen === 6)
                  ) {
                        await this.finalizeCurrentRound(currentRound, broadcast);
                  }
            }
            console.log(dmsLen);
      };

      public static keygenRoundVerifier = async (
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void
      ) => {
            try {
                  const { round, roundState, currentRound } = this.getCurrentState();

                  if (this.threshold < 3 || roundState.finished) {
                        throw new Error(`need 3 peers to start keygen`);
                  }

                  this.validateRoundBroadcasts(round, currentRound);
                  this.validateRoundDirectMessages(round, currentRound);
                  const roundOutput = await round.process();

                  this.verifyOutputForCurrentRound(currentRound, roundOutput);
                  const { broadcasts: bcs, directMessages: dms } = roundOutput!;

                  const broadcasts = this.createBroadcastMessage(round, bcs, currentRound);
                  const directMessages = this.createDirectMessage(round, dms, currentRound);
                  const proof = this.getProofForOptions(currentRound, roundOutput);

                  if (round.isBroadcastRound) this.messages[currentRound].push(bcs);

                  broadcast({
                        message: `${this.selfId} is prcessing round ${currentRound}`,
                        type: "keygenRoundHandler",
                        data: { broadcasts, directMessages, proof },
                  });
            } catch (err) {
                  console.log(err);
            }
      };

      public static async finalizeCurrentRound(
            currentRound: number,
            broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void
      ) {
            this.rounds[currentRound].finished = true;
            this.startNewRound();
            await delay(1000);
            await this.keygenRoundVerifier(broadcast);
      }

      private static verifyAndEndSession = () => {
            for (let i = 0; i < this.threshold - 1; i++) {
                  for (let j = i + 1; j < this.threshold - 1; j++) {
                        assert.deepEqual(this.proofs[i], this.proofs[j]);
                  }
            }
            console.log(`keygeneration was successful, ${this.proofs}`);
            this.resetSessionState();
      };

      public static validateRoundBroadcasts(activeRound: AbstractKeygenRound, currentRound: number) {
            const previousRound = this.rounds[currentRound - 1]?.round;
            if (!previousRound?.isBroadcastRound) return;

            this.messages[currentRound - 1]
                  .map((broadcast) => AbstractKeygenBroadcast.fromJSON(broadcast))
                  .forEach((broadcast) => activeRound.handleBroadcastMessage(broadcast));
      }

      public static validateRoundDirectMessages(activeRound: AbstractKeygenRound, currentRound: number) {
            const previousRound = this.rounds[currentRound - 1]?.round;
            if (!previousRound?.isDirectMessageRound) return;

            this.directMessages[currentRound - 1]
                  .map((directMsg) => KeygenDirectMessageForRound4.fromJSON(directMsg))
                  .filter((directMsg) => directMsg.to === this.selfId)
                  .forEach((directMsg) => activeRound.handleDirectMessage(directMsg));
      }

      public static getCurrentState(): KeygenCurrentState {
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

      public static isFinalRound(currentRound?: number): boolean {
            if (currentRound) return currentRound === this.finalRound;
            return this.currentRound === this.finalRound;
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
                        return "undefined";
            }
      }

      public static storePeerBroadcastResponse(
            newMessage: Msg<GenericKeygenRoundBroadcast> | undefined,
            round: AbstractKeygenRound,
            currentRound: number
      ) {
            if (round.isBroadcastRound && newMessage && this.canAccept(newMessage, this.selfId)) {
                  this.messages[currentRound].push(newMessage.Data);
            }
            return this.messages[currentRound].length;
      }

      public static storePeerDirectMessageResponse(
            newDirectMessage: Msg<KeygenDirectMessageForRound4JSON>[],
            round: AbstractKeygenRound,
            currentRound: number
      ) {
            if (round.isDirectMessageRound && newDirectMessage) {
                  newDirectMessage.forEach((msg) => {
                        if (this.canAccept(msg, this.selfId)) {
                              this.directMessages[currentRound] = [...this.directMessages[currentRound], msg.Data];
                        }
                  });
            }
            return this.directMessages[currentRound].length;
      }

      public static storePeerProofs(proof: string | undefined, currentRound: number) {
            if (this.isFinalRound(currentRound) && proof) {
                  const parsedProof = BigInt(proof);
                  this.proofs = [...this.proofs, parsedProof];
            }
            return this.proofs.length;
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

      public static canAccept<T extends Msg<GenericKeygenRoundBroadcast> | Msg<KeygenDirectMessageForRound4JSON>>(
            message: T,
            selfID: string
      ): boolean {
            if (!Msg.isFor<T>(selfID, message)) {
                  console.log("messagwe not for you");
                  return false;
            }

            if (this.session.protocolId !== message.Protocol) {
                  console.log("protocol does not match");

                  return false;
            }

            if (!this.session.partyIds.includes(message.From)) {
                  console.log("partyids dont include from");
                  return false;
            }

            if (!message.Data) {
                  console.log("no msg data");
                  return false;
            }

            if (this.session.finalRound < message.RoundNumber) {
                  return false;
            }

            return true;
      }

      public static createDirectMessage = (
            round: AbstractKeygenRound,
            messageType: KeygenDirectMessageForRound4JSON[],
            currentRound: number
      ): Msg<KeygenDirectMessageForRound4JSON>[] | undefined => {
            if (!round.isDirectMessageRound) return undefined;

            return messageType.map((msg) =>
                  Msg.create<KeygenDirectMessageForRound4JSON>(
                        this.selfId,
                        msg?.to,
                        this.session.protocolId,
                        currentRound,
                        msg,
                        false
                  )
            );
      };

      public static createBroadcastMessage = (
            round: AbstractKeygenRound,
            messageType: GenericKeygenRoundBroadcast,
            currentRound: number
      ): Msg<GenericKeygenRoundBroadcast> | undefined => {
            if (!round.isBroadcastRound) return undefined;

            return Msg.create<GenericKeygenRoundBroadcast>(
                  this.selfId,
                  "",
                  this.session.protocolId,
                  currentRound,
                  messageType,
                  true
            );
      };

      private static verifyInputForNextRound = (currentRound: number): GenericRoundOutput => {
            const round = this.rounds[currentRound - 1].round;

            if (currentRound === 1 && !round.output.vssSecret) {
                  throw new Error(`Round 1 has not beeen initialised`);
            }
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

      private static verifyOutputForCurrentRound = (
            currentRound: number,
            roundOutput: GenericRoundOutput
      ): GenericRoundOutput => {
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
            if (currentRound === 5 && !roundOutput.UpdatedConfig) {
                  throw new Error(`Round 5 has not beeen processed`);
            }
            return roundOutput;
      };

      private static resetSessionState() {
            this.currentRound = 0;
            this.sessionInitialized = false;
            this.rounds = undefined;
            this.session = undefined;
            this.messages = undefined;
            this.directMessages = undefined;
            this.proofs = [];
      }
}
