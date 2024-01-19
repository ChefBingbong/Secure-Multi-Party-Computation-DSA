import { Logger } from "winston";
import { redisClient } from "../db/redis";
import { MESSAGE_TYPE, delay } from "../p2p/server";
import { app } from "../protocol";
import { KeygenSessionManager } from "../protocol/keygenProtocol";
import { ServerMessage } from "../protocol/types";
import Validator from "../protocol/validators/validator";
import { ValidatorsGroup } from "../protocol/validators/validators";
import { ErrorWithCode, ProtocolError } from "../utils/errors";
import Transaction from "../wallet/transaction";
import TransactionPool from "../wallet/transactionPool";
import Wallet from "../wallet/wallet";
import Block from "./block";
import BlockPool from "./pBft/blockPool";
import CommitPool, { CommitMessage } from "./pBft/messagePools/commitPool";
import MessagePool, { RoundChangeMessage } from "./pBft/messagePools/messagePool";
import PreparePool, { PrepareMessage } from "./pBft/messagePools/preparePool";

export type GenericPBFTMessage = PrepareMessage & CommitMessage & RoundChangeMessage & Block & Transaction<any>;

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
            this.logger.info(`PROPOSING BLOCK`);
            console.log(block);
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
                  if (!leader || ValidatorsGroup.getAllKeys().publickKeys.includes(leader)) {
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
                  this.handleStateUpdate<string>(MESSAGE_TYPE.LeaderElection, leader);
            } catch (error) {
                  this.handleStateUpdate<string>(MESSAGE_TYPE.SetNewLeader, leader);
            }
      };

      public resetState = async () => {
            this.chain = [Block.genesis()];
            await redisClient.setSignleData<any>("chain", this.chain);
      };

      public handleMessage = async <Type extends ServerMessage<GenericPBFTMessage>>(data: Type) => {
            switch (data.type) {
                  case MESSAGE_TYPE.transaction:
                        this.handleNewTransaction(data.data as Transaction<any>);
                        break;
                  case MESSAGE_TYPE.pre_prepare:
                        this.handleNewBlockPrePrepare(data.data as Block);
                        break;
                  case MESSAGE_TYPE.prepare:
                        this.handleNewBlockPrepare(data.data as PrepareMessage);
                        break;
                  case MESSAGE_TYPE.commit:
                        this.handleNewBlockCommit(data.data as CommitMessage);
                        break;
                  case MESSAGE_TYPE.round_change:
                        this.handleNewRoundChange(data.data as RoundChangeMessage);
                        break;
                  default:
                        break;
            }
      };

      private handleNewTransaction = (transaction: Transaction<any>) => {
            if (
                  !this.transactionPool.transactionExists(transaction) &&
                  this.transactionPool.verifyTransaction(transaction) &&
                  ValidatorsGroup.isValidValidator(transaction.from)
            ) {
                  try {
                        let thresholdReached = this.transactionPool.addTransaction(transaction);
                        if (!thresholdReached) return;

                        this.handleStateUpdate<Transaction<any>>(MESSAGE_TYPE.transaction, transaction);
                        if (
                              ValidatorsGroup.getPublickKeyFromNodeId(this.leader) == this.validator.getPublicKey()
                        ) {
                              let block = this.createBlock(this.transactionPool.transactions, this.validator);
                              this.handleStateUpdate<Block>(MESSAGE_TYPE.pre_prepare, block);
                        }
                  } catch (error) {
                        throw new ErrorWithCode(`error handling new transaction`, ProtocolError.INTERNAL_ERROR);
                  }
            }
      };

      private handleNewBlockPrePrepare = (block: Block) => {
            if (!this.blockPool.existingBlock(block) && this.isValidBlock(block)) {
                  try {
                        this.blockPool.addBlock(block);
                        this.handleStateUpdate<Block>(MESSAGE_TYPE.pre_prepare, block);

                        let prepare = this.preparePool.message(block, this.validator);
                        this.handleStateUpdate<PrepareMessage>(MESSAGE_TYPE.prepare, prepare);
                  } catch (error) {
                        throw new ErrorWithCode(
                              `error handling new pre-prepareed block`,
                              ProtocolError.INTERNAL_ERROR
                        );
                  }
            }
      };

      private handleNewBlockPrepare = (prepare: PrepareMessage) => {
            if (
                  !this.preparePool.existingMessage(prepare) &&
                  this.preparePool.isValidMessage(prepare) &&
                  ValidatorsGroup.isValidValidator(prepare.publicKey)
            ) {
                  try {
                        if (
                              !this.preparePool.existingMessage(prepare) &&
                              this.preparePool.isValidMessage(prepare) &&
                              ValidatorsGroup.isValidValidator(prepare.publicKey)
                        ) {
                              this.preparePool.addMessage(prepare);
                              this.handleStateUpdate<PrepareMessage>(MESSAGE_TYPE.prepare, prepare);
                              if (this.preparePool.list[prepare.blockHash].length < MIN_APPROVALS) return;

                              let commit = this.commitPool.message(prepare, this.validator);
                              this.handleStateUpdate<CommitMessage>(MESSAGE_TYPE.commit, commit);
                        }
                  } catch (error) {
                        throw new ErrorWithCode(
                              `error handling new prepareed block`,
                              ProtocolError.INTERNAL_ERROR
                        );
                  }
            }
      };

      private handleNewBlockCommit = (commit: CommitMessage) => {
            if (
                  !this.commitPool.existingMessage(commit) &&
                  this.commitPool.isValidMessage(commit) &&
                  ValidatorsGroup.isValidValidator(commit.publicKey)
            ) {
                  try {
                        this.commitPool.addMessage(commit);
                        this.handleStateUpdate<CommitMessage>(MESSAGE_TYPE.commit, commit);
                        if (this.commitPool.list[commit.blockHash].length < MIN_APPROVALS) return;

                        this.addUpdatedBlock(commit.blockHash, this.blockPool, this.preparePool, this.commitPool);

                        let message = this.messagePool.createMessage(
                              this.chain[this.chain.length - 1].hash,
                              this.validator
                        );
                        this.handleStateUpdate<RoundChangeMessage>(MESSAGE_TYPE.round_change, message);
                  } catch (error) {
                        throw new ErrorWithCode(`error handling new block commit`, ProtocolError.INTERNAL_ERROR);
                  }
            }
      };

      private handleNewRoundChange = async (message: RoundChangeMessage) => {
            if (
                  !this.messagePool.existingMessage(message) &&
                  this.messagePool.isValidMessage(message) &&
                  ValidatorsGroup.isValidValidator(message.publicKey)
            ) {
                  try {
                        this.messagePool.addMessage(message);
                        this.handleStateUpdate<RoundChangeMessage>(MESSAGE_TYPE.round_change, message);
                        if (this.messagePool.list[message.blockHash].length < MIN_APPROVALS) return;

                        await delay(500);
                        if (
                              this.validator.nodeId === this.leader &&
                              this.transactionPool.transactions.length > 0
                        ) {
                              this.electNewLeader();
                              this.logger.info(`CREATED BLOCK.. ELECTING NEW LEADER`);
                        }
                        this.transactionPool.clear();
                  } catch (error) {
                        throw new ErrorWithCode(`error handling new round change`, ProtocolError.INTERNAL_ERROR);
                  }
            }
      };

      public handleStateUpdate = <State>(stateType: MESSAGE_TYPE, newState: State) => {
            switch (stateType) {
                  case MESSAGE_TYPE.transaction:
                        app.p2pServer.buildAndSendNetworkMessage<State>({
                              type: "BROADCAST",
                              data: { type: MESSAGE_TYPE.transaction, data: newState },
                        });
                        break;
                  case MESSAGE_TYPE.round_change:
                        app.p2pServer.buildAndSendNetworkMessage<State>({
                              type: "BROADCAST",
                              data: { type: MESSAGE_TYPE.round_change, data: newState },
                        });
                        break;

                  case MESSAGE_TYPE.commit:
                        app.p2pServer.buildAndSendNetworkMessage<State>({
                              type: "BROADCAST",
                              data: { type: MESSAGE_TYPE.commit, data: newState },
                        });
                        break;

                  case MESSAGE_TYPE.prepare:
                        app.p2pServer.buildAndSendNetworkMessage<State>({
                              type: "BROADCAST",
                              data: { type: MESSAGE_TYPE.prepare, data: newState },
                        });
                        break;

                  case MESSAGE_TYPE.pre_prepare:
                        app.p2pServer.buildAndSendNetworkMessage<State>({
                              type: "BROADCAST",
                              data: { type: MESSAGE_TYPE.pre_prepare, data: newState },
                        });
                        break;

                  case MESSAGE_TYPE.LeaderElection:
                        app.p2pServer.buildAndSendNetworkMessage<State>({
                              type: "BROADCAST",
                              data: {
                                    type: MESSAGE_TYPE.LeaderElection,
                                    data: newState,
                              },
                        });
                        break;

                  case MESSAGE_TYPE.SetNewLeader:
                        app.p2pServer.buildAndSendNetworkMessage<State>({
                              type: "BROADCAST",
                              data: {
                                    type: MESSAGE_TYPE.SetNewLeader,
                                    data: newState,
                              },
                        });
                        break;

                  default:
                        console.log(stateType);
                        throw new ErrorWithCode(`unsupported state update type`, ProtocolError.PARAMETER_ERROR);
            }
      };
}

export default Blockchain;
