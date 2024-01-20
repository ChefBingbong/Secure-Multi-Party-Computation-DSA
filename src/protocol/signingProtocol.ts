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
import { PartyPublicKeyConfigJSON, PartySecretKeyConfig, PartySecretKeyConfigJSON } from "../mpc/keygen/partyKey";
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
import { Logger } from "winston";
import {
      PaillierPublicKey,
      PaillierPublicKeyJSON,
      PaillierSecretKey,
      PaillierSecretKeyJSON,
} from "../mpc/paillierKeyPair/paillierKeygen";
import { AffinePointJSON } from "../mpc/types";
import { secp256k1 } from "@noble/curves/secp256k1";
import { PedersenParams } from "../mpc/paillierKeyPair/Pedersen/pendersen";
import { PedersenParametersJSON } from "../mpc/signing/sign.test";
import { SignRequestJSON } from "../mpc/signing/types";
import { bytesToHex } from "@noble/hashes/utils";
import { keccak_256 } from "@noble/hashes/sha3";
import { SignRequest } from "../mpc/signing/sign";
import { SignSession } from "../mpc/signing/signSession";
import { AllSignSessionRounds, SignSessionRounds } from "../mpc/signing/index";
import { SignBroadcastForRound2, SignMessageForRound2 } from "../mpc/signing/signRound2";
import { SignBroadcastForRound4, SignMessageForRound4 } from "../mpc/signing/signRound4";
import { SignBroadcastForRound5 } from "../mpc/signing/signRound5";
import { SignBroadcastForRound3, SignMessageForRound3 } from "../mpc/signing/signRound3";
import { ethAddress, sigEthereum } from "../mpc/eth";
import { ethers } from "ethers";
import { AffinePoint } from "@noble/curves/abstract/curve";

const SignRounds = Object.values(AllSignSessionRounds);

export type SignSessionCurrentState = {
      currentRound: number;
      roundState: any;
      round: any;
      session: SignSession;
};

export class SigningSessionManager extends AppLogger {
      private messageToSign: any;
      private signRequest: SignRequest;
      private signRequestSerialized: SignRequestJSON;
      private validators: string[] = [];
      private validator: Validator;

      private selfId: string;

      public sessionInitialized: boolean | undefined;
      public threshold: number | undefined;
      public finalRound: number = 5;
      public currentRound: number = 0;

      private session: SignSession | undefined;
      private rounds: any;

      private directMessages: MessageQueueArray<any>;
      private messages: MessageQueueMap<any>;

      private publicKeyConfig: PartyPublicKeyConfigJSON;
      private secretKeyConfig: PartySecretKeyConfigJSON;
      private partyKeyConfig: PartySecretKeyConfig;
      private signature: {
            R: AffinePoint<bigint>;
            S: bigint;
      };
      public log: Logger;

      // verify initiators party key
      // initiate new session and all rounds
      constructor(validator: Validator, validators: string[], message: any) {
            super();
            this.validator = validator;
            this.selfId = validator.nodeId;

            this.messageToSign = message;
            this.signRequestSerialized = {
                  messageHex: bytesToHex(keccak_256(message)),
                  signerIds: validators,
            };

            this.signRequest = SignRequest.fromJSON(this.signRequestSerialized);
            this.secretKeyConfig = validator.PartyKeyShare.toJSON();
            this.publicKeyConfig = validator.PartyKeyShare.publicPartyData[this.validator.nodeId].toJSON();
            this.partyKeyConfig = PartySecretKeyConfig.fromJSON(this.secretKeyConfig);

            console.log(this.secretKeyConfig, this.publicKeyConfig);
      }

