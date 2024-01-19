import { Logger } from "winston";
import { redisClient } from "../db/redis";
import { ErrorWithCode, ProtocolError } from "../utils/errors";
import Wallet from "../wallet/wallet";
import Block from "./block";
import BlockPool from "./pBft/blockPool";
import PreparePool, { PrepareMessage } from "./pBft/preparePool";
import CommitPool, { CommitMessage } from "./pBft/commitPool";
import { MESSAGE_TYPE, delay } from "../p2p/server";
import MessagePool, { RoundChangeMessage } from "./pBft/messagePool";
import TransactionPool from "../wallet/transactionPool";
import { ValidatorsGroup } from "../protocol/validators/validators";
import { app } from "../protocol";
import Validator from "../protocol/validators/validator";
import config from "../config/config";
import Transaction from "../wallet/transaction";
import { KeygenSessionManager } from "../protocol/keygenProtocol";
import { MESSAGE_TYPES } from "../protocol/utils/utils";

export interface BlockchainInterface {
      addBlock(data: any): Promise<Block>;
      createBlock(transactions: any, wallet: Wallet): Block;
      isValidChain(chain: Block[]): boolean;
      replaceChain(newChain: Block[]): Promise<void>;
      isValidBlock(block: Block): boolean;
}
const MIN_APPROVALS = 2 * (3 / 3) + 0;
class Blockchain implements BlockchainInterface {
      public chain: Block[];
      public leader: string;
      public validators: string[];
      public validator: Validator;
      public transactionPool: TransactionPool;
      public blockPool: BlockPool;
      public preparePool: PreparePool;
      public commitPool: CommitPool;
      public messagePool: MessagePool;
      private logger: Logger;

      constructor(logger: Logger, transactionPool: TransactionPool, validators: string[], validator: Validator) {
            this.logger = logger;
            this.chain = [Block.genesis()];
            this.validators = validators;
            this.validator = validator;
            this.transactionPool = transactionPool;
            this.blockPool = new BlockPool();
            this.preparePool = new PreparePool();
            this.commitPool = new CommitPool();
            this.messagePool = new MessagePool();
      }

      public async addBlock(block: any): Promise<Block> {
            try {
                  this.chain.push(block);
                  await redisClient.setSignleData<any>("chain", this.chain);

                  return block;
            } catch (error) {
                  throw new ErrorWithCode(
                        `Errored interbnally: Failed to create genesis block`,
                        ProtocolError.INTERNAL_ERROR
                  );
            }
      }

      public createBlock(transactions: any, wallet: Wallet): Block {
            const block = Block.createBlock(this.chain[this.chain.length - 1], transactions, wallet);
            return block;
      }

      public isValidChain(chain: Block[]): boolean {
            if (JSON.stringify(chain[0]) !== JSON.stringify(Block.genesis())) {
                  this.logger.log(`info`, `the current geneisis state doest not match the orginal`);
                  return false;
            }
            for (let chainIndex = 1; chainIndex < chain.length; chainIndex++) {
                  const block = chain[chainIndex];
                  const lastBlock = chain[chainIndex - 1];

                  if (block.lastHash !== lastBlock.hash || block.hash !== Block.blockHash(block)) {
                        this.logger.log(`info`, `chain not valid. Data between blockcks does not match`);
                        return false;
                  }
            }
            return true;
      }

      public addUpdatedBlock(
            hash: string,
            blockPool: BlockPool,
            preparePool: PreparePool,
            commitPool: CommitPool
      ) {
            let block = blockPool.getBlock(hash);
            block.prepareMessages = preparePool.list[hash];
            block.commitMessages = commitPool.list[hash];
            this.addBlock(block);
      }

      public async replaceChain(newChain: Block[]): Promise<void> {
            try {
                  if (newChain.length <= this.chain.length) {
                        this.logger.log(`info`, `Received chain is not longer than the current chain`);
                        return;
                  }
                  if (!this.isValidChain(newChain)) {
                        this.logger.log(`info`, `Received chain is invalid`);
                        return;
                  }
                  // this.chain.executeChain(newChain);
                  this.chain = newChain;
                  await redisClient.setSignleData<any>("chain", newChain);
            } catch (error) {
                  throw new ErrorWithCode(
                        `Errored interbnally: Failed to replace and sync chain`,
                        ProtocolError.INTERNAL_ERROR
                  );
            }
      }

