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

const SignRounds = Object.values(AllSignSessionRounds);

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

      public init() {
            if (this.sessionInitialized) {
                  throw new ErrorWithCode(`Session was not initialized correctly.`, ProtocolError.PARAMETER_ERROR);
            }
            this.checkPaillierFixture(this.publicKeyConfig.paillier, this.secretKeyConfig.paillier);
            this.checkCurvePointFixture(this.publicKeyConfig.ecdsa, this.secretKeyConfig.ecdsaHex);
            this.checkCurvePointFixture(this.publicKeyConfig.elgamal, this.secretKeyConfig.elgamalHex);
            this.checkPedersenFixture(this.publicKeyConfig.pedersen);
            const initializedSucessfully = this.startNewSession();

            if (!initializedSucessfully) {
                  throw new ErrorWithCode(`Session was not initialized correctly.`, ProtocolError.INTERNAL_ERROR);
            }
            console.log(this.session, this.rounds);
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
