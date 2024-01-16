import * as net from "net";
import { v4 } from "uuid";
import { Logger } from "winston";
import config from "../config/config";
import { redisClient } from "../db/redis";
import { AppLogger } from "../http/middleware/logger";
import Blockchain from "../ledger/ledger";
import { KeygenSessionManager } from "../protocol/keygenProtocol";
import { ServerDirectMessage, ServerMessage } from "../protocol/types";
import { MESSAGE_TYPES } from "../protocol/utils/utils";
import Validator from "../protocol/validators/validator";
import { ValidatorsGroup } from "../protocol/validators/validators";
import TransactionPool from "../wallet/transactionPool";
import Wallet from "../wallet/wallet";
import { P2PNetworkEventEmitter } from "./eventEmitter";
import { P2PNetwork } from "./types";

const MESSAGE_TYPE = {
      chain: "CHAIN",
      block: "BLOCK",
      transaction: "TRANSACTION",
      clear_transactions: "CLEAR_TRANSACTIONS",
};
// const root = protobuf.loadSync("../../types_pb");

// // Obtain the message type
// const YourMessageType = root.lookupType("YourMessageType");

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class P2pServer extends AppLogger implements P2PNetwork {
      public readonly connections: Map<string, net.Socket>;
      public readonly NODE_ID: string;
      public readonly neighbors: Map<string, string>;
      public readonly validator: Validator = new Validator();
      public validators: string[];
      public chain: Blockchain;
      public wallet: Wallet;
      public transactionPool: TransactionPool;

      public static leader: string;
      public votes: { voter: string; vote: string }[];

      public threshold: number;
      private readonly emitter: P2PNetworkEventEmitter;
      private log: Logger;
      private server: net.Server;
      private seenMessages: Set<string> = new Set();
      private isInitialized: boolean = false;

      constructor() {
            super();
            this.connections = new Map();
            this.neighbors = new Map();
            this.NODE_ID = config.p2pPort;
            this.emitter = new P2PNetworkEventEmitter(false);
            this.emitter.on.bind(this.emitter);
            this.emitter.off.bind(this.emitter);
            this.votes = [];
            this.log = this.getLogger("p2p-log");
            this.server = net.createServer((socket: net.Socket) => this.handleNewSocket(socket));
            this.updateReplica(Number(this.NODE_ID), "CONNECT");
            new ValidatorsGroup(this.validator.toString());

            this.chain = new Blockchain(this.log);
            this.transactionPool = new TransactionPool();

            new KeygenSessionManager(this.validator);

            this.initState();
      }

      private async updateReplica(p: number, type: "DISCONNECT" | "CONNECT"): Promise<void> {
            let peers = await redisClient.getSingleData<number[]>("validators");
            let leader = await redisClient.getSingleData<string>("leaderPublic");

            if (!peers) {
                  await redisClient.setSignleData("validators", [p]);
                  peers = [p];
            }
            if (!leader) {
                  const { ports, publickKeys } = ValidatorsGroup.getAllKeys();
                  leader = publickKeys[ports.indexOf("6001")];
            }
            if (type === "DISCONNECT")
                  peers = [...peers].filter((value, index, self) => {
                        return self.indexOf(value) === index && value !== p;
                  });
            else
                  peers = [...peers, p].filter((value, index, self) => {
                        return self.indexOf(value) === index;
                  });

            this.chain.leader = leader;
            this.validators = peers.map((p) => p.toString());
            this.threshold = this.validators.length;
      }

      private initState() {
            this.emitter.on("_connect", (connectionId) => {
                  this._send(connectionId.connectionId, {
                        type: "handshake",
                        data: { nodeId: this.validator.toString() },
                  });
            });

            this.emitter.on("_message", async ({ connectionId, message }) => {
                  const { type, data } = message;
                  if (type === "handshake") {
                        const { nodeId } = data;
                        const validatorId = this.extractValidatorHost(nodeId);

                        this.neighbors.set(validatorId, connectionId);
                        ValidatorsGroup.update(validatorId, nodeId);
                        // console.log(this.chain.chain);
                        this.emitter.emitConnect(validatorId, true);
                  }

                  if (type === "message") {
                        const nodeId = this.findNodeId(connectionId);
                        this.emitter.emitMessage(nodeId, data, true);
                  }
            });

            this.emitter.on("_disconnect", (connectionId) => {
                  const nodeId = this.findNodeId(connectionId.connectionId);
                  if (!nodeId) return;

                  this.neighbors.delete(nodeId);
                  ValidatorsGroup.delete(nodeId);
                  this.emitter.emitDisconnect(nodeId, true);
            });

            this.emitter.on("message", ({ nodeId, data: packet }) => {
                  if (this.seenMessages.has(packet.id) || packet.ttl < 1) return;

                  if (packet.type === "broadcast") {
                        if (packet.origin !== this.NODE_ID) {
                              this.emitter.emitBroadcast(packet.message, packet.origin);
                        } else {
                              this.broadcast(packet.message, packet.id, packet.origin, packet.ttl - 1);
                        }
                  }

                  if (packet.type === "direct") {
                        if (packet.destination === this.NODE_ID) {
                              this.emitter.emitDirect(packet.message, packet.origin);
                        } else {
                              this.sendDirect(
                                    packet.destination,
                                    packet.message,
                                    packet.id,
                                    packet.origin,
                                    packet.ttl - 1
                              );
                        }
                  }
            });

            this.isInitialized = true;
      }

      //public methods
      public listen(port: number, ports: number[], cb?: () => void): (cb?: any) => net.Server {
            if (!this.isInitialized) this.throwError(`Cannot listen before server is initialized`);

            this.server.listen(port, "0.0.0.0", () => {
                  this.handlePeerConnection(async (p: number) => {
                        await this.updateReplica(p, "CONNECT");
                        // this.sendChain();
                  });

                  this.handlePeerDisconnect(async (p: number) => {
                        await this.updateReplica(p, "DISCONNECT");

                        if (P2pServer.leader === p.toString()) {
                              await this.electNewLeader();
                        }
                  });

                  this.handleBroadcastMessage(async () => {});
                  this.handleDirectMessage(async () => {});

                  ports.forEach((pot) => {
                        this.connect("127.0.0.1", Number(pot), () => {
                              this.log.info(`Connection to ${pot} established.`);
                        });
                  });
            });
            return (cb) => this.server.close(cb);
      }

      public connect = (ip: string, port: number, cb?: () => void) => {
            const socket = new net.Socket();

            socket.on("error", (err) => {
                  console.error(`Socket connection error: ${err.message}`);
            });
            socket.connect(port, ip, () => {
                  this.handleNewSocket(socket);
                  cb && cb();
            });

            return (cb: Error) => socket.destroy(cb);
      };

      public close = (cb: () => void) => {
            for (let [, socket] of this.connections) socket.destroy();
            this.server.close(cb);
      };

      public on = (event: string, listener: (...args: any[]) => void) => {
            this.emitter.on(event, listener);
      };

      public off = (event: string, listener: (...args: any[]) => void) => {
            this.emitter.on(event, listener);
      };

      public broadcast = (
            message: any,
            id: string = v4(),
            origin: string = this.validator.ID,
            ttl: number = 255
      ) => {
            this.sendPacket({ id, ttl, type: "broadcast", message, origin });
      };

      public sendDirect = (
            destination: string,
            message: any,
            id: string = v4(),
            origin: string = this.validator.ID,
            ttl: number = 255
      ) => {
            this.sendPacket({
                  id,
                  ttl,
                  type: "direct",
                  message,
                  destination,
                  origin,
            });
      };

      private handleNewSocket = (socket: net.Socket, emitConnect = true) => {
            const connectionId = v4();
            this.connections.set(connectionId, socket);
            if (emitConnect) this.emitter.emitConnect(connectionId, false);

            socket.on("error", (err) => {
                  console.error(`Socket connection error: ${err.message}`);
            });

            socket.on("close", () => {
                  this.connections.delete(connectionId);
                  this.emitter.emitDisconnect(connectionId, false);
            });

            socket.on("data", (message) => {
                  const receivedData = JSON.parse(message.toString());
                  this.emitter.emitMessage(connectionId, receivedData, false);
            });
      };

      private _send = (connectionId: string, message: any) => {
            const socket = this.connections.get(connectionId);

            if (!socket) this.throwError(`Attempt to send data to connection that does not exist ${connectionId}`);
            socket.write(Buffer.from(JSON.stringify(message)));
      };

      private findNodeId = (connectionId: string): string | undefined => {
            for (let [nodeId, $connectionId] of this.neighbors) {
                  if (connectionId === $connectionId) {
                        return nodeId;
                  }
            }
            return undefined;
      };

      private extractValidatorHost(inputString) {
            const match = inputString.match(/port:\s*(\d+)/);

            if (match) return match[1];
            return this.validator.ID;
      }

      private send = (nodeId: string, data: any) => {
            const connectionId = this.neighbors.get(nodeId);
            this._send(connectionId, { type: "message", data });
      };

      private sendPacket = (packet: any) => {
            if (packet.type === "direct") {
                  this.send(packet.destination, packet);
                  this.seenMessages.add(packet.id);
            } else {
                  for (const $nodeId of this.neighbors.keys()) {
                        this.send($nodeId, packet);
                        // this.seenMessages.add(packet.id);
                  }
            }
      };

      public sendChain = (nodeId) => {
            this.sendDirect(nodeId, {
                  message: `${nodeId} sending chain`,
                  type: MESSAGE_TYPE.chain,
                  data: JSON.stringify({
                        chain: this.chain.chain,
                  }),
            });
      };

      public syncChain = () => {
            this.broadcast({
                  message: `${this.NODE_ID} sending chain`,
                  type: MESSAGE_TYPE.chain,
                  data: JSON.stringify({
                        chain: this.chain.chain.toString(),
                  }),
            });
      };

      public sendTransaction = (transaction: any) => {
            // console.log(this.chain.getLeader());
            this.broadcast({
                  message: `${this.NODE_ID} sending transaction`,
                  type: MESSAGE_TYPE.transaction,
                  data: JSON.stringify({
                        transaction: transaction,
                  }),
            });
      };

      public sendBlock = (block: any) => {
            this.broadcast({
                  message: `${this.NODE_ID} sending block`,
                  type: MESSAGE_TYPE.block,
                  data: JSON.stringify({
                        block: block,
                  }),
            });
      };

      private throwError = (error: string) => {
            throw new Error(error);
      };

      public static getLeader = async () => {
            const leader = this.leader ?? (await redisClient.getSingleData<string>("leader"));
            if (leader) {
                  this.leader = leader;
                  await redisClient.setSignleData("leader", leader);
            }
            return leader;
      };

      public electNewLeader = async () => {
            let leader = P2pServer.leader ?? (await redisClient.getSingleData<string>("leader"));
            try {
                  if (!leader) {
                        leader = this.NODE_ID;
                        await redisClient.setSignleData("leader", leader);
                  } else {
                        await redisClient.setSignleData("leader", leader);
                  }
                  if (KeygenSessionManager.sessionInitialized) {
                        throw new Error(`cannot elect a new leader while a session is active`);
                  }
                  if (this.NODE_ID !== leader) {
                        throw new Error(`election can only be started by previous rounds leader`);
                  }

                  this.broadcast({
                        message: `${this.NODE_ID} is starting a new leader election`,
                        type: MESSAGE_TYPES.LeaderElection,
                        senderNode: leader,
                  });
            } catch (error) {
                  this.broadcast({
                        message: `${this.NODE_ID} is updating leader`,
                        type: MESSAGE_TYPES.SetNewLeader,
                        data: { newLeader: leader },
                  });
            }
      };

      public startKeygen = async () => {
            let leader = P2pServer.leader ?? (await redisClient.getSingleData<string>("leader"));
            if (!leader || this.NODE_ID !== leader) {
                  throw new Error(`leader has not been initialized or you are not the leader`);
            }
            this.broadcast({
                  message: `${this.NODE_ID} is starting a new keygen session`,
                  type: MESSAGE_TYPES.keygenInit,
            });
      };

      private handlePeerConnection = (callback?: (p: number, type: string) => Promise<void>) => {
            this.on("connect", async ({ nodeId }: { nodeId: string }) => {
                  this.log.info(`New node connected: ${nodeId}`);

                  const chain = await redisClient.getSingleData<any>("chain");
                  if (chain) this.chain.chain = chain;

                  if (nodeId !== this.NODE_ID) {
                        console.log("yayyy");
                        await delay(2000);
                        this.sendChain(nodeId);
                  }
                  await callback(Number(nodeId), "CONNECT");
                  console.log(this.threshold, this.validators);
            });
      };

      private handlePeerDisconnect = (callback?: (p: number, type: string) => Promise<void>) => {
            this.on("disconnect", async ({ nodeId }: { nodeId: string }) => {
                  this.log.info(`Node disconnected: ${nodeId}`);
                  await callback(Number(nodeId), "DISCONNECT");
                  console.log(this.threshold, this.validators);
            });
      };

      private handleBroadcastMessage = (callback?: () => Promise<void>) => {
            this.on("broadcast", async ({ message }: { message: ServerMessage }) => {
                  this.log.info(`${message.message}`);
                  this.validator.messages.set(0, message);

                  if (message.type === MESSAGE_TYPES.keygenRoundHandler) {
                        await KeygenSessionManager.keygenRoundProcessor(message);
                  }
                  if (message.type === MESSAGE_TYPES.keygenInit) {
                        KeygenSessionManager.startNewSession({
                              selfId: this.NODE_ID,
                              partyIds: this.validators,
                              threshold: this.threshold,
                        });

                        await KeygenSessionManager.finalizeCurrentRound(0);
                  }
                  if (message.type === MESSAGE_TYPES.LeaderElection) {
                        let currentLeader = message.senderNode;
                        try {
                              const eligibleLalidators = this.validators.filter((v) => v !== currentLeader);
                              const voteIndex = Math.abs(
                                    Math.floor(Math.random() * eligibleLalidators.length - 1)
                              );

                              if (voteIndex < 0 || voteIndex > eligibleLalidators.length) {
                                    throw new Error(`bad vote index. error in leader election`);
                              }
                              const thisNodesVoteResult = eligibleLalidators[voteIndex];

                              if (!eligibleLalidators.includes(thisNodesVoteResult)) {
                                    throw new Error(`bad vote result. error in leader election`);
                              }

                              this.sendDirect(currentLeader, {
                                    message: `${this.NODE_ID} voted for ${thisNodesVoteResult}`,
                                    type: MESSAGE_TYPES.LeaderVote,
                                    data: { vote: thisNodesVoteResult, validators: eligibleLalidators },
                                    senderNode: this.NODE_ID,
                              });
                        } catch (error) {
                              this.broadcast({
                                    message: `${this.NODE_ID} is updating leader`,
                                    type: MESSAGE_TYPES.SetNewLeader,
                                    data: { newLeader: currentLeader },
                              });
                        }
                  }
                  if (message.type === MESSAGE_TYPES.SetNewLeader) {
                        //@ts-ignore
                        const newLeader = message.data.newLeader;
                        const { ports, publickKeys } = ValidatorsGroup.getAllKeys();
                        const newLeaderPublicKey = publickKeys[ports.indexOf(newLeader)];

                        this.chain.leader = newLeaderPublicKey;
                        P2pServer.leader = newLeader;

                        await redisClient.setSignleData("leader", newLeader);
                        await redisClient.setSignleData("leaderPublic", newLeaderPublicKey);

                        console.log(`the new leader is ${newLeader} ${newLeaderPublicKey}`);
                  }
                  if (message.type === MESSAGE_TYPE.chain) {
                        //@ts-ignore
                        const data = message.data.chain;
                        this.chain.replaceChain(data);
                  }
                  if (message.type === MESSAGE_TYPE.transaction) {
                        //@ts-ignore
                        const data = JSON.parse(message.data);

                        if (!this.transactionPool.transactionExists(data)) {
                              this.transactionPool.addTransaction(data);
                              this.sendTransaction(data);
                        }
                        if (this.transactionPool.thresholdReached()) {
                              if (this.chain.leader == this.validator.getPublicKey()) {
                                    console.log("Creating block");
                                    let block = this.chain.createBlock(
                                          this.transactionPool.transactions,
                                          this.validator
                                    );
                                    this.sendBlock(block);
                              }
                        }
                  }
                  if (message.type === MESSAGE_TYPE.block) {
                        //@ts-ignore
                        const data = JSON.parse(message.data).block;
                        if (this.chain.isValidBlock(data)) {
                              this.sendBlock(data);
                              this.transactionPool.clear();
                        }
                  }
            });
      };

      private handleDirectMessage = (callback?: () => Promise<void>) => {
            this.on("direct", async ({ message }: { message: ServerDirectMessage }) => {
                  this.log.info(`${message.message}`);

                  console.log(message.type, MESSAGE_TYPE.chain);

                  if (message.type === MESSAGE_TYPE.chain) {
                        //@ts-ignore
                        const data = JSON.parse(message.data).chain;
                        console.log(data);
                        this.chain.replaceChain(data);
                  }
                  if (message.type === MESSAGE_TYPES.keygenDirectMessageHandler) {
                        const dm = message.data.directMessages.Data;
                        this.validator.directMessagesMap.set(
                              KeygenSessionManager.currentRound,
                              this.validator.nodeId,
                              dm
                        );
                        await KeygenSessionManager.keygenRoundDirectMessageProcessor(message);
                  }
                  if (message.type === MESSAGE_TYPES.LeaderVote) {
                        let maxVotes = 0;
                        let winner = P2pServer.leader;

                        try {
                              // @ts-ignore
                              const { vote: recievedVote, validators } = message.data;
                              if (!recievedVote || !validators) {
                                    throw new Error(`bad vote result. error in leader election`);
                              }

                              this.votes.push({ voter: message.senderNode, vote: recievedVote });
                              const voters = this.votes.map((vote) => vote.voter);

                              if (validators.every((itemA) => voters.includes(itemA))) {
                                    const voteCount: Record<string, number> = {};
                                    const votes = this.votes.map((vote) => vote.vote);

                                    votes.forEach((v) => (voteCount[v] = voteCount[v] ? voteCount[v] + 1 : 1));
                                    for (const candidate in voteCount) {
                                          if (voteCount[candidate] > maxVotes) {
                                                maxVotes = voteCount[candidate];
                                                winner = candidate;
                                          }
                                    }

                                    this.votes = [];
                                    P2pServer.leader = winner;
                                    await redisClient.setSignleData("leader", winner);
                                    await delay(500);

                                    this.broadcast({
                                          message: `${this.NODE_ID} is updating leader`,
                                          type: MESSAGE_TYPES.SetNewLeader,
                                          data: { newLeader: winner },
                                    });
                              }
                        } catch (error) {
                              P2pServer.leader = winner;
                              this.broadcast({
                                    message: `${this.NODE_ID} is updating leader`,
                                    type: MESSAGE_TYPES.SetNewLeader,
                                    data: { newLeader: winner },
                              });
                        }
                  }
                  await callback();
            });
      };
}

export default P2pServer;
