import * as net from "net";
import { EventEmitter } from "events";
import T from "./splitStream";
// import splitStream from "./splitStream";

const random4digithex = () => Math.random().toString(16).split(".")[1].substr(0, 4);
const randomuuid = () =>
      new Array(8)
            .fill(0)
            .map(() => random4digithex())
            .join("-");

interface Message {
      type: string;
      data?: { nodeId: string };
      message?: any;
      id?: string;
      origin?: string;
      destination?: string;
      ttl?: number;
}

class P2pServer {
      private connections: Map<string, net.Socket>;
      private neighbors: Map<string, string>;
      private emitter: EventEmitter;
      private server: net.Server;
      private NODE_ID: string;
      private alreadySeenMessages: Set<string> = new Set();
      public on: any;
      public off: any;

      constructor() {
            this.connections = new Map();
            this.neighbors = new Map();
            this.NODE_ID = randomuuid();
            this.emitter = new EventEmitter();
            this.on = this.emitter.on.bind(this.emitter);
            this.off = this.emitter.off.bind(this.emitter);
            this.server = net.createServer((socket: net.Socket) =>
                  this.handleNewSocket(socket)
            );
      }

      initState() {
            // Once connection is established, send the handshake message
            this.emitter.on("_connect", (connectionId) => {
                  this._send(connectionId, {
                        type: "handshake",
                        data: { nodeId: this.NODE_ID },
                  });
            });

            // On message we check whether it's a handshake and add
            // the node to the neighbors list
            this.emitter.on("_message", ({ connectionId, message }) => {
                  const { type, data } = message;

                  if (type === "handshake") {
                        const { nodeId } = data;

                        this.neighbors.set(nodeId, connectionId);
                        this.emitter.emit("connect", { nodeId });
                  }

                  if (type === "message") {
                        const nodeId = this.findNodeId(connectionId);

                        // TODO handle no nodeId error

                        this.emitter.emit("message", { nodeId, data });
                  }
            });

            this.emitter.on("_disconnect", (connectionId) => {
                  const nodeId = this.findNodeId(connectionId);

                  // TODO handle no nodeId
                  if (!nodeId) return;

                  this.neighbors.delete(nodeId);
                  this.emitter.emit("disconnect", { nodeId });
            });

            // Listen to all packets arriving from other nodes and
            // decide whether to send them next and emit message
            this.emitter.on("message", ({ nodeId, data: packet }) => {
                  // First of all we decide, whether this message at
                  // any point has been send by us. We do it in one
                  // place to replace with a strategy later TODO
                  if (this.alreadySeenMessages.has(packet.id) || packet.ttl < 1) {
                        return;
                  } else {
                        this.alreadySeenMessages.add(packet.id);
                  }

                  // Let's pop up the broadcast message and send it
                  // forward on the chain
                  if (packet.type === "broadcast") {
                        this.emitter.emit("broadcast", {
                              message: packet.message,
                              origin: packet.origin,
                        });
                        this.broadcast(
                              packet.message,
                              packet.id,
                              packet.origin,
                              packet.ttl - 1
                        );
                  }

                  // If the peer message is received, figure out if it's
                  // for us and send it forward if not
                  if (packet.type === "direct") {
                        if (packet.destination === this.NODE_ID) {
                              this.emitter.emit("direct", {
                                    origin: packet.origin,
                                    message: packet.message,
                              });
                        } else {
                              this.direct(
                                    packet.destination,
                                    packet.message,
                                    packet.id,
                                    packet.origin,
                                    packet.ttl - 1
                              );
                        }
                  }
            });
      }

      listen(port: number, cb?: () => void): (cb?: any) => net.Server {
            this.server.listen(port, "0.0.0.0", cb);

            return (cb) => this.server.close(cb);
      }

      private handleNewSocket = (socket: net.Socket) => {
            const connectionId = randomuuid();
            this.connections.set(connectionId, socket);
            this.emitter.emit("_connect", connectionId);

            socket.on("close", () => {
                  this.connections.delete(connectionId);
                  this.emitter.emit("_disconnect", connectionId);
            });

            socket.pipe(T()).on("data", (message) => {
                  this.emitter.emit("_message", { connectionId, message });
            });
      };

      // A method for the libabry consumer to
      // esstablish connection to other nodes
      public connect = (ip: string, port: number, cb?: () => void) => {
            const socket = new net.Socket();

            socket.connect(port, ip, () => {
                  this.handleNewSocket(socket);
                  cb && cb();
            });

            // Return a disconnect function so you can
            // exclude the node from the list
            return (cb: Error) => socket.destroy(cb);
      };

      // A method to "raw" send data by the connection ID
      // intended to internal use only
      private _send = (connectionId: string, message: any) => {
            const socket = this.connections.get(connectionId);

            if (!socket) {
                  throw new Error(
                        `Attempt to send data to connection that does not exist ${connectionId}`
                  );
            }

            socket.write(JSON.stringify(message));
      };

      public close = (cb: () => void) => {
            for (let [, socket] of this.connections) {
                  socket.destroy();
            }

            this.server.close(cb);
      };

      // A helper to find node id by connection id
      private findNodeId = (connectionId: string): string | undefined => {
            for (let [nodeId, $connectionId] of this.neighbors) {
                  if (connectionId === $connectionId) {
                        return nodeId;
                  }
            }
            return undefined;
      };

      //
      // Layer 3 - here we can actually send data OVER
      // other nodes by doing recursive broadcast
      //
      public send = (nodeId: string, data: any) => {
            const connectionId = this.neighbors.get(nodeId);

            // TODO handle no connection id error

            this._send(connectionId, { type: "message", data });
      };

      // A method to send packet to other nodes (all neightbors)
      public sendPacket = (packet: any) => {
            for (const $nodeId of this.neighbors.keys()) {
                  this.send($nodeId, packet);
            }
      };

      // 2 methods to send data either to all nodes in the network
      // or to a specific node (direct message)
      public broadcast = (
            message: any,
            id: string = randomuuid(),
            origin: string = this.NODE_ID,
            ttl: number = 255
      ) => {
            this.sendPacket({ id, ttl, type: "broadcast", message, origin });
      };

      public direct = (
            destination: any,
            message: any,
            id: string = randomuuid(),
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
}

export default P2pServer;
