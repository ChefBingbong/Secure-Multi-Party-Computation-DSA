import Redis from "ioredis";
import { Logger } from "winston";
import { AppLogger } from "../http/middleware/logger";

export class RedisClient extends AppLogger {
      public client: Redis;
      public staticClient: RedisClient;
      public log: Logger;
      public initialized: boolean = false;

      constructor() {
            super();
            this.log = this.getLogger("redis-client");
            this.client = new Redis({ port: 6379 });
            this.setUpListeners(this.client);
            this.staticClient = this;
            this.initialized = true;
      }

      private setUpListeners(client: Redis) {
            client.on("error", (err) => this.log.info(`Redis Client Error. Error: ${err}`));
            client.on("connect", () => this.log.info("Redis Client is connect"));
            client.on("reconnecting", () => this.log.info("Redis Client is reconnecting"));
            client.on("ready", () => this.log.info("Redis Client is ready"));
      }

      public async initializeFallback(redisUrl: string): Promise<void> {
            this.client = new Redis(redisUrl as any);
            this.setUpListeners(this.client);
      }

      public async duplicateWithExpireCallback(
            redisUrl: string,
            expireCallback: (key: string) => void
      ): Promise<void> {
            const sub = this.client.duplicate();
            await sub.subscribe("__keyevent@0__:expired");

            sub.on("message", async (key) => {
                  expireCallback(key as string);
            });

            this.client = new Redis(redisUrl as any);
            this.setUpListeners(this.client);
      }

      // get data methods
      async getSingleData<T>(key: string): Promise<T | null> {
            try {
                  const res = await this.client.get(key); // multiple-prices
                  if (res) {
                        return JSON.parse(res);
                  }
                  return null;
            } catch (error) {
                  console.log(error);
            }
      }

      async setSignleData<T>(key: string, data: T): Promise<void> {
            try {
                  await this.client.set(key, JSON.stringify(data));
            } catch (error) {
                  console.log(error);
            }
      }
}

export const redisClient = new RedisClient();
