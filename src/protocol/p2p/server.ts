import WebSocket from "ws";
import config from "../config/config";
import Validator from "../validators/validator";
import { Validators } from "../validators/validators";
import Flatted from "flatted";
import { IncomingMessage } from "http";

enum MESSAGE_TYPE {
      VALIDATORS = "VALIDATORS",
      block = "BLOCK",
      transaction = "TRANSACTION",
      clear_transactions = "CLEAR_TRANSACTIONS",
}

class P2pserver {
      public validator: Validator;
      public sockets: WebSocket[];
      public server: WebSocket.Server<typeof WebSocket, typeof IncomingMessage>;
      public client: WebSocket;

      constructor() {
            this.sockets = [];
            this.server = new WebSocket.Server({ port: Number(config.p2pPort) });
            // this.client = new WebSocket(`ws://localhost:${config.p2pPort}`);
            // this.sockets.push(this.client)
      }

      // public listen() {
      //       const server = new WebSocket.Server({ port: Number(config.p2pPort) });
      //       server.on("connection", (socket: WebSocket) => {
      //             socket.send(Flatted.stringify("hi"));
      //             this.connectSocket(socket);
      //       });
      //       this.validator = new Validator();
      //       Validators.create(this.validator);
      //       this.connectToPeers();
      //       console.log(
      //             `Listening for peer to peer connection on port : ${config.p2pPort}`
      //       );
      // }
      public listen() {
            const server = this.server;
            server.on("connection", (ws) => {
                  console.log("New client connected!");

                  ws.send("connection established");
                  server.clients.forEach(function (client) {
                        client.send("data");
                  });
                  // ws.on("close", () => console.log("Client has disconnected!"));

                  ws.on("message", (data) => {
                        ws.send("connection established");
                  });

                  // ws.onerror = function () {
                  //       console.log("websocket error");
                  // };
            });
            server.on("listening", () => {
                  const socket = new WebSocket(`ws://localhost:${config.p2pPort}`);
                  socket.on("open", () => console.log("New client connected!"));
                  console.log("listening on", Number(config.p2pPort));
            });
      }

      private connectSocket(socket: WebSocket) {
            this.sockets.push(socket);

            console.log(`new connection from ${socket}`);
            this.messageHandler(socket);
            this.closeConnectionHandler(socket);
            // this.sendValidators(socket);
      }

      private connectToPeers() {
            [1].forEach(() => {
                  const socket = new WebSocket(`ws://localhost:${config.p2pPort}`);
                  socket.t("open", () => this.connectSocket(socket));
            });
      }

      public sendValidators(socket: WebSocket) {
            socket.send(
                  Flatted.stringify({
                        MESSAGE: "VALIDATORS",
                        validator: this.validator,
                  })
            );
      }

      public syncValidators() {
            this.sockets.forEach((socket: WebSocket) => {
                  this.sendValidators(socket);
            });
      }

      messageHandler(socket: WebSocket) {
            socket.on("message", (message: WebSocket.RawData) => {
                  const data = Flatted.parse(message.toString());
                  console.log("RECEIVED", data);

                  // switch (data.MESSAGE) {
                  //       case MESSAGE_TYPE.VALIDATORS:
                  //             Validators.updateValidators(data.validator);
                  //             break;
                  // }
            });
      }

      closeConnectionHandler(socket: WebSocket & { isAlive?: boolean }) {
            socket.on("close", () => (socket.isAlive = false));
      }
}

export default P2pserver;
