import ChainUtil from "../../../protocol/validators/chainUtil";
import Wallet from "../../../wallet/wallet";
import AbstractPBFTMessagePool from "../abstractPBFTPool";

export interface PrepareMessage {
      blockHash: string;
      publicKey: string;
      signature: string;
}

class PreparePool implements AbstractPBFTMessagePool<PrepareMessage> {
      public list: { [blockHash: string]: PrepareMessage[] };

      constructor() {
            this.list = {};
      }

      // @ts-ignore
      public message(block: { hash: string }, wallet: Wallet): PrepareMessage {
            const prepare = this.createPrepare(block, wallet);
            this.list[block.hash] = [];
            this.list[block.hash].push(prepare);
            return prepare;
      }

      private createPrepare(block: { hash: string }, wallet: Wallet): PrepareMessage {
            const prepare: PrepareMessage = {
                  blockHash: block.hash,
                  publicKey: wallet.getPublicKey(),
                  signature: wallet.sign(block.hash),
            };

            return prepare;
      }

      addMessage(prepare: PrepareMessage): void {
            this.list[prepare.blockHash]?.push(prepare);
      }

      existingMessage(prepare: PrepareMessage): PrepareMessage | undefined {
            if (!this.list[prepare.blockHash]) return undefined;
            return this.list[prepare.blockHash].find((p) => p.publicKey === prepare.publicKey);
      }

      isValidMessage(prepare: PrepareMessage): boolean {
            return ChainUtil.verifySignature(prepare.publicKey, prepare.signature, prepare.blockHash);
      }
}

export default PreparePool;
