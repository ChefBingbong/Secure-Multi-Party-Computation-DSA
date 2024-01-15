import config from "../config/config";
import { redisClient } from "../db/redis";
import App from "../http/app";
// import { MultiHandler } from "./messageProcessor";

export let app: App;

export const updatePeerReplica = async (port: number, type: "DISCONNECT" | "CONNECT"): Promise<number[]> => {
      let peers = await redisClient.getSingleData<number[]>("validators");
      if (!peers) {
            await redisClient.setSignleData("validators", [port]);
            peers = [port];
      }
      if (type === "DISCONNECT")
            peers = [...peers].filter((value, index, self) => {
                  return self.indexOf(value) === index && value !== port;
            });
      else
            peers = [...peers, port].filter((value, index, self) => {
                  return self.indexOf(value) === index;
            });
      await redisClient.setSignleData("validators", peers);
      return peers;
};

export const startProtocol = async (): Promise<void> => {
      if (!redisClient.initialized) throw new Error(`redis not initialized`);

      app = new App();
      const port = Number(config.p2pPort);
      const log = app.getLogger("app");

      const peers = await updatePeerReplica(port, "CONNECT");
      app.start(peers);
      // await redisClient.client.flushall();
      process
            .on("SIGINT", async (reason) => {
                  log.error(`SIGINT. ${reason}`);
                  await updatePeerReplica(port, "DISCONNECT");
                  process.exit();
            })
            .on("SIGTERM", async (reason) => {
                  log.error(`SIGTERM. ${reason}`);
                  await updatePeerReplica(port, "DISCONNECT");
                  process.exit();
            })
            .on("unhandledRejection", async (reason) => {
                  log.error(`Unhandled Rejection at Promise. Reason: ${reason}`);
                  await updatePeerReplica(port, "DISCONNECT");
                  process.exit(-1);
            })
            .on("uncaughtException", async (reason) => {
                  log.error(`Uncaught Exception Rejection at Promise. Reason: ${reason}`);
                  await updatePeerReplica(port, "DISCONNECT");
                  process.exit(-2);
            });
};

startProtocol().then(() => {
      console.log("Application started");
});
