import { NextFunction, Request, Response } from "express";
import config from "../../config/config";
import { MESSAGE_TYPE } from "../../p2p/types";
import { app } from "../..";
import Validator from "../../p2p/validators/validator";
import { ValidatorsGroup } from "../../p2p/validators/validators";
import Transaction from "../../wallet/transaction";
import { SigningSessionManager } from "../../protocol/signingProtocol";

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
      const { from, proof, type, override } = req.body;
      const transaction = app.p2pServer.validator.createTransaction(
            from,
            proof,
            type,
            app.p2pServer.transactionPool,
            override
      );
      const data = { type: MESSAGE_TYPE.transaction, data: transaction };
      app.p2pServer.buildAndSendNetworkMessage<Transaction<any>>({ type: "BROADCAST", data });
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
            const leader = await app.p2pServer.chain.leader;
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

export const postStartSignSession = async (req: Request, res: Response, next: NextFunction) => {
      try {
            await app.p2pServer.startSignSession();
            res.status(200).json();
      } catch (error) {
            console.log(error);
            next(error);
      }
};

export const postElectLeader = async (req: Request, res: Response, next: NextFunction) => {
      try {
            await app.p2pServer.chain.electNewLeader();
            res.status(200).json();
      } catch (error) {
            console.log(error);
            next(error);
      }
};

export const resetState = async (req: Request, res: Response, next: NextFunction) => {
      try {
            await app.p2pServer.chain.resetState();
            res.status(200).json();
      } catch (error) {
            console.log(error);
            next(error);
      }
};
