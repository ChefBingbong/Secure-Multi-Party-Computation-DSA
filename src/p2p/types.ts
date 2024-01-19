import { IncomingMessage } from "http";
import * as net from "net";
import { Server, WebSocket } from "ws";
import config from "../config/config";

export interface P2PNetwork {
      connections: Map<string, WebSocket>;
      // neighbors: Map<string, string>;
      NODE_ID: string;

      listen(port: number, ports: number[], cb?: () => void): (cb?: any) => net.Server;
      connect: (ip: string, port: number, cb?: () => void) => void;
      close: (cb: () => void) => void;
      broadcast: (message: any, id?: string, origin?: string, ttl?: number) => void;
      sendDirect: (destination: any, message: any, id?: string, origin?: string, ttl?: number) => void;
      on: (event: string, listener: (...args: any[]) => void) => void;
      off: (event: string, listener: (...args: any[]) => void) => void;
}

export interface Message {
      type: string;
      data?: { nodeId: string };
      message?: any;
      id?: string;
      origin?: string;
      destination?: string;
      ttl?: number;
}

export enum MESSAGE_TYPE {
      chain = "CHAIN",
      block = "BLOCK",
      transaction = "TRANSACTION",
      clear_transactions = "CLEAR_TRANSACTIONS",
      prepare = "PREPARE",
      pre_prepare = "PRE-PREPARE",
      commit = "COMMIT",
      round_change = "ROUND_CHANGE",
      keygenDirectMessageHandler = "keygenDirectMessageHandler",
      keygenInit = "keygenInit",
      keygenRoundHandler = "keygenRoundHandler",
      LeaderElection = "LeaderElection",
      LeaderVote = "LeaderVote",
      SetNewLeader = "SetNewLeader",
      KeygenTransaction = "KeygenTransaction",
}

export const NetworkMessages: { [x: string]: string } = {
      [MESSAGE_TYPE.chain]: `${config.p2pPort} sending chain`,
      [MESSAGE_TYPE.SetNewLeader]: `${config.p2pPort} is updating leader`,
      [MESSAGE_TYPE.LeaderVote]: `${config.p2pPort} voted`,
      [MESSAGE_TYPE.LeaderElection]: `${config.p2pPort} is starting a new leader election`,
      [MESSAGE_TYPE.transaction]: `${config.p2pPort} broadcasting transaction`,
      [MESSAGE_TYPE.pre_prepare]: `${config.p2pPort} broadcasting pre-prepared block`,
      [MESSAGE_TYPE.prepare]: `${config.p2pPort} broadcasting prepared block`,
      [MESSAGE_TYPE.commit]: `${config.p2pPort} broadcasting block commit`,
      [MESSAGE_TYPE.round_change]: `${config.p2pPort} broadcasting new leader election`,
};

export interface NetworkMessageDirect<T> {
      message: string;
      type: string;
      data?: T;
      senderNode?: string;
}

export interface NetworkMessageBroadcast<T> extends NetworkMessageDirect<T> {
      destination: string;
}
