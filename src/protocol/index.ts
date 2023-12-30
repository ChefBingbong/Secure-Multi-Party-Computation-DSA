import App from "./http/app";
import P2pServer from "./p2p/server";

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
                  log.error(`Unhandled Rejection at Promise. Reason: ${reason}`);
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
      const p2p = new P2pServer().listen();
      console.log("Application started");
});
