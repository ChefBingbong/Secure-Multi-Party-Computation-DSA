import assert from "assert";
import axios from "axios";
import { Logger } from "winston";
import config from "../config/config";
import { redisClient } from "../db/redis";
import { AllKeyGenRounds } from "../mpc/keygen";
import { GenericKeygenRoundBroadcast } from "../mpc/keygen/abstractRound";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { PartySecretKeyConfig } from "../mpc/keygen/partyKey";
import {
      GenericKeygenRoundInput,
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
import { AbstractProcolManager } from "./abstractProtocolHnadler";
import { app } from "./index";
import { Message as Msg } from "./message/message";
import { MessageQueueArray, MessageQueueMap } from "./message/messageQueue";
import { KeygenMessageData, Round, ServerDirectMessage, ServerMessage } from "./types";
import Validator from "../p2p/validators/validator";
import { btcTestnetAddress } from "../mpc/btc";

const KeygenRounds = Object.values(AllKeyGenRounds);

export class KeygenSessionManager extends AbstractProcolManager<KeygenSession> {
      public sessionInitialized: boolean | undefined;
      public threshold: number | undefined;
      public finalRound: number = 5;
      public currentRound: number = 0;
      public proofs: Array<bigint> = [];
      public log: Logger;

      private broadcastRoundHashes: Record<number, string> = {};
      private directMessageRoundHashes: Record<number, string> = {};

      constructor(validator: Validator) {
            super(validator, "keygen");
            this.validator = validator;
            this.selfId = validator.nodeId;
      }

      public async init(threshold: number, validators: string[]) {
            this.threshold = threshold;
            this.validators = validators;
      }

      public startNewSession(sessionConfig: SessionConfig): void {
            if (this.sessionInitialized || this.currentRound > 0) {
                  throw new Error(`there is already a keygen session n progress`);
            }

            this.directMessages = new MessageQueueArray(this.finalRound + 1);
            this.messages = new MessageQueueMap(this.validators, this.finalRound + 1);
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

      public startNewRound() {
            const lastRound = this.rounds[this.currentRound];
            const newRound = ++this.currentRound;

            if (!lastRound.finished || !this.sessionInitialized) {
                  this.log.error(`Session is not isnitilized or last round has not finished`);
                  return;
            }
            console.log(`STARTING KEYGEN ROUND ${this.currentRound}\n`);
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

      public sessionRoundProcessor = async (data: ServerMessage<KeygenMessageData>) => {
            if (!this.sessionInitialized) return;
            try {
                  const { broadcasts, proof } = data.data;
                  const { round, currentRound } = this.getCurrentState();

                  //if we are on a dm round. wait until all nodes have collected their dms
                  const dmsLen = this.directMessages.getNonNullValuesLength(currentRound);
                  if (round.isDirectMessageRound && dmsLen < this.threshold - 1) {
                        await delay(200);
                        await this.sessionRoundProcessor(data);

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

      public sessionRoundDirectMessageProcessor = async (data: ServerDirectMessage<any>) => {
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

      public sessionRoundVerifier = async () => {
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
      public async finalizeCurrentRound(currentRound: number) {
            this.rounds[currentRound].finished = true;
            this.startNewRound();
            await delay(1500);
            await this.sessionRoundVerifier();
      }
      public handleKeygenConsensusMessage = async <Type extends ServerMessage<any>>(message: Type) => {
            switch (message.type) {
                  case MESSAGE_TYPE.keygenDirectMessageHandler:
                        await this.sessionRoundDirectMessageProcessor(message);
                        break;
                  case MESSAGE_TYPE.keygenRoundHandler:
                        await this.sessionRoundProcessor(message);
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

      public verifyAndEndSession = async (proofs: bigint[], proof: string) => {
            if (!proofs) return;
            for (let i = 0; i < this.threshold - 1; i++) {
                  for (let j = i + 1; j < this.threshold - 1; j++) {
                        assert.deepEqual(proofs[i], proofs[j]);
                  }
            }

            console.log(`KEY GENERATION WAS SUCCESSFUL, ${proofs}\n`);
            this.log.info(
                  `DERVIVED BTC ADDRESS, ${btcTestnetAddress(this.validator.PartyKeyShare.publicPoint())}\n`
            );
            const leader = await redisClient.getSingleData<string>("leader");

            if (this.selfId === this.validators[0]) {
                  const proofsToString = proofs.map((p) => p.toString());
                  const response = await tryNTimes(
                        async () =>
                              await axios.post<PartySecretKeyConfig>(
                                    `http://localhost:${config.port}/create-transaction`,
                                    {
                                          from: this.selfId,
                                          proof: proofsToString,
                                          type: "KEYGEN_PROOF",
                                          override: true,
                                    }
                              ),
                        3,
                        1 * 1000
                  );
                  if (response) {
                        console.log(`KEYGEN ROUND FINISHED CREATING NEW BLOCK FROM PROOF\n`);
                  }
            }

            await delay(200);
            this.proofs = [];
            this.resetSessionState();
            if (this.selfId === leader) app.p2pServer.chain.electNewLeader();
      };

      public storePeerProofs(proof: string | undefined, currentRound: number) {
            if (this.isFinalRound(currentRound) && proof) {
                  const parsedProof = BigInt(proof);
                  this.proofs = [...this.proofs, parsedProof];
            }
            return this.proofs.length;
      }

      private createKeygenProof(currentRound: number, inputForNextRound: KeygenRound5Output): string | undefined {
            if (!this.isFinalRound(currentRound) || !inputForNextRound.UpdatedConfig) return undefined;
            return Hasher.create().update(inputForNextRound.UpdatedConfig).digestBigint().toString();
      }
}
