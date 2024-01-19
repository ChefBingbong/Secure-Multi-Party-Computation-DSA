import SHA256 from "crypto-js/sha256";
import ChainUtil from "../utils/chainUtil";
import { ErrorWithCode, ProtocolError } from "../utils/errors";
import { BaseBlockParams } from "./types";

class Block implements BaseBlockParams<any> {
      public timestamp: string | number;
      public lastHash: string;
      public hash: string;
      public data: any[];
      public validator: string;
      public signature: string;
      public sequenceNumber: number;
      public prepareMessages: any[];
      public commitMessages: any[];

      constructor(
            timestamp: string | number,
            lastHash: string,
            hash: string,
            data: any[],
            validator?: string,
            signature?: string,
            sequenceNumber?: number
      ) {
            this.timestamp = timestamp;
            this.lastHash = lastHash;
            this.hash = hash;
            this.data = data;
            this.validator = validator;
            this.signature = signature;
            this.sequenceNumber = sequenceNumber;
      }

      public toString(): string {
            return `Block - 
        Timestamp : ${this.timestamp}
        Last Hash : ${this.lastHash}
        Hash      : ${this.hash}
        Data      : ${this.data}
        Validator : ${this.validator}
        Signature : ${this.signature};
        Sequence No : ${this.sequenceNumber}`;
      }

      public static genesis(): Block {
            return new this("genesis time", "----", "genesis-hash", [], "P4@P@53R", "SIGN", 0);
      }

      public static createBlock(lastBlock: Block, _data: any, wallet: any): Block {
            const timestamp = Date.now();
            const lastHash = lastBlock.hash;
            const data = [_data];
            const hash = Block.hash(timestamp, lastHash, data);
            const validator = wallet.getPublicKey();
            const signature = Block.signBlockHash(hash, wallet);

            if (!signature) {
                  throw new ErrorWithCode(
                        `Errored interbnally: Failed to generate block signature`,
                        ProtocolError.INTERNAL_ERROR
                  );
            }
            return new this(timestamp, lastHash, hash, data, validator, signature, 1 + lastBlock.sequenceNumber);
      }

      public static hash(timestamp: string | number, lastHash: string, data: any[]): string {
            return SHA256(JSON.stringify(`${timestamp}${lastHash}${data}`)).toString();
      }

      public static blockHash(block: Block): string {
            const { timestamp, lastHash, data } = block;
            return Block.hash(timestamp, lastHash, data);
      }

      public static signBlockHash(hash: string, wallet: any): string {
            return wallet.sign(hash);
      }

      public static verifyBlock(block: Block): boolean {
            return ChainUtil.verifySignature(
                  block.validator,
                  block.signature,
                  Block.hash(block.timestamp, block.lastHash, block.data)
            );
      }

      public static verifyLeader(block: Block, leader: string): boolean {
            return Boolean(block.validator === leader);
      }
}

export default Block;