      public async init(threshold: number, validators: string[]) {
            if (this.sessionInitialized) {
                  throw new ErrorWithCode(`Session was not initialized correctly.`, ProtocolError.PARAMETER_ERROR);
            }
            this.threshold = threshold;
            this.validators = validators;

            this.checkPaillierFixture(this.publicKeyConfig.paillier, this.secretKeyConfig.paillier);
            this.checkCurvePointFixture(this.publicKeyConfig.ecdsa, this.secretKeyConfig.ecdsaHex);
            this.checkCurvePointFixture(this.publicKeyConfig.elgamal, this.secretKeyConfig.elgamalHex);
            this.checkPedersenFixture(this.publicKeyConfig.pedersen);
            const initializedSucessfully = this.startNewSession();

            if (!initializedSucessfully) {
                  throw new ErrorWithCode(`Session was not initialized correctly.`, ProtocolError.INTERNAL_ERROR);
            }
      }

      private startNewSession(): boolean {
            this.directMessages = new MessageQueueArray(this.finalRound + 1);
            this.messages = new MessageQueueMap(this.validators, this.finalRound + 1);

            this.rounds = SignRounds.reduce((accumulator, round, i) => {
                  accumulator[i] = {
                        round,
                        initialized: i === 0,
                        roundResponses: [i === 0],
                        finished: i === 0,
                  };
                  return accumulator;
            }, {} as Record<number, any>);

            this.session = this.rounds[0].round as SignSession;
            this.session.init(this.signRequest, this.partyKeyConfig);

            if (!this.session.inputForRound1) {
                  throw new ErrorWithCode(`Session was not initialized correctly.`, ProtocolError.PARAMETER_ERROR);
            }
            this.sessionInitialized = true;
            return this.sessionInitialized;
      }

      public handleSignSessionConsensusMessage = async <Type extends ServerMessage<any>>(message: Type) => {
            switch (message.type) {
                  case MESSAGE_TYPE.signSessionDirectMessageHandler:
                        await this.signSessionRoundDirectMessageProcessor(message);
                        break;
                  case MESSAGE_TYPE.signSessionRoundHandler:
                        await this.signSessionRoundProcessor(message);
                        break;
                  case MESSAGE_TYPE.signSessionInit:
                        await this.finalizeCurrentRound(0);
                        break;
                  default:
                        break;
            }
      };

      public async finalizeCurrentRound(currentRound: number) {
            this.rounds[currentRound].finished = true;
            this.startNewRound();
            await delay(1500);
            await this.signSessionRoundVerifier();
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

            const roundInput = this.rounds[newRound - 1].round.output;
            round.init({ session: this.session, input: roundInput as any });
      }

      public signSessionRoundProcessor = async (data: ServerMessage<any>) => {
            if (!this.sessionInitialized) return;
            try {
                  const { broadcasts } = data.data;
                  const { round, currentRound } = this.getCurrentState();

                  //if we are on a dm round. wait until all nodes have collected their dms
                  const dmsLen = this.directMessages.getNonNullValuesLength(currentRound);
                  if (round.isDirectMessageRound && dmsLen < this.threshold - 1) {
                        await delay(200);
                        await this.signSessionRoundProcessor(data);

                        // this.generateBroadcastHashes<MessageQueueArray<KeygenDirectMessageForRound4JSON>>(
                        //       this.directMessages,
                        //       currentRound,
                        //       this.directMessageRoundHashes
                        // );
                        return;
                  }
                  const bcsLen = this.storePeerBroadcastResponse(broadcasts, round, currentRound, data.senderNode);
                  if (currentRound === this.finalRound) await this.verifyAndEndSession();

                  if (
                        round.isBroadcastRound &&
                        bcsLen === this.threshold
                        // this.receivedAll(round, currentRound)
                  ) {
                        // this.generateBroadcastHashes<MessageQueueMap<GenericKeygenRoundBroadcast>>(
                        //       this.messages,
                        //       currentRound,
                        //       this.broadcastRoundHashes
                        // );
                        await this.finalizeCurrentRound(currentRound);
                  }
            } catch (error) {
                  console.log(error);
                  throw new Error(extractError(error));
            }
      };

