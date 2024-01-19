import * as net from "net";
import { v4 } from "uuid";
import { Logger } from "winston";
import config from "../config/config";
import { redisClient } from "../db/redis";
import { AppLogger } from "../http/middleware/logger";
import Blockchain, { LeaderElectionArgs } from "../consensus/ledger";
import { KeygenSessionManager } from "../protocol/keygenProtocol";
import { GenericMessageParams, ServerDirectMessage, ServerMessage, TransactionData } from "../protocol/types";
// import { MESSAGE_TYPE } from "../protocol/utils/utils";
import Validator from "../protocol/validators/validator";
import { ValidatorsGroup } from "../protocol/validators/validators";
import TransactionPool from "../wallet/transactionPool";
import Wallet from "../wallet/wallet";
import { P2PNetworkEventEmitter } from "./eventEmitter";
import { P2PNetwork } from "./types";
import { ErrorWithCode, ProtocolError } from "../utils/errors";
import Flatted from "flatted";
import { Server, WebSocket } from "ws";
import { IncomingMessage } from "http";
import Block from "../consensus/block";
import { error } from "console";

export enum MESSAGE_TYPE {
      chain = "CHAIN",
      block = "BLOCK",
      transaction = "TRANSACTION",
      clear_transactions = "CLEAR_TRANSACTIONS",
      prepare = "PREPARE",
      pre_prepare = "PRE-PREPARE",
      commit = "COMMIT",
      round_change = "ROUND_CHANGE",
      keygenDirectMessageHandler = "keygenDirectMessageHandler",
      keygenInit = "keygenInit",
      keygenRoundHandler = "keygenRoundHandler",
      LeaderElection = "LeaderElection",
      LeaderVote = "LeaderVote",
      SetNewLeader = "SetNewLeader",
      KeygenTransaction = "KeygenTransaction",
}

export const NetworkMessages: { [x: string]: string } = {
      [MESSAGE_TYPE.chain]: `${config.p2pPort} sending chain`,
      [MESSAGE_TYPE.SetNewLeader]: `${config.p2pPort} is updating leader`,
      [MESSAGE_TYPE.LeaderVote]: `${config.p2pPort} voted`,
      [MESSAGE_TYPE.LeaderElection]: `${config.p2pPort} is starting a new leader election`,
      [MESSAGE_TYPE.transaction]: `${config.p2pPort} broadcasting transaction`,
      [MESSAGE_TYPE.pre_prepare]: `${config.p2pPort} broadcasting pre-prepared block`,
      [MESSAGE_TYPE.prepare]: `${config.p2pPort} broadcasting prepared block`,
      [MESSAGE_TYPE.commit]: `${config.p2pPort} broadcasting block commit`,
      [MESSAGE_TYPE.round_change]: `${config.p2pPort} broadcasting new leader election`,
};

export interface NetworkMessageDirect<T> {
      message: string;
      type: string;
      data?: T;
      senderNode?: string;
}

