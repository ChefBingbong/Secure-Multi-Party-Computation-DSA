import Block from "./block";
import Transaction from "../wallet/transaction";
import Wallet from "../wallet/wallet";

export type GenericPBFTMessage = PrepareMessage & CommitMessage & RoundChangeMessage & Block & Transaction<any>;

export interface BlockchainInterface {
      addBlock(data: any): Promise<Block>;
      createBlock(transactions: any, wallet: Wallet): Block;
      isValidChain(chain: Block[]): boolean;
      replaceChain(newChain: Block[]): Promise<void>;
      isValidBlock(block: Block): boolean;
}
export type LeaderElectionArgs = { vote: string; validators: string[]; senderNode: string };

export interface CommitMessage {
      blockHash: string;
      publicKey: string;
      signature: string;
}

export interface RoundChangeMessage {
      publicKey: string;
      message: string;
      signature: string;
      blockHash: string;
}

export interface PrepareMessage {
      blockHash: string;
      publicKey: string;
      signature: string;
}

export interface BasePBFTMessagePoolInterface<PBFTMessageType> {
      message(
            prepare: {
                  blockHash: string;
            },
            wallet: Wallet
      ): PBFTMessageType;

      existingMessage(commit: PBFTMessageType): PBFTMessageType | undefined | false;

      isValidMessage(commit: PBFTMessageType): boolean;

      addMessage(commit: PBFTMessageType): void;
}

export interface BaseBlockParams<T> {
      timestamp: string | number;
      lastHash: string;
      hash: string;
      data: T[];
      validator: string;
      signature: string;
}