      public signSessionRoundDirectMessageProcessor = async (data: ServerDirectMessage) => {
            if (!this.sessionInitialized) return;
            try {
                  const { directMessages } = data.data;
                  const { round, currentRound } = this.getCurrentState();

                  // this.validator.directMessagesMap.set(
                  //       this.currentRound,
                  //       this.validator.nodeId,
                  //       data.data.directMessages.Data
                  // );
                  this.storePeerDirectMessageResponse(directMessages, round, currentRound);
            } catch (error) {
                  throw new ErrorWithCode(
                        `Failed to store direct message response`,
                        ProtocolError.PARAMETER_ERROR
                  );
            }
      };

      public signSessionRoundVerifier = async () => {
            try {
                  console.log("heyyyyyyy");
                  const { round, roundState, currentRound } = this.getCurrentState();

                  // if (this.threshold < 3 || roundState.finished) {
                  //       throw new Error(`need 3 peers to start keygen`);
                  // }
                  this.validateRoundBroadcasts(round, currentRound);
                  this.validateRoundDirectMessages(round, currentRound);
                  const roundOutput = await round.process();

                  // console.log(roundOutput);
                  // this.verifyOutputForCurrentRound(currentRound, roundOutput);
                  const { broadcasts: bcs, messages: dms } = roundOutput!;

                  const broadcasts = this.createBroadcastMessage(round, bcs, currentRound);
                  const directMessages = this.createDirectMessage(round, dms, currentRound);
                  // const proof = this.createKeygenProof(currentRound, roundOutput as KeygenRound5Output);

                  if (currentRound === this.finalRound) this.signature = roundOutput.signature;
                  if (round.isBroadcastRound) this.messages.set(currentRound, this.selfId, bcs);

                  app.p2pServer.broadcast({
                        message: `${this.selfId} is prcessing sign round ${currentRound}`,
                        type: MESSAGE_TYPE.signSessionRoundHandler,
                        data: { broadcasts },
                        senderNode: this.selfId,
                  });

                  directMessages.forEach(async (dm: Msg<any>) => {
                        await delay(500);
                        app.p2pServer.sendDirect(dm.To, {
                              message: `${this.selfId} is sending direct message to ${dm.To}`,
                              type: MESSAGE_TYPE.signSessionDirectMessageHandler,
                              data: { directMessages: dm },
                        });
                  });
            } catch (error) {
                  console.log(error);
                  // throw new Error(extractError(error));
            }
      };

      public verifyAndEndSession = async () => {
            const pubPoint = this.partyKeyConfig.publicPoint();
            const address = ethAddress(pubPoint);

            const ethSig = sigEthereum(this.signature.R, this.signature.S);
            const addressRec = ethers
                  .recoverAddress(this.signRequest.message, "0x" + bytesToHex(ethSig))
                  .toLowerCase();

            assert.strictEqual(address, addressRec);
            console.log(`SIGNING WAS SUCCESSFUL, ${address}, ${addressRec}\n`);
      };

      private validateRoundBroadcasts(activeRound: any, currentRound: number) {
            const previousRound = this.rounds[currentRound - 1]?.round;
            if (!previousRound?.isBroadcastRound) return;

            this.messages
                  .getRoundValues(currentRound - 1)
                  .map((broadcast) => this.getRoundBroadcast(currentRound).fromJSON(broadcast as any))
                  .forEach((broadcast) => activeRound.handleBroadcastMessage(broadcast));
      }

      private validateRoundDirectMessages(activeRound: any, currentRound: number) {
            const previousRound = this.rounds[currentRound]?.round;
            if (!previousRound?.isDirectMessageRound) return;

            this.directMessages
                  .getRoundValues(currentRound - 1)
                  .map((directMsg) => this.getRoundDirectMesssage(currentRound).fromJSON(directMsg))
                  .filter((directMsg) => directMsg.to === this.selfId)
                  .forEach((directMsg) => activeRound.handleDirectMessage(directMsg));
      }

