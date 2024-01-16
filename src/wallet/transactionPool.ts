import Transaction from "./transaction";
import { TRANSACTION_THRESHOLD } from "../config/config";

class TransactionPool {
      transactions: Transaction[];

      constructor() {
            this.transactions = [];
      }

      thresholdReached(): boolean {
            console.log(this.transactions.length);
            return this.transactions.length >= TRANSACTION_THRESHOLD;
      }

      addTransaction(transaction: Transaction): boolean {
            this.transactions.push(transaction);
            return this.thresholdReached();
      }

      validTransactions(): Transaction[] {
            return this.transactions.filter((transaction) => {
                  if (!Transaction.verifyTransaction(transaction)) {
                        console.log(`Invalid signature from ${transaction.input.from}`);
                        return false;
                  }

                  return true;
            });
      }

      transactionExists(transaction: Transaction): Transaction | undefined {
            // console.log(this.transactions.find((t) => t?.id === transaction?.id));
            return this.transactions.find((t) => t?.id === transaction?.id);
      }

      clear(): void {
            this.transactions = [];
      }
}

export default TransactionPool;
