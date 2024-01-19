import ChainUtil from "../utils/chainUtil";
import Transaction from "./transaction";

class Wallet {
      public keyPair: any;
      public publicKey: string;

      constructor(secret: string) {
            this.keyPair = ChainUtil.genKeyPair(secret);
            this.publicKey = this.keyPair.getPublic("hex");
      }

      public sign(dataHash: string): string {
            return this.keyPair.sign(dataHash).toHex();
      }

      public createTransaction<T extends any>(
            to: string,
            amount: any,
            type: string,
            transactionPool: any
      ): Transaction<T> | undefined {
            let transaction = Transaction.newTransaction<T>(this, to, amount as any, type);
            transactionPool.addTransaction(transaction);
            return transaction;
      }

      public getPublicKey(): string {
            return this.publicKey;
      }
}

export default Wallet;