      private createDirectMessage = (round: any, messageType: any[], currentRound: number): Msg<any>[] => {
            if (!round.isDirectMessageRound) return [];

            return messageType.map((msg) => {
                  return Msg.create<any>(this.selfId, msg?.to, this.session.protocolId, currentRound, msg, false);
            });
      };

      private createBroadcastMessage = (
            round: any,
            messageType: any,
            currentRound: number
      ): Msg<any> | undefined => {
            if (!round.isBroadcastRound) return undefined;
            return Msg.create<any>(this.selfId, "", this.session.protocolId, currentRound, messageType, true);
      };

      private storePeerBroadcastResponse(
            newMessage: Msg<any> | undefined,
            round: any,
            currentRound: number,
            senderNode: string
      ) {
            if (
                  round.isBroadcastRound &&
                  newMessage &&
                  this.validator.canAccept(newMessage, this.session as any, this.selfId)
            ) {
                  this.messages.set(currentRound, senderNode, newMessage.Data);
            }
            return this.messages.getRoundMessagesLen(currentRound);
      }

      private storePeerDirectMessageResponse(newDirectMessage: Msg<any>, round: any, currentRound: number) {
            if (
                  round.isDirectMessageRound &&
                  newDirectMessage &&
                  this.validator.canAccept(newDirectMessage, this.session as any, this.selfId)
            ) {
                  this.directMessages.set(currentRound, newDirectMessage.Data);
            }
            return this.directMessages.getNonNullValuesLength(currentRound);
      }

      private getRoundBroadcast(currentRound: number): any {
            switch (currentRound) {
                  case 2:
                        return SignBroadcastForRound2;
                  case 3:
                        return SignBroadcastForRound3;
                  case 4:
                        return SignBroadcastForRound4;
                  case 5:
                        return SignBroadcastForRound5;
                  default:
                        throw new Error("Invalid sign bc round type");
            }
      }

      private getRoundDirectMesssage(currentRound: number): any {
            switch (currentRound) {
                  case 2:
                        return SignMessageForRound2;
                  case 3:
                        return SignMessageForRound3;
                  case 4:
                        return SignMessageForRound4;
                  default:
                        throw new Error("Invalid sign dm round type");
            }
      }

      public checkPaillierFixture = (
            publicSerialized: PaillierPublicKeyJSON,
            privateSerialized: PaillierSecretKeyJSON
      ) => {
            try {
                  const pub = PaillierPublicKey.fromJSON(publicSerialized);
                  const secret = PaillierSecretKey.fromJSON(privateSerialized);
                  assert.equal(pub.n, secret.publicKey.n, "public key does not match secret key");
            } catch (error) {
                  throw new ErrorWithCode(`public key does not match secret key`, ProtocolError.PARAMETER_ERROR);
            }
      };

      public checkCurvePointFixture = (publicSerialized: AffinePointJSON, privateHex: string) => {
            const xbig = BigInt("0x" + publicSerialized.xHex);
            const ybig = BigInt("0x" + publicSerialized.yHex);
            const point = secp256k1.ProjectivePoint.fromAffine({
                  x: xbig,
                  y: ybig,
            });
            point.assertValidity();
            const scalar = BigInt("0x" + privateHex);
            const mul = secp256k1.ProjectivePoint.BASE.multiply(scalar);
            try {
                  assert.strictEqual(xbig, mul.x, "public key does not match secret key");
                  assert.strictEqual(ybig, mul.y, "public key does not match secret key");
            } catch (error) {
                  throw new ErrorWithCode(`public key does not match secret key`, ProtocolError.PARAMETER_ERROR);
            }
      };

      public checkPedersenFixture = (pedersenParametersSerialized: PedersenParametersJSON) => {
            try {
                  const pedersenParams = PedersenParams.fromJSON(pedersenParametersSerialized);
                  pedersenParams.validate();
            } catch (error) {
                  throw new ErrorWithCode(`public key does not match secret key`, ProtocolError.PARAMETER_ERROR);
            }
      };

      public getCurrentState(): SignSessionCurrentState {
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
}
