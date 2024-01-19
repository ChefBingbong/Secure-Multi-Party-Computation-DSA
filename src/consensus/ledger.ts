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

export interface BlockchainInterface {
      addBlock(data: any): Promise<Block>;
      createBlock(transactions: any, wallet: Wallet): Block;
      isValidChain(chain: Block[]): boolean;
      replaceChain(newChain: Block[]): Promise<void>;
      isValidBlock(block: Block): boolean;
}

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

      public async addBlock(data: any): Promise<Block> {
            try {
                  const initialNode = new Wallet("initial node");
                  const block = Block.createBlock(this.chain[this.chain.length - 1], data, initialNode);

                  this.chain = [...this.chain, block];
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
                  // this.executeChain(newChain);
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
                  block.lastHash !== lastBlock.hash ||
                  block.hash !== Block.blockHash(block) ||
                  !Block.verifyBlock(block) ||
                  !Block.verifyLeader(block, this.leader)
            )
                  return false;
            this.addBlock(block);
            console.log("block added");
            return true;
      }

      public resetState = async () => {
            this.chain = [Block.genesis()];
            await redisClient.setSignleData<any>("chain", this.chain);
      };

      public handleMessage = async (data: any, nodeId: string) => {
            if (data.type === MESSAGE_TYPE.transaction) {
                  const Data = JSON.parse(data.data);
                  const transaction = Data.transaction;
                  if (
                        !this.transactionPool.transactionExists(transaction) &&
                        this.transactionPool.verifyTransaction(transaction) &&
                        ValidatorsGroup.isValidValidator(transaction.input.from)
                  ) {
                        let thresholdReached = this.transactionPool.addTransaction(transaction);
                        this.sendTransaction(transaction, config.p2pPort);

                        if (thresholdReached) {
                              console.log("THRESHOLD REACHED");

                              if (this.leader == this.validator.getPublicKey()) {
                                    console.log("PROPOSING BLOCK");
                                    let block = this.createBlock(
                                          this.transactionPool.transactions,
                                          this.validator
                                    );
                                    console.log("CREATED BLOCK", block);
                                    this.broadcastPrePrepare(block, config.p2pPort);
                              }
                        } else {
                              console.log("Transaction Added");
                        }
                  }
            } else if (data.type === MESSAGE_TYPE.pre_prepare) {
                  console.log("haaaaaaaaaa");
                  // console.log(!this.blockPool.existingBlock(block) && this.isValidBlock(block));
                  const block = data.data.block;
                  // console.log(!this.blockPool.existingBlock(block) && this.isValidBlock(block));

                  if (!this.blockPool.existingBlock(block) && this.isValidBlock(block)) {
                        console.log("yoooo");

                        this.blockPool.addBlock(block);
                        console.log("yoooo");
                        this.broadcastPrePrepare(block, config.p2pPort);
                        let prepare = this.preparePool.prepare(block, this.validator);
                        await delay(500);
                        // this.broadcastPrepare(prepare, nodeId);
                  }
            } else if (data.type === MESSAGE_TYPE.prepare) {
                  const prepare = data.data.prepare;
                  console.log(prepare);
                  if (
                        !this.preparePool.existingPrepare(prepare) &&
                        this.preparePool.isValidPrepare(prepare) &&
                        ValidatorsGroup.isValidValidator(prepare.publicKey)
                  ) {
                        this.preparePool.addPrepare(prepare);
                        // await delay(500);
                        // this.broadcastPrepare(prepare, nodeId);

                        // if (
                        //       this.preparePool.list[prepare.blockHash].length >=
                        //       2 * (this.validators.length / 3) + 1
                        // ) {
                        //       let commit = this.commitPool.commit(prepare, this.validator);
                        //       this.broadcastCommit(commit, nodeId);
                        // }
                  }
            } else if (data.type === MESSAGE_TYPE.commit) {
                  const commit = data.data.commit;
                  if (
                        !this.commitPool.existingCommit(commit) &&
                        this.commitPool.isValidCommit(commit) &&
                        ValidatorsGroup.isValidValidator(commit.publicKey)
                  ) {
                        this.commitPool.addCommit(commit);
                        this.broadcastCommit(commit, config.p2pPort);

                        if (
                              this.commitPool.list[commit.blockHash].length >=
                              2 * (this.validators.length / 3) + 1
                        ) {
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
                        this.broadcastRoundChange(message, config.p2pPort);
                  }
            } else if (data.type === MESSAGE_TYPE.round_change) {
                  const message = data.data.message;
                  if (
                        !this.messagePool.existingMessage(message) &&
                        this.messagePool.isValidMessage(message) &&
                        ValidatorsGroup.isValidValidator(message.publicKey)
                  ) {
                        this.messagePool.addMessage(message);
                        this.broadcastRoundChange(message, config.p2pPort);

                        if (
                              this.messagePool.list[message.blockHash].length >=
                              2 * (this.validators.length / 3) + 1
                        ) {
                              this.transactionPool.clear();
                        }
                  }
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
                  message: `${nodeId} broadcasting commit block`,
                  type: MESSAGE_TYPE.round_change,
                  data: {
                        message: message,
                  },
            });
      }
}

export default Blockchain;
