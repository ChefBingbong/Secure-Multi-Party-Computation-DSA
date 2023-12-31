import { NextFunction, Request, Response } from "express";
import { app, startKeygen } from "../../protocol";
import P2pServer from "../../p2p/server";
import config from "../../config/config";

export const getRoot = (req: Request, res: Response) => {
      res.status(200).send({ result: "ok" });
};

export const getValidators = (
      req: Request,
      res: Response,
      next: NextFunction
) => {
      try {
            const partyIds = P2pServer.getAllValidators();
            res.status(200).json({ partyIds });
      } catch (error) {
            next(error);
      }
};

export const postDirectMessage = (
      req: Request,
      res: Response,
      next: NextFunction
) => {
      try {
            app.p2pServer.sendDirect(req.body.id, {
                  name: "direct-message",
                  text: `recieved message from node ${config.p2pPort}`,
            });
            res.send("success");
      } catch (error) {
            next(error);
      }
};

export const postBroadcast = (
      req: Request,
      res: Response,
      next: NextFunction
) => {
      try {
            app.p2pServer.broadcast({
                  name: "broadcast-message",
                  text: `recieved message from node ${config.p2pPort}`,
                  // nodeId: config.p2pPort,
            });
            res.send("success");
      } catch (error) {
            next(error);
      }
};

export const postStart = async (
      req: Request,
      res: Response,
      next: NextFunction
) => {
      try {
            await app.p2pServer.startKeygen();
            res.status(200).json();
      } catch (error) {
            console.log(error);
            next(error);
      }
};
