import compression from "compression";
import cors from "cors";
import express, { Express } from "express";
import expressRateLimit from "express-rate-limit";
import helmet from "helmet";
import hpp from "hpp";
import { Server } from "http";
import { Logger } from "winston";
import config from "../config/config";
import errorHandlingMiddleware from "./middleware/errorHandler";
import { AppLogger } from "./middleware/logger";

export class App extends AppLogger {
      public server: Server;
      public app: Express;
      public static log: Logger;

      constructor() {
            super();
            this.app = express();
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
      }

      private configureRoutes(): void {
            this.app.get("/", (req, res) => {
                  res.status(200).send({ result: "ok" });
            });
      }

      private configureErrorHandling(): void {
            this.app.use(errorHandlingMiddleware);
      }

      public start(port: number): void {
            this.server = this.app.listen(port, async () => {
                  App.log.info(`Server listening on port ${port}.`);
            });
      }
}

const app = new App();
app.start(Number(config.port));

process.on("SIGTERM", () => {
      App.log.info("SIGTERM received");
      if (app.server) {
            app.server.close();
      }
});

export default app;
