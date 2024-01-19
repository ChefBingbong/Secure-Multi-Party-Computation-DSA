import assert from "assert";
import axios from "axios";
import { createHash } from "crypto";
import Flatted from "flatted";
import config from "../config/config";
import { redisClient } from "../db/redis";
import { AppLogger } from "../http/middleware/logger";
import { AllKeyGenRounds } from "../mpc/keygen";
import { AbstractKeygenRound, GenericKeygenRoundBroadcast } from "../mpc/keygen/abstractRound";
import { AbstractKeygenBroadcast } from "../mpc/keygen/keygenMessages/abstractKeygenBroadcast";
import { KeygenDirectMessageForRound4 } from "../mpc/keygen/keygenMessages/directMessages";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { PartySecretKeyConfig } from "../mpc/keygen/partyKey";
import {
      GenericKeygenRoundInput,
      GenericRoundOutput,
      KeygenDirectMessageForRound4JSON,
      KeygenRound5Output,
      SessionConfig,
} from "../mpc/keygen/types";
import { Hasher } from "../mpc/utils/hasher";
import { delay } from "../p2p/server";
import { MESSAGE_TYPE } from "../p2p/types";
import { tryNTimes } from "../rpc/utils/helpers";
import { ErrorWithCode, ProtocolError } from "../utils/errors";
import { extractError } from "../utils/extractError";
import { app } from "./index";
import { Message as Msg } from "./message/message";
import { MessageQueueArray, MessageQueueMap } from "./message/messageQueue";
import { KeygenCurrentState, KeygenMessageData, Round, Rounds, ServerDirectMessage, ServerMessage } from "./types";
import Validator from "./validators/validator";
import TransactionPool from "../wallet/transactionPool";

const KeygenRounds = Object.values(AllKeyGenRounds);

export class KeygenSessionManager extends AppLogger {
      public static sessionInitialized: boolean | undefined;
      public static threshold: number | undefined;
      public static finalRound: number = 5;
      public static currentRound: number = 0;
      public static proofs: Array<bigint> = [];

      private static validators: string[] = [];
      private static validator: Validator;
      private static selfId: string;

      private static session: KeygenSession | undefined;
      private static rounds: Rounds | undefined;

      private static directMessages: MessageQueueArray<KeygenDirectMessageForRound4JSON>;
      private static messages: MessageQueueMap<GenericKeygenRoundBroadcast>;
      private static broadcastRoundHashes: Record<number, string> = {};
      private static directMessageRoundHashes: Record<number, string> = {};

      constructor(validator: Validator) {
            super();
            KeygenSessionManager.validator = validator;
            KeygenSessionManager.selfId = validator.nodeId;
      }

      private static async init(threshold: number, validators: string[]) {
            this.threshold = threshold;
            this.validators = validators;
      }

