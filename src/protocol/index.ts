import { KeygenSession } from "../mpcTss/keygen/keygenSession";
import config from "./config/config";
import { redisClient } from "./db/redis";
import App from "./http/app";
import { MultiHandler } from "./messageProcessor";

export const updatePeerReplica = async (port: number) => {
      const peers = await redisClient.getSingleData<number[]>("validators");
      const updatedPeers = peers.filter((peer) => peer !== port);
      await redisClient.setSignleData("validators", updatedPeers);
};

export const startProtocol = async (): Promise<void> => {
      if (!redisClient.initialized) throw new Error(`redis not initialized`);

      const app = new App();
      const port = Number(config.p2pPort);
      const log = app.getLogger("app");

      let peers = await redisClient.getSingleData<number[]>("validators");
      peers = [...peers, port].filter((value, index, self) => {
            return self.indexOf(value) === index;
      });

      await redisClient.setSignleData("validators", peers);

      app.start(peers);

      process
            .on("SIGINT", async (reason) => {
                  log.error(`SIGINT. ${reason}`);
                  await updatePeerReplica(port);
                  process.exit();
            })
            .on("SIGTERM", async (reason) => {
                  log.error(`SIGTERM. ${reason}`);
                  await updatePeerReplica(port);
                  process.exit();
            })
            .on("unhandledRejection", async (reason) => {
                  log.error(
                        `Unhandled Rejection at Promise. Reason: ${reason}`
                  );
                  await updatePeerReplica(port);
                  process.exit(-1);
            })
            .on("uncaughtException", async (reason) => {
                  log.error(
                        `Uncaught Exception Rejection at Promise. Reason: ${reason}`
                  );
                  await updatePeerReplica(port);
                  process.exit(-2);
            });
};

export const startKeygen = async () => {
      const validators = await redisClient.getSingleData<number[]>(
            "validators"
      );
      const partyIds = validators.map(String);
      const threshold = validators.length - 1;
      const message: Uint8Array = new TextEncoder().encode("hello");

      for (const selfId of partyIds) {
            const keygenSession = () =>
                  new KeygenSession(
                        selfId,
                        partyIds,
                        threshold
                        // precomputedPaillierPrimesA
                  );
            const startFunc = keygenSession().start;
            const protocolHandler = new MultiHandler(startFunc, null);
      }
};
startProtocol().then(() => {
      console.log("Application started");
});
