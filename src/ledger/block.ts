import SHA256 from "crypto-js/sha256";
import ChainUtil from "../utils/chainUtil";

class Block {
      timestamp: number;
      lastHash: string;
      hash: string;
      data: any[];
      validator: string;
      signature: string;

      constructor(
            timestamp: number,
            lastHash: string,
            hash: string,
            data: any[],
            validator?: string,
            signature?: string
      ) {
            this.timestamp = timestamp;
            this.lastHash = lastHash;
            this.hash = hash;
            this.data = data;
            this.validator = validator;
            this.signature = signature;
      }

      toString(): string {
            return `Block - 
        Timestamp : ${this.timestamp}
        Last Hash : ${this.lastHash}
        Hash      : ${this.hash}
        Data      : ${this.data}
        Validator : ${this.validator}
        Signature : ${this.signature}`;
      }

      static genesis(): Block {
            return new this(Date.now(), "----", "genesis-hash", []);
      }

      static createBlock(lastBlock: Block, _data: any, wallet: any): Block {
            let hash;
            const timestamp = Date.now();
            const lastHash = lastBlock.hash;
            const data = [_data];
            hash = Block.hash(timestamp, lastHash, data);
            const validator = wallet.getPublicKey();
            const signature = Block.signBlockHash(hash, wallet);
            return new this(timestamp, lastHash, hash, data, validator, signature);
      }

      static hash(timestamp: number, lastHash: string, data: any[]): string {
            return SHA256(JSON.stringify(`${timestamp}${lastHash}${data}`)).toString();
      }

      static blockHash(block: Block): string {
            const { timestamp, lastHash, data } = block;
            return Block.hash(timestamp, lastHash, data);
      }

      static signBlockHash(hash: string, wallet: any): string {
            return wallet.sign(hash);
      }

      static verifyBlock(block: Block): boolean {
            return ChainUtil.verifySignature(
                  block.validator,
                  block.signature,
                  Block.hash(block.timestamp, block.lastHash, block.data)
            );
      }

      static verifyLeader(block: Block, leader: string): boolean {
            return block.validator == leader;
      }
}

export default Block;
