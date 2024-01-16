import { eddsa } from "elliptic";
import ChainUtil from "../utils/chainUtil";
import Transaction from "./transaction";

class Wallet {
      balance: number;
      keyPair: any; // Replace with the actual type of keyPair
      publicKey: string;

      constructor(secret: string) {
            this.balance = 100;
            this.keyPair = ChainUtil.genKeyPair(secret);
            this.publicKey = this.keyPair.getPublic("hex");
      }

      public sign(dataHash: string): string {
            return this.keyPair.sign(dataHash).toHex();
      }

      public createTransaction(
            to: string,
            amount: number,
            type: string,
            blockchain: any, // Replace with the actual type of blockchain
            transactionPool: any // Replace with the actual type of transactionPool
      ): Transaction | undefined {
            this.balance = this.getBalance(blockchain);
            // if (amount > this.balance) {
            //       console.log(`Amount: ${amount} exceeds the current balance: ${this.balance}`);
            //       return undefined;
            // }
            let transaction = Transaction.newTransaction(this, to, amount, type);
            transactionPool.addTransaction(transaction);
            return transaction;
      }

      public getBalance(blockchain: any): number {
            return blockchain.getBalance(this.publicKey);
      }

      public getPublicKey(): string {
            return this.publicKey;
      }
}

export default Wallet;
