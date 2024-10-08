import { AffinePoint } from "@noble/curves/abstract/curve";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import assert from "assert";
import { ethers } from "ethers";
import { Logger } from "winston";
import { ethAddress, sigEthereum } from "../mpc/eth";
import { PartyPublicKeyConfigJSON, PartySecretKeyConfig, PartySecretKeyConfigJSON } from "../mpc/keygen/partyKey";
import { PedersenParams } from "../mpc/paillierKeyPair/Pedersen/pendersen";
import {
      PaillierPublicKey,
      PaillierPublicKeyJSON,
      PaillierSecretKey,
      PaillierSecretKeyJSON,
} from "../mpc/paillierKeyPair/paillierKeygen";
import { GenericSignRoundBroadcast, GenericSignRoundDirectMessage } from "../mpc/signing/abstractSignRound";
import { AllSignSessionRounds } from "../mpc/signing/index";
import { SignRequest } from "../mpc/signing/sign";
import { PedersenParametersJSON } from "../mpc/signing/sign.test";
import { SignSession } from "../mpc/signing/signSession";
import { SignRequestJSON } from "../mpc/signing/types";
import { AffinePointJSON } from "../mpc/types";
import { delay } from "../p2p/server";
import { MESSAGE_TYPE } from "../p2p/types";
import Validator from "../p2p/validators/validator";
import { ErrorWithCode, ProtocolError } from "../utils/errors";
import { extractError } from "../utils/extractError";
import { AbstractProcolManager } from "./abstractProtocolHnadler";
import { app } from "../index";
import { Message as Msg } from "./message/message";
import { MessageQueueArray, MessageQueueMap } from "./message/messageQueue";
import { DirectMessageSignReturnType } from "./protocolMessageParser";
import { ServerDirectMessage, ServerMessage } from "./types";
import { btcAddress, btcTestnetAddress } from "../mpc/btc";

const SignRounds = Object.values(AllSignSessionRounds);

export type SignSessionCurrentState = {
      currentRound: number;
      roundState: any;
      round: any;
      session: SignSession;
};

export class SigningSessionManager extends AbstractProcolManager<SignSession> {
      private messageToSign: any;
      private signRequest: SignRequest;
      private signRequestSerialized: SignRequestJSON;

      private publicKeyConfig: PartyPublicKeyConfigJSON;
      private secretKeyConfig: PartySecretKeyConfigJSON;
      private partyKeyConfig: PartySecretKeyConfig;
      private signature: {
            R: AffinePoint<bigint>;
            S: bigint;
      };
      private broadcastRoundHashes: Record<number, string> = {};
      private directMessageRoundHashes: Record<number, string> = {};

      constructor(validator: Validator, validators: string[], message: any) {
            super(validator, "sign");
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
            this.broadcastRoundHashes[0] = this.hashMessageData("0x0");
            this.directMessageRoundHashes[0] = this.hashMessageData("0x0");

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

      public signSessionRoundProcessor = async (
            data: ServerMessage<{ broadcasts: Msg<GenericSignRoundBroadcast> }>
      ) => {
            if (!this.sessionInitialized) return;
            try {
                  const { broadcasts } = data.data;
                  const { round, currentRound } = this.getCurrentState();

                  //if we are on a dm round. wait until all nodes have collected their dms
                  const dmsLen = this.directMessages.getNonNullValuesLength(currentRound);
                  if (round.isDirectMessageRound && dmsLen < this.threshold - 1) {
                        await delay(200);
                        await this.signSessionRoundProcessor(data);

                        this.generateBroadcastHashes<MessageQueueArray<GenericSignRoundDirectMessage>>(
                              this.directMessages,
                              currentRound,
                              this.directMessageRoundHashes
                        );
                        return;
                  }
                  const bcsLen = this.storePeerBroadcastResponse(broadcasts, round, currentRound, data.senderNode);
                  if (currentRound === this.finalRound) await this.verifyAndEndSession();

                  if (
                        round.isBroadcastRound &&
                        bcsLen === this.threshold &&
                        this.receivedAll(round, currentRound)
                  ) {
                        this.generateBroadcastHashes<MessageQueueMap<any>>(
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

      public sessionRoundDirectMessageProcessor = async <T extends DirectMessageSignReturnType>(
            data: ServerDirectMessage<T>
      ) => {
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
                  const { broadcasts: bcs, messages: dms } = roundOutput!;

                  const broadcasts = this.createBroadcastMessage(round, bcs, currentRound);
                  const directMessages = this.createDirectMessage(round, dms, currentRound);

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
                  throw new Error(extractError(error));
            }
      };

      public handleSignSessionConsensusMessage = async <Type extends ServerMessage<any>>(message: Type) => {
            switch (message.type) {
                  case MESSAGE_TYPE.signSessionDirectMessageHandler:
                        await this.sessionRoundDirectMessageProcessor(message);
                        break;
                  case MESSAGE_TYPE.signSessionRoundHandler:
                        await this.sessionRoundProcessor(message);
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
            await this.sessionRoundVerifier();
      }

      public startNewRound() {
            const lastRound = this.rounds[this.currentRound];
            const newRound = ++this.currentRound;

            if (!lastRound.finished || !this.sessionInitialized) {
                  this.log.error(`Session is not isnitilized or last round has not finished`);
                  return;
            }
            console.log(`STARTING SIGN ROUND ${this.currentRound}\n`);
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

      public sessionRoundProcessor = async (data: ServerMessage<any>) => {
            if (!this.sessionInitialized) return;
            try {
                  const { broadcasts } = data.data;
                  const { round, currentRound } = this.getCurrentState();

                  //if we are on a dm round. wait until all nodes have collected their dms
                  const dmsLen = this.directMessages.getNonNullValuesLength(currentRound);
                  if (round.isDirectMessageRound && dmsLen < this.threshold - 1) {
                        await delay(200);
                        await this.sessionRoundProcessor(data);

                        this.generateBroadcastHashes<MessageQueueArray<any>>(
                              this.directMessages,
                              currentRound,
                              this.directMessageRoundHashes
                        );
                        return;
                  }
                  const bcsLen = this.storePeerBroadcastResponse(broadcasts, round, currentRound, data.senderNode);
                  if (currentRound === this.finalRound) await this.verifyAndEndSession();

                  if (
                        round.isBroadcastRound &&
                        bcsLen === this.threshold &&
                        this.receivedAll(round, currentRound)
                  ) {
                        this.generateBroadcastHashes<MessageQueueMap<any>>(
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

      public verifyAndEndSession = async () => {
            const pubPoint = this.partyKeyConfig.publicPoint();
            const address = ethAddress(pubPoint);
            const bitcoinAddress = btcTestnetAddress(pubPoint);

            const ethSig = sigEthereum(this.signature.R, this.signature.S);
            const addressRec = ethers
                  .recoverAddress(this.signRequest.message, "0x" + bytesToHex(ethSig))
                  .toLowerCase();

            assert.strictEqual(address, addressRec);
            this.resetSessionState();
            this.log.info(`SIGNING WAS SUCCESSFUL, ${address}, ${addressRec}\n`);
            this.log.info(`SHARD PUBLIC KEY, 0x${this.partyKeyConfig.ecdsa}\n`);
            this.log.info(`DERVIVED ETH ADDRESS, ${address}\n`);
            this.log.info(`DERVIVED BTC ADDRESS, ${bitcoinAddress}\n`);
      };

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
}
