import ChainUtil from "../utils/chainUtil";
import { TRANSACTION_FEE } from "../config/config";

class Transaction {
      id: string;
      type: string | null;
      input: { timestamp: number; from: string; signature: string } | null;
      output: { to: string; amount: number; fee: number } | null;

      constructor() {
            this.id = ChainUtil.id();
            this.type = null;
            this.input = null;
            this.output = null;
      }

      static newTransaction(
            senderWallet: any, // Replace with the actual type of senderWallet
            to: string,
            amount: number,
            type: string
      ): Transaction | undefined {
            // if (amount + TRANSACTION_FEE > senderWallet.balance) {
            //       console.log(`Amount : ${amount} exceeds the balance`);
            //       return undefined;
            // }

            return Transaction.generateTransaction(senderWallet, to, amount, type);
      }

      static generateTransaction(
            senderWallet: any, // Replace with the actual type of senderWallet
            to: string,
            amount: number,
            type: string
      ): Transaction {
            const transaction = new this();
            transaction.type = type;
            transaction.output = {
                  to: to,
                  amount: amount - TRANSACTION_FEE,
                  fee: TRANSACTION_FEE,
            };
            Transaction.signTransaction(transaction, senderWallet);
            return transaction;
      }

      static signTransaction(transaction: Transaction, senderWallet: any): void {
            transaction.input = {
                  timestamp: Date.now(),
                  from: senderWallet.publicKey,
                  signature: senderWallet.sign(ChainUtil.hash(transaction.output)),
            };
      }

      static verifyTransaction(transaction: Transaction): boolean {
            return ChainUtil.verifySignature(
                  transaction.input.from,
                  transaction.input.signature,
                  ChainUtil.hash(transaction.output)
            );
      }
}

export default Transaction;