      public isValidBlock(block: Block): boolean {
            const lastBlock = this.chain[this.chain.length - 1];
            if (
                  lastBlock.sequenceNumber + 1 == block.sequenceNumber &&
                  block.lastHash === lastBlock.hash &&
                  block.hash === Block.blockHash(block) &&
                  Block.verifyBlock(block) &&
                  Block.verifyLeader(block, ValidatorsGroup.getPublickKeyFromNodeId(this.leader))
            ) {
                  console.log("BLOCK VALID");
                  return true;
            }
            console.log("BLOCK VALID");
            return false;
      }

      public electNewLeader = async () => {
            let leader = this.leader ?? (await redisClient.getSingleData<string>("leader"));
            try {
                  if (!leader) {
                        leader = this.validator.nodeId;
                        await redisClient.setSignleData("leader", leader);
                  } else {
                        await redisClient.setSignleData("leader", leader);
                  }
                  if (KeygenSessionManager.sessionInitialized) {
                        throw new Error(`cannot elect a new leader while a session is active`);
                  }
                  if (this.validator.nodeId !== leader) {
                        throw new Error(`election can only be started by previous rounds leader`);
                  }

                  app.p2pServer.broadcast({
                        message: `${this.validator.nodeId} is starting a new leader election`,
                        type: MESSAGE_TYPES.LeaderElection,
                        senderNode: leader,
                  });
            } catch (error) {
                  app.p2pServer.broadcast({
                        message: `${this.validator.nodeId} is updating leader`,
                        type: MESSAGE_TYPES.SetNewLeader,
                        data: { newLeader: leader },
                  });
            }
      };

      public resetState = async () => {
            this.chain = [Block.genesis()];
            await redisClient.setSignleData<any>("chain", this.chain);
      };

      public handleMessage = async (data: any, nodeId: string) => {
            try {
                  if (data.type === MESSAGE_TYPE.transaction) {
                        const Data = JSON.parse(data.data);
                        const transaction = Data.transaction;
                        if (
                              !this.transactionPool.transactionExists(transaction) &&
                              this.transactionPool.verifyTransaction(transaction) &&
                              ValidatorsGroup.isValidValidator(transaction.from)
                        ) {
                              let thresholdReached = this.transactionPool.addTransaction(transaction);
                              this.sendTransaction(transaction, this.validator.nodeId);

                              if (thresholdReached) {
                                    console.log("THRESHOLD REACHED");
                                    if (
                                          ValidatorsGroup.getPublickKeyFromNodeId(this.leader) ==
                                          this.validator.getPublicKey()
                                    ) {
                                          console.log("PROPOSING BLOCK");
                                          let block = this.createBlock(
                                                this.transactionPool.transactions,
                                                this.validator
                                          );
                                          console.log("CREATED BLOCK", block);
                                          await delay(500);
                                          this.broadcastPrePrepare(block, this.validator.nodeId);
                                    }
                              } else {
                                    console.log("Transaction Added");
                              }
                        }
                  } else if (data.type === MESSAGE_TYPE.pre_prepare) {
                        const block = data.data.block;
                        if (!this.blockPool.existingBlock(block) && this.isValidBlock(block)) {
                              this.blockPool.addBlock(block);

                              await delay(500);
                              this.broadcastPrePrepare(block, this.validator.nodeId);
                              let prepare = this.preparePool.prepare(block, this.validator);
                              await delay(500);

                              this.broadcastPrepare(prepare, this.validator.nodeId);
                        }
                  } else if (data.type === MESSAGE_TYPE.prepare) {
                        const prepare = data.data.prepare;
                        console.log(
                              !this.preparePool.existingPrepare(prepare),
                              this.preparePool.isValidPrepare(prepare),
                              ValidatorsGroup.isValidValidator(prepare.publicKey)
                        );
                        if (
                              !this.preparePool.existingPrepare(prepare) &&
                              this.preparePool.isValidPrepare(prepare) &&
                              ValidatorsGroup.isValidValidator(prepare.publicKey)
                        ) {
                              this.preparePool.addPrepare(prepare);
                              this.broadcastPrepare(prepare, this.validator.nodeId);

                              console.log(this.preparePool.list[prepare.blockHash]?.length, MIN_APPROVALS);
                              if (this.preparePool.list[prepare.blockHash].length >= MIN_APPROVALS) {
                                    let commit = this.commitPool.commit(prepare, this.validator);
                                    await delay(500);

                                    this.broadcastCommit(commit, this.validator.nodeId);
                              }
                        }
                  } else if (data.type === MESSAGE_TYPE.commit) {
                        const commit = data.data.commit;
                        if (
                              !this.commitPool.existingCommit(commit) &&
                              this.commitPool.isValidCommit(commit) &&
                              ValidatorsGroup.isValidValidator(commit.publicKey)
                        ) {
                              this.commitPool.addCommit(commit);
                              this.broadcastCommit(commit, this.validator.nodeId);

                              if (this.commitPool.list[commit.blockHash].length >= MIN_APPROVALS) {
                                    this.addUpdatedBlock(
                                          commit.blockHash,
                                          this.blockPool,
                                          this.preparePool,
                                          this.commitPool
                                    );
                              }

                              let message = this.messagePool.createMessage(
                                    this.chain[this.chain.length - 1].hash,
                                    this.validator
                              );
                              this.broadcastRoundChange(message, this.validator.nodeId);
                        }
                  } else if (data.type === MESSAGE_TYPE.round_change) {
                        const message = data.data.message;
                        if (
                              !this.messagePool.existingMessage(message) &&
                              this.messagePool.isValidMessage(message) &&
                              ValidatorsGroup.isValidValidator(message.publicKey)
                        ) {
                              this.messagePool.addMessage(message);
                              this.broadcastRoundChange(message, this.validator.nodeId);

                              console.log(this.messagePool.list[message.blockHash].length);
                              if (this.messagePool.list[message.blockHash].length >= MIN_APPROVALS) {
                                    console.log("CLEARED POOL");
                                    this.transactionPool.clear();
                              }
                        }
                  }
            } catch (error) {
                  console.log(error);
            }
      };

