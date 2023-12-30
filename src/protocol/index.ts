import { EventEmitter } from "stream";
import config from "./config/config";
import App from "./http/app";
import P2pServer from "./p2p/server";
// const emitter = new EventEmitter();
function generatePortRangeRecursive(endPort, startPort = 6001) {
      if (endPort < startPort) {
            // throw new Error("End port must be greater than or equal to 3001");
      }

      if (startPort === endPort) {
            return [startPort];
      }

      const restOfPorts = generatePortRangeRecursive(endPort, startPort + 1);
      return [startPort, ...restOfPorts];
}

export const startProtocol = async (): Promise<void> => {
      const app = new App();
      app.start();
      const log = app.getLogger("app");
      process
            .on("SIGINT", (reason) => {
                  log.error(`SIGINT. ${reason}`);
                  process.exit();
            })
            .on("SIGTERM", (reason) => {
                  log.error(`SIGTERM. ${reason}`);
                  process.exit();
            })
            .on("unhandledRejection", (reason) => {
                  log.error(
                        `Unhandled Rejection at Promise. Reason: ${reason}`
                  );
                  process.exit(-1);
            })
            .on("uncaughtException", (reason) => {
                  log.error(
                        `Uncaught Exception Rejection at Promise. Reason: ${reason}`
                  );
                  process.exit(-2);
            });
};

startProtocol().then(() => {
      const p2pPort = Number(config.p2pPort);
      const ports = generatePortRangeRecursive(p2pPort);
      console.log(p2pPort);
      const node = new P2pServer();

      // p2p.setOnNodeJoinCallback((socket) => {
      //       console.log(`New node joined with ID: ${1}`);
      // });
      node.listen(p2pPort, ports);

      console.log("Application started");
});
