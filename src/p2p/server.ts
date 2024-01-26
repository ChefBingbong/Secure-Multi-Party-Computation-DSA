import { v4 } from "uuid";
import { Logger } from "winston";
import config from "../config/config";
import Blockchain from "../consensus/consesnsus";
import { redisClient } from "../db/redis";
import { AppLogger } from "../http/middleware/logger";
import { KeygenSessionManager } from "../protocol/keygenProtocol";
import { GenericMessageParams, ServerMessage, TransactionData } from "../protocol/types";
import { Server, WebSocket } from "ws";
import Block from "../consensus/block";
import Validator from "../protocol/validators/validator";
import { ValidatorsGroup } from "../protocol/validators/validators";
import { ErrorWithCode, ProtocolError } from "../utils/errors";
import TransactionPool from "../wallet/transactionPool";
import Wallet from "../wallet/wallet";
import { Listener, P2PNetworkEventEmitter } from "./eventEmitter";
import { MESSAGE_TYPE, NetworkMessages } from "./types";
import { SigningSessionManager } from "../protocol/signingProtocol";

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class P2pServer extends AppLogger {
      public readonly connections: Map<string, WebSocket>;
      public readonly NODE_ID: string;
      public readonly neighbors: Map<string, string>;
      public readonly validator: Validator = new Validator();
      private readonly emitter: P2PNetworkEventEmitter;

      on: (event: string, listener: (...args: any[]) => void) => void;
      off: (event: string, listener: (...args: any[]) => void) => void;

      public validators: string[];
      public chain: Blockchain;
      public wallet: Wallet;
      public transactionPool: TransactionPool;
      public threshold: number;

      private log: Logger;
      private server: Server;
      private seenMessages: Set<string> = new Set();
      private isInitialized: boolean = false;
      public signSessionProcessor: SigningSessionManager;
      public keygenSessionProcessor: KeygenSessionManager;

      constructor() {
            super();
            this.connections = new Map();
            this.neighbors = new Map();
            this.NODE_ID = config.p2pPort;

            this.emitter = new P2PNetworkEventEmitter(false);
            this.emitter.on.bind(this.emitter);
            this.emitter.off.bind(this.emitter);
            this.on = (e: string, l: Listener) => this.emitter.on(e, l);
            this.off = (e: string, l: Listener) => this.emitter.on(e, l);

            this.log = this.getLogger("p2p-log");
            this.server = new WebSocket.Server({ port: Number(config.p2pPort) });
            this.transactionPool = new TransactionPool();
            this.chain = new Blockchain(this.log, this.transactionPool, this.validators, this.validator);

            this.updateReplica(Number(this.NODE_ID), "CONNECT");
            new ValidatorsGroup(this.validator.toString());
            this.keygenSessionProcessor = new KeygenSessionManager(this.validator);

            this.initState();
      }

      // server init
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

      private async updateReplica(p: number, type: "DISCONNECT" | "CONNECT"): Promise<void> {
            let peers = (await redisClient.getSingleData<number[]>("validators")) || [];
            let leader = await redisClient.getSingleData<string>("leader");

            const { ports } = ValidatorsGroup.getAllKeys();
            if (!leader) leader = ports[0];

            if (type === "DISCONNECT") {
                  peers = peers.filter((value) => value !== p);
            } else {
                  peers.push(p);
                  peers = [...new Set(peers!)];
            }
            this.chain.leader = leader;
            this.validators = peers.map(String);
            this.threshold = this.validators.length;
            console.log(this.validators, this.threshold, this.chain.leader);
      }

      // connect and listen logic
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

      public listen(ports: number[], cb?: () => void): (cb?: any) => void {
            if (!this.isInitialized)
                  throw new ErrorWithCode(
                        `Cannot listen before server is initialized`,
                        ProtocolError.PARAMETER_ERROR
                  );

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

      // message sending logic
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

      private send = (nodeId: string, data: any) => {
            const connectionId = this.neighbors.get(nodeId);
            this._send(connectionId, { type: "message", data });
      };

      private _send = (connectionId: string, message: any) => {
            const socket = this.connections.get(connectionId);

            if (!socket)
                  throw new ErrorWithCode(
                        `Attempt to send data to connection that does not exist ${connectionId}`,
                        ProtocolError.INTERNAL_ERROR
                  );
            socket.send(JSON.stringify(message));
      };

      // event handler logic
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
            });
      };

      private handlePeerDisconnect = (callback?: (p: number, type: string) => Promise<void>) => {
            this.on("disconnect", async ({ nodeId }: { nodeId: string }) => {
                  this.log.info(`Node disconnected: ${nodeId}`);
                  await callback(Number(nodeId), "DISCONNECT");
            });
      };

      private handleBroadcastMessage = (callback?: () => Promise<void>) => {
            this.on("broadcast", async ({ message }: { message: ServerMessage<any> }) => {
                  this.validator.messages.set(0, message);
                  //handle keygen & pBFT consensus for broadcasts
                  // console.log(message);
                  if (message.type === MESSAGE_TYPE.keygenInit) {
                        await this.keygenSessionProcessor.init(this.threshold, this.validators);
                        await delay(500);
                  }
                  await this.signSessionProcessor?.handleSignSessionConsensusMessage(message);
                  await this.keygenSessionProcessor.handleKeygenConsensusMessage(message);
                  await this.chain.handleBlockchainConsensusMessage(message);
                  await callback();
            });
      };

      private handleDirectMessage = (callback?: () => Promise<void>) => {
            this.on("direct", async ({ message }: { message: ServerMessage<any> }) => {
                  try {
                        //handle keygen & pBFT consensus for direcct msgs
                        await this.signSessionProcessor?.handleSignSessionConsensusMessage(message);
                        await this.keygenSessionProcessor.handleKeygenConsensusMessage(message);
                        await this.chain.handleBlockchainConsensusMessage(message);
                        await callback();
                  } catch (error) {
                        console.log(error);
                        throw new ErrorWithCode(
                              `Error prcessing direct message for ${this.NODE_ID}`,
                              ProtocolError.INTERNAL_ERROR
                        );
                  }
            });
      };

      //keygen protocol start
      public startKeygen = async () => {
            let leader = this.chain.leader ?? (await redisClient.getSingleData<string>("leader"));
            if (!leader || this.NODE_ID !== leader) {
                  throw new Error(`leader has not been initialized or you are not the leader`);
            }
            try {
                  this.broadcast({
                        message: `${this.NODE_ID} is starting a new keygen session`,
                        type: MESSAGE_TYPE.keygenInit,
                  });
            } catch (err) {
                  console.log(err);
            }
      };

      public startSignSession = async () => {
            // let leader = this.chain.leader ?? (await redisClient.getSingleData<string>("leader"));
            // if (!leader || this.NODE_ID !== leader) {
            //       throw new Error(`leader has not been initialized or you are not the leader`);
            // }
            try {
                  this.broadcast({
                        message: `${this.NODE_ID} is starting a new sign session`,
                        type: MESSAGE_TYPE.signSessionInit,
                  });
            } catch (err) {
                  console.log(err);
            }
      };

      // helpers for building messages
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
}

export default P2pServer;
