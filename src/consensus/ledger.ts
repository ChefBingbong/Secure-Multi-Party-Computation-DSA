import { Logger } from "winston";
import { redisClient } from "../db/redis";
import { ErrorWithCode, ProtocolError } from "../utils/errors";
import Wallet from "../wallet/wallet";
import Block from "./block";

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
      private logger: Logger;

      constructor(logger: Logger) {
            this.logger = logger;
            this.chain = [Block.genesis()];
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

      public resetState = (): void => {
            this.chain = [Block.genesis()];
      };
}

export default Blockchain;
