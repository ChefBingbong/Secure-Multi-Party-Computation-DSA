import Transaction from "./transaction";
import { TRANSACTION_THRESHOLD } from "../config/config";

export interface BaseTransactionPoolInterface {
      transactions: Transaction<any>[];
      addTransaction<T extends any>(transaction: Transaction<T>): boolean;
      validTransactions<T extends any>(): Transaction<T>[];
}

class TransactionPool implements BaseTransactionPoolInterface {
      public transactions: Transaction<any>[] = [];

      public thresholdReached(): boolean {
            console.log(this.transactions.length);
            return this.transactions.length >= TRANSACTION_THRESHOLD;
      }

      public addTransaction<T extends {}>(transaction: Transaction<T>): boolean {
            this.transactions.push(transaction);
            return this.thresholdReached();
      }

      public verifyTransaction<T extends any>(transaction: Transaction<T>) {
            return Transaction.verifyTransaction(transaction);
      }

      public validTransactions<T extends any>(): Transaction<T>[] {
            return this.transactions.filter((transaction) => {
                  if (!Transaction.verifyTransaction(transaction)) {
                        console.log(`Invalid signature from ${transaction.input.from}`);
                        return false;
                  }
                  return true;
            });
      }

      public transactionExists<T extends any>(transaction: Transaction<T>): Transaction<T> | undefined {
            return this.transactions.find((t) => t?.id === transaction?.id);
      }

      public clear(): void {
            this.transactions = [];
      }
}

export default TransactionPool;
