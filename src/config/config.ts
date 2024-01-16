require("dotenv").config();
import * as z from "zod";

const envsSchema = z
      .object({
            NODE_ENV: z.enum(["production", "development"]),
            PORT: z.string().default("3001"),
            P2P_PORT: z.string().default("5001"),
      })
      .nonstrict();

const envVars = {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      P2P_PORT: process.env.P2P_PORT,
};

try {
      const validatedEnvs = envsSchema.parse(envVars);
      console.log(validatedEnvs);
} catch (error) {
      console.error("Error validating environment variables:", error);
}

export const TOTAL_COINS = 1000;

export const TRANSACTION_THRESHOLD = 5;

export const FIRST_LEADER = "";

export const TRANSACTION_FEE = 1;

// map env vars and make it visible outside module
export default {
      env: envVars.NODE_ENV,
      port: envVars.PORT,
      p2pPort: envVars.P2P_PORT,
};
