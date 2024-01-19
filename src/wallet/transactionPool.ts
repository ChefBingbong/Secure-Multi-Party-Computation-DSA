import { app } from "../protocol";
import { ValidatorsGroup } from "../protocol/validators/validators";
import Transaction from "./transaction";

export interface BaseTransactionPoolInterface {
      transactions: Transaction<any>[];
      addTransaction<T extends any>(transaction: Transaction<T>): boolean;
      validTransactions<T extends any>(): Transaction<T>[];
}

class TransactionPool implements BaseTransactionPoolInterface {
      public transactions: Transaction<any>[] = [];

      public thresholdReached(): boolean {
            console.log(Math.ceil(ValidatorsGroup.getAllValidators().length * 0.67));
            return Boolean(
                  this.transactions.length >= Math.ceil(ValidatorsGroup.getAllValidators().length * 0.67)
            );
      }

      public addTransaction<T extends {}>(transaction: Transaction<T>): boolean {
            this.transactions.push(transaction);
            app.p2pServer.getLogger("info").info(`TRANSACTION ADDED`);
            return transaction?.override ? true : this.thresholdReached();
      }

      public verifyTransaction<T extends any>(transaction: Transaction<T>) {
            try {
                  return Transaction.verifyTransaction(transaction);
            } catch (err) {
                  return false;
            }
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
