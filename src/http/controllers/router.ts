import { NextFunction, Request, Response } from "express";
import { app, startKeygen } from "../../protocol";
import P2pServer from "../../p2p/server";
import config from "../../config/config";

export const getRoot = (req: Request, res: Response) => {
      res.status(200).send({ result: "ok" });
};

export const getValidators = (req: Request, res: Response, next: NextFunction) => {
      try {
            const partyIds = P2pServer.getAllValidators();
            res.status(200).json({ partyIds });
      } catch (error) {
            next(error);
      }
};

export const getDirectMessages = (req: Request, res: Response, next: NextFunction) => {
      try {
            const roundId = Number(req.query.roundId?.toString());
            const directMessages = app.p2pServer.validator.getDirectMessages(roundId);
            res.status(200).json({ directMessages });
      } catch (error) {
            next(error);
      }
};

export const getMessages = (req: Request, res: Response, next: NextFunction) => {
      try {
            const roundId = Number(req.query.roundId?.toString());
            const messages = app.p2pServer.validator.getMessages(roundId);
            res.status(200).json({ messages });
      } catch (error) {
            next(error);
      }
};

export const postDirectMessage = (req: Request, res: Response, next: NextFunction) => {
      try {
            app.p2pServer.sendDirect(req.body.id, {
                  type: "direct-message",
                  message: `recieved message from node ${config.p2pPort}`,
            });
            res.send("success");
      } catch (error) {
            next(error);
      }
};

export const postBroadcast = (req: Request, res: Response, next: NextFunction) => {
      try {
            app.p2pServer.broadcast({
                  type: "broadcast-message",
                  message: `recieved message from node ${config.p2pPort}`,
                  // nodeId: config.p2pPort,
            });
            res.send("success");
      } catch (error) {
            next(error);
      }
};

export const postStart = async (req: Request, res: Response, next: NextFunction) => {
      try {
            await app.p2pServer.startKeygen();
            res.status(200).json();
      } catch (error) {
            console.log(error);
            next(error);
      }
};
