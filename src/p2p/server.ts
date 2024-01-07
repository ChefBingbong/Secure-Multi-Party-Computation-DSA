import * as assert from "assert";
import * as net from "net";
import { v4 } from "uuid";
import { Logger } from "winston";
import config from "../config/config";
import { AppLogger } from "../http/middleware/logger";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { KeygenBroadcastForRound2 } from "../mpc/keygen/round2";
import { KeygenBroadcastForRound3 } from "../mpc/keygen/round3";
import { KeygenBroadcastForRound4, KeygenDirectMessageForRound4 } from "../mpc/keygen/round4";
import { KeygenBroadcastForRound5 } from "../mpc/keygen/round5";
import { KeygenSessionManager } from "../protocol/keygenProtocol";
import Validator from "../protocol/validators/validator";
import { P2PNetworkEventEmitter } from "./eventEmitter";
import T from "./splitStream";
import { P2PNetwork } from "./types";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PEER_DELAY = {
      "6001": 40,
      "6002": 150,
      "6003": 300,
      "6004": 450,
      "6005": 550,
      "6006": 700,
};
class P2pServer extends AppLogger implements P2PNetwork {
      public readonly connections: Map<string, net.Socket>;
      public readonly NODE_ID: string;
      public readonly neighbors: Map<string, string>;
      public readonly validator: Validator = new Validator();

      public static validators: Map<string, string>;
      public threshold: number;
      private sessionManager: KeygenSessionManager;
      private sessionId: number;
      private readonly emitter: P2PNetworkEventEmitter;
      private keygenStarted: boolean = false;
      private keygenSession: KeygenSession = undefined;
      private keygenSetupResponses: number = 0;
      private log: Logger;
      private server: net.Server;
      private seenMessages: Set<string> = new Set();
      private isInitialized: boolean = false;
      private broadcasts: KeygenBroadcastForRound2[] = [];
      private broadcasts3: KeygenBroadcastForRound3[] = [];
      private broadcasts4: KeygenBroadcastForRound4[] = [];
      private broadcasts5: KeygenBroadcastForRound5[] = [];
      private directMessages: KeygenDirectMessageForRound4[] = [];
      private proofs: bigint[] = [];
      // private directMessages2: KeygenDirectMessageForRound4[] = [];

      constructor() {
            super();
            this.threshold = 3;
            this.connections = new Map();
            this.neighbors = new Map();
            this.NODE_ID = config.p2pPort;
            this.emitter = new P2PNetworkEventEmitter(false);
            this.emitter.on.bind(this.emitter);
            this.emitter.off.bind(this.emitter);

            this.log = this.getLogger("p2p-log");
            this.server = net.createServer((socket: net.Socket) => this.handleNewSocket(socket));
            P2pServer.validators = new Map([[config.p2pPort, this.validator.toString()]]);

            new KeygenSessionManager(3, ["6001", "6002", "6003"]);
            KeygenSessionManager.startNewSession({
                  selfId: this.NODE_ID,
                  partyIds: ["6001", "6002", "6003"],
                  threshold: 3,
            });

            this.initState();
      }

      // static methods
      public static getAllValidators = () => {
            return [...P2pServer.validators.values()].filter((value, index, self) => {
                  return self.indexOf(value) === index;
            });
      };

      //public methods
      public listen(port: number, ports: number[], cb?: () => void): (cb?: any) => net.Server {
            if (!this.isInitialized) this.throwError(`Cannot listen before server is initialized`);

            this.server.listen(port, "0.0.0.0", () => {
                  this.on("connect", ({ nodeId }) => {
                        this.log.info(`New node connected: ${nodeId}`);
                  });

                  this.on("disconnect", async ({ nodeId }) => {
                        this.log.info(`Node disconnected: ${nodeId}`);
                  });

                  this.on(
                        "broadcast",
                        async ({
                              message: {
                                    name,
                                    text,
                                    type = "broadcast",
                                    options = undefined,
                                    senderNode = undefined,
                              },
                        }) => {
                              this.log.info(`${name}: ${text}`);

                              try {
                                    if (type === `keygenRoundHandler`) {
                                          await KeygenSessionManager.keygenRoundProcessor(options, this.broadcast);
                                    }
                              } catch (error) {
                                    console.log(error);
                              }
                        }
                  );

                  this.on("direct", ({ message: { name, text } }) => {
                        this.log.info(`${name}: ${text}`);
                  });

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
            for (let [, socket] of this.connections) {
                  socket.destroy();
            }

            this.server.close(cb);
      };

      public on = (event: string, listener: (...args: any[]) => void) => {
            this.emitter.on(event, listener);
      };

      public off = (event: string, listener: (...args: any[]) => void) => {
            this.emitter.on(event, listener);
      };

      // 2 methods to send data either to all nodes in the network
      // or to a specific node (direct message)
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
                        await delay(PEER_DELAY[this.NODE_ID]);
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
                  // First of all we decide, whether this message at
                  // any point has been send by us. We do it in one
                  // place to replace with a strategy later TODO
                  // console.log(packet);
                  if (this.seenMessages.has(packet.id) || packet.ttl < 1) return;

                  if (packet.type === "broadcast") {
                        if (packet.origin !== this.NODE_ID) {
                              // console.log(packet);

                              this.emitter.emitBroadcast(packet.message, packet.origin);
                        } else {
                              this.broadcast(packet.message, packet.id, packet.origin, packet.ttl - 1);
                        }
                  }

                  if (packet.type === "direct") {
                        // console.log(packet);
                        if (packet.destination === this.NODE_ID) {
                              this.emitter.emitDirect(packet.message, packet.origin);
                        } else {
                              // console.log(packet);
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

      private handleNewSocket = (socket: net.Socket, emitConnect = true) => {
            const connectionId = v4();
            this.connections.set(connectionId, socket);
            if (emitConnect) this.emitter.emitConnect(connectionId, false);

            socket.on("error", (err) => {
                  console.error(`Socket connection error: ${err.message}`);
                  // You can perform error handling logic here
            });

            socket.on("close", () => {
                  this.connections.delete(connectionId);
                  this.emitter.emitDisconnect(connectionId, false);
            });

            socket.pipe(T()).on("data", (message) => {
                  this.emitter.emitMessage(connectionId, message, false);
            });
      };

      // A method to "raw" send data by the connection ID
      // intended to internal use only
      private _send = (connectionId: string, message: any) => {
            const socket = this.connections.get(connectionId);

            if (!socket) this.throwError(`Attempt to send data to connection that does not exist ${connectionId}`);
            socket.write(JSON.stringify(message));
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

            // TODO handle no connection id error

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
            await KeygenSessionManager.keygenRoundVerifier(this.broadcast);
      };
}

export default P2pServer;