      public sendChain = (nodeId: string) => {
            app.p2pServer.sendDirect(nodeId, {
                  message: `${nodeId} sending chain`,
                  type: MESSAGE_TYPE.chain,
                  data: JSON.stringify({
                        chain: this.chain,
                  }),
            });
      };

      public syncChain = (nodeId: string) => {
            app.p2pServer.broadcast({
                  message: `${nodeId} sending chain`,
                  type: MESSAGE_TYPE.chain,
                  data: JSON.stringify({
                        chain: this.chain,
                  }),
            });
      };

      public sendTransaction = (transaction: Transaction<any>, nodeId: string) => {
            app.p2pServer.broadcast({
                  message: `${nodeId} sending transaction`,
                  type: MESSAGE_TYPE.transaction,
                  data: JSON.stringify({
                        transaction: transaction,
                  }),
            });
      };

      public sendBlock = (block: Block, nodeId: string) => {
            app.p2pServer.broadcast({
                  message: `${nodeId} sending block`,
                  type: MESSAGE_TYPE.block,
                  data: JSON.stringify({
                        block: block,
                  }),
            });
      };

      // broadcasts preprepare
      broadcastPrePrepare(block: Block, nodeId: string) {
            app.p2pServer.broadcast({
                  message: `${nodeId} broadcasting pre-prepared block`,
                  type: MESSAGE_TYPE.pre_prepare,
                  data: { block: block },
            });
      }

      // broadcast prepare
      public broadcastPrepare(prepare: PrepareMessage, nodeId: string) {
            console.log("hey");
            app.p2pServer.broadcast({
                  message: `${nodeId} broadcasting prepared block`,
                  type: MESSAGE_TYPE.prepare,
                  data: {
                        prepare: prepare,
                  },
            });
      }

      // broadcasts commit
      public broadcastCommit(commit: CommitMessage, nodeId: string) {
            app.p2pServer.broadcast({
                  message: `${nodeId} broadcasting commit block`,
                  type: MESSAGE_TYPE.commit,
                  data: {
                        commit: commit,
                  },
            });
      }

      public broadcastRoundChange(message: RoundChangeMessage, nodeId: string) {
            app.p2pServer.broadcast({
                  message: `${nodeId} broadcasting round change block`,
                  type: MESSAGE_TYPE.round_change,
                  data: {
                        message: message,
                  },
            });
      }
}

export default Blockchain;