      public static startNewSession(sessionConfig: SessionConfig): void {
            if (this.sessionInitialized || this.currentRound > 0) {
                  throw new Error(`there is already a keygen session n progress`);
            }
            this.init(sessionConfig.threshold, sessionConfig.partyIds);

            this.directMessages = new MessageQueueArray(this.finalRound + 1);
            this.messages = new MessageQueueMap(this.validators, KeygenSessionManager.finalRound + 1);
            this.broadcastRoundHashes[0] = this.hashMessageData("0x0");
            this.directMessageRoundHashes[2] = this.hashMessageData("0x0");

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
                  throw new ErrorWithCode(`Session was not initialized correctly.`, ProtocolError.PARAMETER_ERROR);
            }
            this.sessionInitialized = true;
      }

      public static startNewRound() {
            const lastRound = this.rounds[this.currentRound];
            const newRound = ++this.currentRound;

            if (!lastRound.finished || !this.sessionInitialized) {
                  throw new Error(`Session is not isnitilized or last round has not finished`);
            }
            const round = this.rounds[newRound].round;
            this.rounds[newRound] = {
                  round,
                  initialized: false,
                  roundResponses: [],
                  finished: false,
            };

            const roundInput = this.verifyInputForNextRound(newRound);
            round.init({ session: this.session, input: roundInput as GenericKeygenRoundInput });
      }

      public static keygenRoundProcessor = async (data: ServerMessage<KeygenMessageData>) => {
            if (!this.sessionInitialized) return;
            try {
                  const { broadcasts, proof } = data.data;
                  const { round, currentRound } = this.getCurrentState();

                  //if we are on a dm round. wait until all nodes have collected their dms
                  const dmsLen = this.directMessages.getNonNullValuesLength(currentRound);
                  if (round.isDirectMessageRound && dmsLen < this.threshold - 1) {
                        await delay(200);
                        await this.keygenRoundProcessor(data);

                        this.generateBroadcastHashes<MessageQueueArray<KeygenDirectMessageForRound4JSON>>(
                              this.directMessages,
                              currentRound,
                              this.directMessageRoundHashes
                        );
                        return;
                  }

                  const bcsLen = this.storePeerBroadcastResponse(broadcasts, round, currentRound, data.senderNode);
                  const proofsLen = this.storePeerProofs(proof, currentRound);

                  if (proofsLen === this.threshold) await this.verifyAndEndSession(this.proofs, proof);

                  if (
                        round.isBroadcastRound &&
                        bcsLen === this.threshold &&
                        this.receivedAll(round, currentRound)
                  ) {
                        this.generateBroadcastHashes<MessageQueueMap<GenericKeygenRoundBroadcast>>(
                              this.messages,
                              currentRound,
                              this.broadcastRoundHashes
                        );
                        await this.finalizeCurrentRound(currentRound);
                  }
            } catch (error) {
                  console.log(error);
                  throw new Error(extractError(error));
            }
      };

      public static keygenRoundDirectMessageProcessor = async (data: ServerDirectMessage) => {
            if (!this.sessionInitialized) return;
            try {
                  const { directMessages } = data.data;
                  const { round, currentRound } = this.getCurrentState();

                  this.validator.directMessagesMap.set(
                        this.currentRound,
                        this.validator.nodeId,
                        data.data.directMessages.Data
                  );
                  this.storePeerDirectMessageResponse(directMessages, round, currentRound);
            } catch (error) {
                  throw new ErrorWithCode(
                        `Failed to store direct message response`,
                        ProtocolError.PARAMETER_ERROR
                  );
            }
      };

      public static keygenRoundVerifier = async () => {
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
                  const proof = this.createKeygenProof(currentRound, roundOutput as KeygenRound5Output);

                  if (round.isBroadcastRound) this.messages.set(currentRound, this.selfId, bcs);

                  app.p2pServer.broadcast({
                        message: `${this.selfId} is prcessing round ${currentRound}`,
                        type: MESSAGE_TYPE.keygenRoundHandler,
                        data: { broadcasts, proof },
                        senderNode: this.selfId,
                  });

                  directMessages.forEach(async (dm: Msg<KeygenDirectMessageForRound4JSON>) => {
                        await delay(500);
                        app.p2pServer.sendDirect(dm.To, {
                              message: `${this.selfId} is sending direct message to ${dm.To}`,
                              type: MESSAGE_TYPE.keygenDirectMessageHandler,
                              data: { directMessages: dm },
                        });
                  });
            } catch (error) {
                  throw new Error(extractError(error));
            }
      };

      public static handleKeygenConsensusMessage = async <Type extends ServerMessage<any>>(message: Type) => {
            switch (message.type) {
                  case MESSAGE_TYPE.keygenDirectMessageHandler:
                        await this.keygenRoundDirectMessageProcessor(message);
                        break;
                  case MESSAGE_TYPE.keygenRoundHandler:
                        await this.keygenRoundProcessor(message);
                        break;
                  case MESSAGE_TYPE.keygenInit:
                        this.startNewSession({
                              selfId: app.p2pServer.NODE_ID,
                              partyIds: app.p2pServer.validators,
                              threshold: app.p2pServer.threshold,
                        });
                        await this.finalizeCurrentRound(0);
                        break;
                  default:
                        break;
            }
      };

      public static async finalizeCurrentRound(currentRound: number) {
            this.rounds[currentRound].finished = true;
            this.startNewRound();
            await delay(1500);
            await this.keygenRoundVerifier();
      }

      public static verifyAndEndSession = async (proofs: bigint[], proof: string) => {
            if (!proofs) return;
            for (let i = 0; i < this.threshold - 1; i++) {
                  for (let j = i + 1; j < this.threshold - 1; j++) {
                        assert.deepEqual(proofs[i], proofs[j]);
                  }
            }
            console.log(`keygeneration was successful, ${proofs}`);
            this.validator.PartyKeyShare = this.rounds[5].round.output.UpdatedConfig.toJSON() as any;
            const leader = await redisClient.getSingleData<string>("leader");

            const response = await tryNTimes(
                  async () =>
                        await axios.post<PartySecretKeyConfig>(
                              `http://localhost:${config.port}/create-transaction`,
                              { from: this.selfId, proof, type: "KEYGEN_PROOF" }
                        ),
                  3,
                  1 * 1000
            );
            if (response) {
                  console.log(`${this.selfId} publishing proof to chain`);
                  if (app.p2pServer.chain.transactionPool.thresholdReached()) {
                        console.log(`KEYGEN ROUND FINISHED CREATING NEW BLOCK FROM PROOF`);
                  }
            }

            await delay(200);
            this.resetSessionState();
            if (this.selfId === leader) app.p2pServer.chain.electNewLeader();
      };

      private static validateRoundBroadcasts(activeRound: AbstractKeygenRound, currentRound: number) {
            const previousRound = this.rounds[currentRound - 1]?.round;
            if (!previousRound?.isBroadcastRound) return;

            this.messages
                  .getRoundValues(currentRound - 1)
                  .map((broadcast) => AbstractKeygenBroadcast.fromJSON(broadcast as any))
                  .forEach((broadcast) => activeRound.handleBroadcastMessage(broadcast));
      }

      private static validateRoundDirectMessages(activeRound: AbstractKeygenRound, currentRound: number) {
            const previousRound = this.rounds[currentRound - 1]?.round;
            if (!previousRound?.isDirectMessageRound) return;

            this.directMessages
                  .getRoundValues(currentRound - 1)
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

      private static storePeerBroadcastResponse(
            newMessage: Msg<GenericKeygenRoundBroadcast> | undefined,
            round: AbstractKeygenRound,
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

      private static storePeerDirectMessageResponse(
            newDirectMessage: Msg<KeygenDirectMessageForRound4JSON>,
            round: AbstractKeygenRound,
            currentRound: number
      ) {
            if (
                  round.isDirectMessageRound &&
                  newDirectMessage &&
                  this.validator.canAccept(newDirectMessage, this.session, this.selfId)
            ) {
                  this.directMessages.set(currentRound, newDirectMessage.Data);
            }
            return this.directMessages.getNonNullValuesLength(currentRound);
      }

      public static storePeerProofs(proof: string | undefined, currentRound: number) {
            if (this.isFinalRound(currentRound) && proof) {
                  const parsedProof = BigInt(proof);
                  this.proofs = [...this.proofs, parsedProof];
            }
            return this.proofs.length;
      }

      private static receivedAll(round: AbstractKeygenRound, currentRound: number): boolean {
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

      private static hashMessageData(data: any): string {
            const hash = createHash("sha256");
            hash.update(JSON.stringify(data));
            return hash.digest("hex");
      }

      private static generateBroadcastHashes<
            T extends
                  | MessageQueueArray<KeygenDirectMessageForRound4JSON>
                  | MessageQueueMap<GenericKeygenRoundBroadcast>
      >(messages: T, roundNumber: number, roundHashes: Record<number, string>): string[] {
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

      private static createDirectMessage = (
            round: AbstractKeygenRound,
            messageType: KeygenDirectMessageForRound4JSON[],
            currentRound: number
      ): Msg<KeygenDirectMessageForRound4JSON>[] => {
            if (!round.isDirectMessageRound) return [];

            return messageType.map((msg) => {
                  return Msg.create<KeygenDirectMessageForRound4JSON>(
                        this.selfId,
                        msg?.to,
                        this.session.protocolId,
                        currentRound,
                        msg,
                        false
                  );
            });
      };

      private static createBroadcastMessage = (
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

      private static createKeygenProof(
            currentRound: number,
            inputForNextRound: KeygenRound5Output
      ): string | undefined {
            if (!this.isFinalRound(currentRound) || !inputForNextRound.UpdatedConfig) return undefined;
            console.log(inputForNextRound.UpdatedConfig);
            return Hasher.create().update(inputForNextRound.UpdatedConfig).digestBigint().toString();
      }

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
            // this.validator.PartyKeyShare = undefined;
      }
}
