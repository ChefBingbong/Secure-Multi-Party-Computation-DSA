import WebSocket from "ws";
import config from "../config/config";
import Validator from "../validators/validator";
import { Validators } from "../validators/validators";

class P2pserver {
      public sockets: WebSocket[];

      constructor() {
            this.sockets = [];
      }

      public listen() {
            const server = new WebSocket.Server({ port: Number(config.p2pPort) });
            server.on("connection", (socket: WebSocket) => {
                  this.connectSocket(socket);
            });
            Validators.create(new Validator());
            this.connectToPeers();
            console.log(
                  `Listening for peer to peer connection on port : ${config.p2pPort}`
            );
      }

      private connectSocket(socket: WebSocket) {
            this.sockets.push(socket);
            // Validators.create(new Validator());
            console.log(`new connection from ${socket.url}`);
            this.messageHandler(socket);
      }

      private connectToPeers() {
            Validators.getPartyIDs().forEach((peer: Validator) => {
                  const socket = new WebSocket(`http://localhost:${config.p2pPort}`);
                  socket.on("open", () => this.connectSocket(socket));
            });
      }

      messageHandler(socket: WebSocket) {
            socket.on("message", (message: WebSocket.RawData) => {
                  const data = JSON.parse(message as any);
                  console.log("RECEIVED", data);
            });
      }
}

export default P2pserver;
