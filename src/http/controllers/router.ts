import { NextFunction, Request, Response } from "express";
import config from "../../config/config";
import P2pServer from "../../p2p/server";
import { app } from "../../protocol";
import Validator from "../../protocol/validators/validator";
import { ValidatorsGroup } from "../../protocol/validators/validators";

export const getRoot = (req: Request, res: Response) => {
      res.status(200).send({ result: "ok" });
};

export const getBlocks = (req: Request, res: Response) => {
      res.json(app.p2pServer.chain.chain);
};

export const getPublicKey = (req: Request, res: Response) => {
      res.json({ publicKey: app.p2pServer.validator.publicKey });
};

export const getTransactions = (req: Request, res: Response) => {
      res.json(app.p2pServer.transactionPool.transactions);
};

export const createTransaction = (req: Request, res: Response) => {
      const { to, amount, type } = req.body;
      const transaction = app.p2pServer.validator.createTransaction(
            to,
            amount,
            type,
            app.p2pServer.transactionPool
      );
      app.p2pServer.sendTransaction(transaction);
      res.redirect("/transactions");
};

export const getValidators = (req: Request, res: Response, next: NextFunction) => {
      try {
            const partyIds = ValidatorsGroup.getAllValidators();
            const validatorInfo = partyIds.map((info) => Validator.parseWalletInfo(info));
            res.status(200).json({ partyIds: validatorInfo });
      } catch (error) {
            next(error);
      }
};

export const getLeader = async (req: Request, res: Response, next: NextFunction) => {
      try {
            const leader = await P2pServer.getLeader();
            res.status(200).json({ leader });
      } catch (error) {
            next(error);
      }
};

export const getShare = async (req: Request, res: Response, next: NextFunction) => {
      try {
            const leader = app.p2pServer.validator.getShare();
            res.status(200).json({ leader });
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

export const postElectLeader = async (req: Request, res: Response, next: NextFunction) => {
      try {
            await app.p2pServer.electNewLeader();
            res.status(200).json();
      } catch (error) {
            console.log(error);
            next(error);
      }
};