export interface NetworkMessageBroadcast<T> extends NetworkMessageDirect<T> {
      destination: string;
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class P2pServer extends AppLogger {
      public readonly connections: Map<string, WebSocket>;
      public readonly NODE_ID: string;
      public readonly neighbors: Map<string, string>;
      public readonly validator: Validator = new Validator();
      private readonly emitter: P2PNetworkEventEmitter;

      public validators: string[];
      public chain: Blockchain;
      public wallet: Wallet;
      public transactionPool: TransactionPool;
      public threshold: number;

      private log: Logger;
      private server: Server;
      private seenMessages: Set<string> = new Set();
      private isInitialized: boolean = false;

      constructor() {
            super();
            this.connections = new Map();
            this.neighbors = new Map();
            this.NODE_ID = config.p2pPort;

            this.emitter = new P2PNetworkEventEmitter(false);
            this.emitter.on.bind(this.emitter);
            this.emitter.off.bind(this.emitter);
            this.log = this.getLogger("p2p-log");

            this.server = new WebSocket.Server({ port: Number(config.p2pPort) });

            this.transactionPool = new TransactionPool();
            this.chain = new Blockchain(this.log, this.transactionPool, this.validators, this.validator);
            this.updateReplica(Number(this.NODE_ID), "CONNECT");

            new ValidatorsGroup(this.validator.toString());
            new KeygenSessionManager(this.validator);
            this.initState();
      }

      private async updateReplica(p: number, type: "DISCONNECT" | "CONNECT"): Promise<void> {
            let peers = (await redisClient.getSingleData<number[]>("validators")) || [];
            let leader = await redisClient.getSingleData<string>("leader");

            const { ports, publickKeys } = ValidatorsGroup.getAllKeys();
            if (!leader) leader = publickKeys[ports.indexOf("6001")];

            if (type === "DISCONNECT") {
                  peers = peers.filter((value) => value !== p);
            } else {
                  peers.push(p);
                  peers = [...new Set(peers!)];
            }
            this.chain.leader = leader;
            this.validators = peers.map(String);
            this.threshold = this.validators.length;
      }

      private initState(): void {
            this.emitter.on("_connect", (connectionId) => {
                  this._send(connectionId.connectionId, {
                        type: "handshake",
                        data: { nodeId: this.validator.toString() },
                  });
            });

            this.emitter.on("_message", async ({ connectionId, message }) => {
                  const { type, data } = message;
                  if (type === "handshake") {
                        const { nodeId } = data;
                        const validatorId = this.extractValidatorHost(nodeId);

                        this.neighbors.set(validatorId, connectionId);
                        ValidatorsGroup.update(validatorId, nodeId);
                        this.emitter.emitConnect(validatorId, true);
                  }

                  if (type === "message") {
                        const nodeId = this.findNodeId(connectionId);
                        this.emitter.emitMessage(nodeId, data, true);
                  }
            });

            this.emitter.on("_disconnect", (connectionId) => {
                  const nodeId = this.findNodeId(connectionId.connectionId);
                  if (!nodeId) return;

                  this.neighbors.delete(nodeId);
                  ValidatorsGroup.delete(nodeId);
                  this.emitter.emitDisconnect(nodeId, true);
            });

            this.emitter.on("message", ({ nodeId, data: packet }) => {
                  if (this.seenMessages.has(packet.id) || packet.ttl < 1) return;

                  if (packet.type === "broadcast") {
                        if (packet.origin !== this.NODE_ID) {
                              this.emitter.emitBroadcast(packet.message, packet.origin);
                        } else {
                              this.broadcast(packet.message, packet.id, packet.origin, packet.ttl - 1);
                        }
                  }

                  if (packet.type === "direct") {
                        if (packet.destination === this.NODE_ID) {
                              this.emitter.emitDirect(packet.message, packet.origin);
                        } else {
                              this.sendDirect(
                                    packet.destination,
                                    packet.message,
                                    packet.id,
                                    packet.origin,
                                    packet.ttl - 1
                              );
                        }
                  }
            });

            this.isInitialized = true;
      }

      //public methods
      public listen(ports: number[], cb?: () => void): (cb?: any) => void {
            if (!this.isInitialized) this.throwError(`Cannot listen before server is initialized`);

            this.server.on("connection", (socket) => {
                  this.handleNewSocket(socket);
            });

            this.handlePeerConnection(async (p: number) => {
                  await this.updateReplica(p, "CONNECT");
            });

            this.handlePeerDisconnect(async (p: number) => {
                  await this.updateReplica(p, "DISCONNECT");

                  if (this.chain.leader === p.toString()) {
                        await this.chain.electNewLeader();
                  }
            });

            this.handleBroadcastMessage(async () => {});
            this.handleDirectMessage(async () => {});

            ports.forEach((pot) => {
                  this.connect(pot, () => {
                        this.log.info(`Connection to ${pot} established.`);
                  });
            });
            return (cb) => this.server.close(cb);
      }

      public connect = (port: number, cb?: () => void) => {
            const socket = new WebSocket(`ws://localhost:${port}`);

            socket.on("error", (err) => {
                  console.error(`Socket connection error: ${err.message}`);
            });

            socket.on("open", async () => {
                  this.handleNewSocket(socket);
                  await this.updateReplica(Number(this.NODE_ID), "CONNECT");
                  cb && cb();
            });

            return () => socket.terminate();
      };

      public broadcast = (
            message: any,
            id: string = v4(),
            origin: string = this.validator.ID,
            ttl: number = 255
      ) => {
            this.sendPacket({ id, ttl, type: "broadcast", message, origin });
      };

      public sendDirect = (
            destination: string,
            message: any,
            id: string = v4(),
            origin: string = this.validator.ID,
            ttl: number = 255
      ) => {
            this.sendPacket({
                  id,
                  ttl,
                  type: "direct",
                  message,
                  destination,
                  origin,
            });
      };

      private handleNewSocket = (socket: WebSocket, emitConnect = true) => {
            const connectionId = v4();

            this.connections.set(connectionId, socket);
            if (emitConnect) this.emitter.emitConnect(connectionId, false);

            socket.on("message", (message: any) => {
                  const receivedData = JSON.parse(message);
                  this.emitter.emitMessage(connectionId, receivedData, false);
            });

            socket.on("close", () => {
                  this.connections.delete(connectionId);
                  this.emitter.emitDisconnect(connectionId, false);
            });

            socket.on("error", (err) => {
                  console.error(`Socket connection error: ${err.message}`);
            });
      };

      private _send = (connectionId: string, message: any) => {
            const socket = this.connections.get(connectionId);

            if (!socket) this.throwError(`Attempt to send data to connection that does not exist ${connectionId}`);
            socket.send(JSON.stringify(message));
      };

      private findNodeId = (connectionId: string): string | undefined => {
            for (let [nodeId, $connectionId] of this.neighbors) {
                  if (connectionId === $connectionId) {
                        return nodeId;
                  }
            }
            return undefined;
      };

      private extractValidatorHost(inputString) {
            const match = inputString.match(/port:\s*(\d+)/);

            if (match) return match[1];
            return this.validator.ID;
      }

      private send = (nodeId: string, data: any) => {
            const connectionId = this.neighbors.get(nodeId);
            this._send(connectionId, { type: "message", data });
      };

      private sendPacket = (packet: any) => {
            if (packet.type === "direct") {
                  this.send(packet.destination, packet);
                  this.seenMessages.add(packet.id);
            } else {
                  for (const $nodeId of this.neighbors.keys()) {
                        this.send($nodeId, packet);
                        // this.seenMessages.add(packet.id);
                  }
            }
      };

      public close = (cb: () => void) => {
            for (let [, socket] of this.connections) socket.terminate();
            this.server.close(cb);
      };

      public on = (event: string, listener: (...args: any[]) => void) => {
            this.emitter.on(event, listener);
      };

      public off = (event: string, listener: (...args: any[]) => void) => {
            this.emitter.on(event, listener);
      };

      private throwError = (error: string) => {
            throw new Error(error);
      };

      public startKeygen = async () => {
            let leader = this.chain.leader ?? (await redisClient.getSingleData<string>("leader"));
            if (!leader || this.NODE_ID !== leader) {
                  throw new Error(`leader has not been initialized or you are not the leader`);
            }
            this.broadcast({
                  message: `${this.NODE_ID} is starting a new keygen session`,
                  type: MESSAGE_TYPE.keygenInit,
            });
      };

      private handlePeerConnection = (callback?: (p: number, type: string) => Promise<void>) => {
            this.on("connect", async ({ nodeId }: { nodeId: string }) => {
                  this.log.info(`New node connected: ${nodeId}`);

                  const chain = await redisClient.getSingleData<any>("chain");
                  if (chain) this.chain.chain = chain;

                  if (nodeId !== this.NODE_ID) {
                        const data = { type: MESSAGE_TYPE.chain, data: this.chain.chain };
                        this.buildAndSendNetworkMessage<Block[]>({ type: "DIRECT", data, destination: nodeId });
                  }
                  await callback(Number(nodeId), "CONNECT");
                  console.log(this.threshold, this.validators);
            });
      };

      private handlePeerDisconnect = (callback?: (p: number, type: string) => Promise<void>) => {
            this.on("disconnect", async ({ nodeId }: { nodeId: string }) => {
                  this.log.info(`Node disconnected: ${nodeId}`);
                  await callback(Number(nodeId), "DISCONNECT");
                  console.log(this.threshold, this.validators);
            });
      };

      private handleBroadcastMessage = (callback?: () => Promise<void>) => {
            this.on("broadcast", async ({ message }: { message: ServerMessage<any> }) => {
                  this.log.info(`${message.message}`);
                  this.validator.messages.set(0, message);

                  if (message.type === MESSAGE_TYPE.keygenRoundHandler) {
                        await KeygenSessionManager.keygenRoundProcessor(message);
                  }
                  if (message.type === MESSAGE_TYPE.keygenInit) {
                        KeygenSessionManager.startNewSession({
                              selfId: this.NODE_ID,
                              partyIds: this.validators,
                              threshold: this.threshold,
                        });

                        await KeygenSessionManager.finalizeCurrentRound(0);
                  }

                  await this.chain.handleBlockchainConsensusMessage(message);
                  await callback();
            });
      };

      private handleDirectMessage = (callback?: () => Promise<void>) => {
            this.on("direct", async ({ message }: { message: ServerMessage<any> }) => {
                  this.log.info(`${message.message}`);
                  try {
                        if (message.type === MESSAGE_TYPE.keygenDirectMessageHandler) {
                              this.validator.directMessagesMap.set(
                                    KeygenSessionManager.currentRound,
                                    this.validator.nodeId,
                                    message.data.directMessages.Data
                              );
                              await KeygenSessionManager.keygenRoundDirectMessageProcessor(message);
                        } else {
                              await this.chain.handleBlockchainConsensusMessage<ServerMessage<LeaderElectionArgs>>(
                                    message
                              );
                        }
                        await callback();
                  } catch (error) {
                        console.log(error);
                  }
            });
      };

      public buildAndSendNetworkMessage = async <T extends any = {}>({
            type,
            data,
            destination,
            ttl = 255,
      }: GenericMessageParams<TransactionData<T>>) => {
            try {
                  const messagePayload = this.buildPayloadFromParams<T>(data);
                  switch (type) {
                        case "BROADCAST":
                              this.broadcast(messagePayload, v4(), this.validator.ID, ttl);
                              break;
                        case "DIRECT":
                              this.sendDirect(destination, messagePayload, v4(), this.validator.ID, ttl);
                              break;
                        default:
                              throw new ErrorWithCode(
                                    `Invalid message type: ${type}`,
                                    ProtocolError.INTERNAL_ERROR
                              );
                  }
            } catch (error) {
                  console.log(error);
                  throw new ErrorWithCode(`Failed to send message across network`, ProtocolError.INTERNAL_ERROR);
            }
      };

      private buildPayloadFromParams = <T extends any>(params: TransactionData<T>): ServerMessage<any> => {
            return {
                  message: NetworkMessages[params.type],
                  type: params.type,
                  data: params.data,
                  senderNode: this.validator.nodeId,
            };
      };
}

export default P2pServer;
