import * as net from "net";
import { v4 } from "uuid";
import { Logger } from "winston";
import config from "../config/config";
import { AppLogger } from "../http/middleware/logger";
import { KeygenSessionManager } from "../protocol/keygenProtocol";
import Validator from "../protocol/validators/validator";
import { P2PNetworkEventEmitter } from "./eventEmitter";
import T from "./splitStream";
import { P2PNetwork } from "./types";
import { ServerDirectMessage, ServerMessage } from "../protocol/types";
import splitStream from "./splitStream";

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class P2pServer extends AppLogger implements P2PNetwork {
      public readonly connections: Map<string, net.Socket>;
      public readonly NODE_ID: string;
      public readonly neighbors: Map<string, string>;
      public readonly validator: Validator = new Validator();

      public static validators: Map<string, string>;
      public threshold: number;
      private readonly emitter: P2PNetworkEventEmitter;
      private log: Logger;
      private server: net.Server;
      private seenMessages: Set<string> = new Set();
      private isInitialized: boolean = false;

      constructor() {
            super();
            this.threshold = 6;
            this.connections = new Map();
            this.neighbors = new Map();
            this.NODE_ID = config.p2pPort;
            this.emitter = new P2PNetworkEventEmitter(false);
            this.emitter.on.bind(this.emitter);
            this.emitter.off.bind(this.emitter);

            this.log = this.getLogger("p2p-log");
            this.server = net.createServer((socket: net.Socket) => this.handleNewSocket(socket));
            P2pServer.validators = new Map([[config.p2pPort, this.validator.toString()]]);

            new KeygenSessionManager(
                  this.threshold,
                  [
                        "6001",
                        "6002",
                        "6003",
                        "6004",
                        "6005",
                        "6006",
                        // "6007",
                        // "6008",
                        // "6009",
                        // "6010",
                        // "6011",
                        // "6012",
                        // "6013",
                        // "6014",
                        // "6015",
                  ],
                  this.validator
            );

            this.initState();
      }

      private initState() {
            // Once connection is established, send the handshake message
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
                        P2pServer.validators.set(validatorId, nodeId);
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
                  P2pServer.validators.delete(nodeId);
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
      public listen(port: number, ports: number[], cb?: () => void): (cb?: any) => net.Server {
            if (!this.isInitialized) this.throwError(`Cannot listen before server is initialized`);

            this.server.listen(port, "0.0.0.0", () => {
                  this.handlePeerConnection(async () => {});
                  this.handlePeerDisconnect(async () => {});

                  this.handleBroadcastMessage(async () => {});
                  this.handleDirectMessage(async () => {});

                  ports.forEach((pot) => {
                        this.connect("127.0.0.1", Number(pot), () => {
                              this.log.info(`Connection to ${pot} established.`);
                        });
                  });
            });
            return (cb) => this.server.close(cb);
      }

      public connect = (ip: string, port: number, cb?: () => void) => {
            const socket = new net.Socket();

            socket.on("error", (err) => {
                  console.error(`Socket connection error: ${err.message}`);
                  // You can perform error handling logic here
            });
            socket.connect(port, ip, () => {
                  this.handleNewSocket(socket);
                  cb && cb();
            });

            return (cb: Error) => socket.destroy(cb);
      };

      public close = (cb: () => void) => {
            for (let [, socket] of this.connections) socket.destroy();
            this.server.close(cb);
      };

      public on = (event: string, listener: (...args: any[]) => void) => {
            this.emitter.on(event, listener);
      };

      public off = (event: string, listener: (...args: any[]) => void) => {
            this.emitter.on(event, listener);
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

      private handleNewSocket = (socket: net.Socket, emitConnect = true) => {
            const connectionId = v4();
            this.connections.set(connectionId, socket);
            if (emitConnect) this.emitter.emitConnect(connectionId, false);

            socket.on("error", (err) => {
                  console.error(`Socket connection error: ${err.message}`);
            });

            socket.on("close", () => {
                  this.connections.delete(connectionId);
                  this.emitter.emitDisconnect(connectionId, false);
            });

            socket.on("data", (message) => {
                  // console.log(message);
                  const receivedData = JSON.parse(message.toString());
                  // console.log(receivedData);
                  this.emitter.emitMessage(connectionId, receivedData, false);
            });
      };

      private _send = (connectionId: string, message: any) => {
            const socket = this.connections.get(connectionId);

            if (!socket) this.throwError(`Attempt to send data to connection that does not exist ${connectionId}`);
            socket.write(Buffer.from(JSON.stringify(message)));
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

      private throwError = (error: string) => {
            throw new Error(error);
      };

      public startKeygen = async () => {
            this.broadcast({
                  message: `${this.NODE_ID} is starting a new keygen session`,
                  type: "keygenInit",
            });
      };

      // static methods
      public static getAllValidators = () => {
            return [...P2pServer.validators.values()].filter((value, index, self) => {
                  return self.indexOf(value) === index;
            });
      };

      private handlePeerConnection = (callback?: () => Promise<void>) => {
            this.on("connect", async ({ nodeId }: { nodeId: string }) => {
                  this.log.info(`New node connected: ${nodeId}`);
                  await callback();
            });
      };

      private handlePeerDisconnect = (callback?: () => Promise<void>) => {
            this.on("disconnect", async ({ nodeId }: { nodeId: string }) => {
                  this.log.info(`Node disconnected: ${nodeId}`);
                  await callback();
            });
      };

      private handleBroadcastMessage = (callback?: () => Promise<void>) => {
            this.on("broadcast", async ({ message }: { message: ServerMessage }) => {
                  this.log.info(`${message.message}`);

                  if (message.type === `keygenRoundHandler`) {
                        await KeygenSessionManager.keygenRoundProcessor(message);
                  }
                  if (message.type === `keygenInit`) {
                        KeygenSessionManager.startNewSession({
                              selfId: this.NODE_ID,
                              partyIds: [
                                    "6001",
                                    "6002",
                                    "6003",
                                    "6004",
                                    "6005",
                                    "6006",
                                    // "6007",
                                    // "6008",
                                    // "6009",
                                    // "6010",
                                    // "6011",
                                    // "6012",
                                    // "6013",
                                    // "6014",
                                    // "6015",
                              ],
                              threshold: this.threshold,
                        });
                        await KeygenSessionManager.finalizeCurrentRound(0);
                  }
                  await callback();
            });
      };

      private handleDirectMessage = (callback?: () => Promise<void>) => {
            this.on("direct", async ({ message }: { message: ServerDirectMessage }) => {
                  this.log.info(`${message.message}`);

                  if (message.type === `keygenDirectMessageHandler`) {
                        await KeygenSessionManager.keygenRoundDirectMessageProcessor(message);
                  }
                  await callback();
            });
      };
}

export default P2pServer;
