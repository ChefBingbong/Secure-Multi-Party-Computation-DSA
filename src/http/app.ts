import compression from "compression";
import cors from "cors";
import express, { Express } from "express";
import expressRateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import { Server } from "http";
import { Logger } from "winston";
import config from "../config/config";
import P2pServer from "../p2p/server";
import * as handlers from "./controllers/router";
import errorHandlingMiddleware from "./middleware/errorHandler";
import { AppLogger } from "./middleware/logger";

interface AppInterface {
      app: Express;
      p2pServer: P2pServer;
      start(peers: number[]): void;
}

export class App extends AppLogger implements AppInterface {
      private router: Express.Router;
      public app: Express;
      public p2pServer: P2pServer;
      public static log: Logger;

      constructor() {
            super();
            this.app = express();
            this.router = express.Router();

            App.log = this.getLogger("on-ramp-api-logger");

            this.configureMiddlewares();
            this.configureRoutes();
            this.configureErrorHandling();
      }

      private configureMiddlewares(): void {
            const rateLimit = expressRateLimit({
                  windowMs: 60 * 1000, // 1 minutes
                  limit: 60, // Limit each IP to 60 requests per `window` (here, per 1 minutes)
                  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
                  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
                  message: "Too many requests",
            });
            this.app.use(cors({ origin: "*" }));
            this.app.use(hpp());
            this.app.use(helmet());
            this.app.use(compression());
            this.app.use(express.json());
            this.app.use(rateLimit);
            this.app.use("/", this.router);
      }

      private configureRoutes(): void {
            // Define routes
            this.router.get("/", handlers.getRoot);
            this.router.get("/validators", handlers.getValidators);
            this.router.get("/leader", handlers.getLeader);
            this.router.get("/get-share", handlers.getShare);
            this.router.get("/get-direct-messages", handlers.getDirectMessages);
            this.router.get("/get-messages", handlers.getMessages);
            this.router.post("/direct-message", handlers.postDirectMessage);
            this.router.post("/broadcast", handlers.postBroadcast);
            this.router.post("/start", handlers.postStart);
            this.router.post("/elect-leader", handlers.postElectLeader);
            this.router.post("/reset-state", handlers.resetState);

            this.router.get("/blocks", handlers.getBlocks);
            this.router.get("/transactions", handlers.getTransactions);
            this.router.get("/public-key", handlers.getPublicKey);
            this.router.post("/create-transaction", handlers.createTransaction);
      }

      private configureErrorHandling(): void {
            this.app.use(errorHandlingMiddleware);
      }

      public start(peers: number[]): void {
            this.app.listen(Number(config.port), async () => {
                  App.log.info(`Server listening on port ${Number(config.port)}.`);
                  this.p2pServer = new P2pServer();
                  this.p2pServer.listen(Number(config.p2pPort), peers);
            });
      }
}

export default App;
