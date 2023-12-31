import { createLogger, format, Logger, transports } from "winston";
import * as Transport from "winston-transport";
import config from "../../config/config";

export class AppLogger {
      private logger: Logger;

      constructor() {
            this.initLogger();
      }

      private initLogger() {
            if (!this.logger) {
                  let customFormat = format.json();
                  const transportsConfig: Transport[] = [
                        new transports.Console(),
                  ];

                  const httpTransportOptions = {
                        host: "http-intake.logs.us3.datadoghq.com",
                        path: `/api/v2/logs?dd-api-key=${""}&ddsource=nodejs&service=${""}`,
                        ssl: true,
                  };

                  if (config.env !== "production") {
                        customFormat = format.combine(
                              format.timestamp(),
                              this.customPrintf()
                        );
                  } else {
                        // transportsConfig.push(new transports.Http(httpTransportOptions));
                        customFormat = format.combine(
                              format.timestamp(),
                              this.customPrintf()
                        );
                  }

                  this.logger = createLogger({
                        format: customFormat,
                        transports: transportsConfig,
                        level: "debug",
                  });
            }
      }

      private customPrintf() {
            return format.printf(({ level, message, label }) => {
                  return `${level.toLowerCase().padEnd(5)} | ${label.padEnd(
                        5
                  )} | ${message}\n`;
            });
      }

      getLogger(label: string) {
            if (label.length > 30) {
                  throw new Error("Too long label");
            }
            return this.logger.child({ label });
      }
}
