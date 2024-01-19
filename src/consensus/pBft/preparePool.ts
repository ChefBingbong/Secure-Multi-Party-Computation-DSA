import ChainUtil from "../../protocol/validators/chainUtil";
import Wallet from "../../wallet/wallet";

export interface PrepareMessage {
      blockHash: string;
      publicKey: string;
      signature: string;
}

class PreparePool {
      public list: { [blockHash: string]: PrepareMessage[] };

      constructor() {
            this.list = {};
      }

      // Prepare function initializes a list of prepare messages for a block
      // and adds the prepare message for the current node and returns it
      prepare(block: { hash: string }, wallet: Wallet): PrepareMessage {
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

      addPrepare(prepare: PrepareMessage): void {
            this.list[prepare.blockHash]?.push(prepare);
      }

      existingPrepare(prepare: PrepareMessage): PrepareMessage | undefined {
            if (!this.list[prepare.blockHash]) return undefined;
            return this.list[prepare.blockHash].find((p) => p.publicKey === prepare.publicKey);
      }

      isValidPrepare(prepare: PrepareMessage): boolean {
            return ChainUtil.verifySignature(prepare.publicKey, prepare.signature, prepare.blockHash);
      }
}

export default PreparePool;
