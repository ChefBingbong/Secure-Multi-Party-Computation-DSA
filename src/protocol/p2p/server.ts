import * as net from "net";
import { v4 } from "uuid";
import { Logger } from "winston";
import { AppLogger } from "../http/middleware/logger";
import { P2PNetworkEventEmitter } from "./eventEmitter";
import T from "./splitStream";
import { P2PNetwork } from "./types";

class P2pServer extends AppLogger implements P2PNetwork {
      public readonly connections: Map<string, net.Socket>;
      public readonly neighbors: Map<string, string>;
      public readonly NODE_ID: string;
      public on: any;
      public off: any;

      private readonly emitter: P2PNetworkEventEmitter;
      private log: Logger;
      private server: net.Server;
      private seenMessages: Set<string> = new Set();
      private isInitialized: boolean = false;

      constructor() {
            super();
            this.connections = new Map();
            this.neighbors = new Map();
            this.NODE_ID = v4();

            this.emitter = new P2PNetworkEventEmitter(false);
            this.server = net.createServer((socket: net.Socket) =>
                  this.handleNewSocket(socket)
            );
            this.log = this.getLogger("p2p-network-logger");
            this.on = this.emitter.on.bind(this.emitter);
            this.off = this.emitter.off.bind(this.emitter);

            this.initState();
      }

      //public methods
      public listen(
            port: number,
            ports: number[],
            cb?: () => void
      ): (cb?: any) => net.Server {
            if (!this.isInitialized)
                  this.throwError(`Cannot listen before server is initialized`);

            this.server.listen(port, "0.0.0.0", () => {
                  this.on("connect", ({ nodeId }) => {
                        this.log.info(`New node connected: ${nodeId}`);
                  });

                  this.on("disconnect", ({ nodeId }) => {
                        this.log.info(`Node disconnected: ${nodeId}`);
                  });

                  this.on("broadcast", ({ message: { name, text } }) => {
                        this.log.info(`${name}: ${text}`);
                  });

                  ports.forEach((pot) => {
                        this.connect("127.0.0.1", Number(pot), () => {
                              this.log.info(
                                    `Connection to ${pot} established.`
                              );
                        });
                  });
            });
            return (cb) => this.server.close(cb);
      }

      public connect = (ip: string, port: number, cb?: () => void) => {
            const socket = new net.Socket();

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

      // 2 methods to send data either to all nodes in the network
      // or to a specific node (direct message)
      public broadcast = (
            message: string,
            id: string = v4(),
            origin: string = this.NODE_ID,
            ttl: number = 255
      ) => {
            this.sendPacket({ id, ttl, type: "broadcast", message, origin });
      };

      public sendDirect = (
            destination: string,
            message: string,
            id: string = v4(),
            origin: string = this.NODE_ID,
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
                  this._send(connectionId, {
                        type: "handshake",
                        data: { nodeId: this.NODE_ID },
                  });
            });

            this.emitter.on("_message", ({ connectionId, message }) => {
                  const { type, data } = message;

                  if (type === "handshake") {
                        const { nodeId } = data;
                        this.neighbors.set(nodeId, connectionId);
                        this.emitter.emitConnect(nodeId);
                  }

                  if (type === "message") {
                        const nodeId = this.findNodeId(connectionId);
                        this.emitter.emitMessage(nodeId, data);
                  }
            });

            this.emitter.on("_disconnect", (connectionId) => {
                  const nodeId = this.findNodeId(connectionId);
                  if (!nodeId) return;

                  this.neighbors.delete(nodeId);
                  this.emitter.emitDisconnect(nodeId);
            });

            this.emitter.on("message", ({ nodeId, data: packet }) => {
                  // First of all we decide, whether this message at
                  // any point has been send by us. We do it in one
                  // place to replace with a strategy later TODO
                  if (this.seenMessages.has(packet.id) || packet.ttl < 1)
                        return;
                  else this.seenMessages.add(packet.id);

                  if (packet.type === "broadcast") {
                        this.emitter.emitBroadcast(
                              packet.message,
                              packet.origin
                        );
                        this.broadcast(
                              packet.message,
                              packet.id,
                              packet.origin,
                              packet.ttl - 1
                        );
                  }

                  if (packet.type === "direct") {
                        if (packet.destination === this.NODE_ID) {
                              this.emitter.emitDirect(
                                    packet.message,
                                    packet.origin
                              );
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

      private handleNewSocket = (socket: net.Socket) => {
            const connectionId = v4();
            this.connections.set(connectionId, socket);
            this.emitter.emitConnect(connectionId, true);

            socket.on("close", () => {
                  this.connections.delete(connectionId);
                  this.emitter.emitDisconnect(connectionId, true);
            });

            socket.pipe(T()).on("data", (message) => {
                  this.emitter.emitMessage(connectionId, message, true);
            });
      };

      // A method to "raw" send data by the connection ID
      // intended to internal use only
      private _send = (connectionId: string, message: any) => {
            const socket = this.connections.get(connectionId);

            if (!socket)
                  this.throwError(
                        `Attempt to send data to connection that does not exist ${connectionId}`
                  );

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

      private send = (nodeId: string, data: any) => {
            const connectionId = this.neighbors.get(nodeId);

            // TODO handle no connection id error

            this._send(connectionId, { type: "message", data });
      };

      private sendPacket = (packet: any) => {
            for (const $nodeId of this.neighbors.keys()) {
                  this.send($nodeId, packet);
            }
      };

      private throwError = (error: string) => {
            this.log.error(error);
            throw new Error(error);
      };
}

export default P2pServer;
