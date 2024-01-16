import ChainUtil from "../utils/chainUtil";
import { TRANSACTION_FEE } from "../config/config";
import { ErrorWithCode, ProtocolError } from "../utils/errors";

export type TransactonInput = { timestamp: number; from: string; signature: string };
export type TransactonOutput<T extends any> = { to: string; amount: T; fee: number };

export interface BaseTransactionInterface<T> {
      newTransaction(senderWallet: any, to: string, amount: T, type: string): Transaction<T> | undefined;
      signTransaction(transaction: Transaction<any>, senderWallet: any): void;
      verifyTransaction(transaction: Transaction<any>): boolean;
}
class Transaction<T extends any> implements BaseTransactionInterface<T> {
      public id: string;
      public type: string | null;
      public input: TransactonInput | null;
      public output: TransactonOutput<T> | null;

      constructor() {
            this.id = ChainUtil.id();
            this.type = null;
            this.input = null;
            this.output = null;
      }

      public newTransaction<DataFormat extends any>(
            senderWallet: any,
            to: string,
            amount: DataFormat,
            type: string
      ): Transaction<DataFormat> | undefined {
            return this.generateTransaction<DataFormat>(senderWallet, to, amount, type);
      }

      private generateTransaction<DataFormat extends any>(
            senderWallet: any,
            to: string,
            amount: DataFormat,
            type: string
      ): Transaction<DataFormat> | undefined {
            try {
                  const transaction = new Transaction<DataFormat>();
                  if (!transaction) {
                        throw new ErrorWithCode(
                              `Errored interbnally: Failed to generate transaction`,
                              ProtocolError.INTERNAL_ERROR
                        );
                  }
                  transaction.type = type;
                  transaction.output = {
                        to: to,
                        amount: (amount as number) - TRANSACTION_FEE,
                        fee: TRANSACTION_FEE,
                  } as any;

                  this.signTransaction(transaction, senderWallet);
                  return transaction;
            } catch (error) {
                  console.error(error);
                  return undefined;
            }
      }

      public signTransaction(transaction: Transaction<any>, senderWallet: any): void {
            transaction.input = {
                  timestamp: Date.now(),
                  from: senderWallet.publicKey,
                  signature: senderWallet.sign(ChainUtil.hash(transaction.output)),
            };
      }

      public verifyTransaction(transaction: Transaction<any>): boolean {
            return ChainUtil.verifySignature(
                  transaction.input.from,
                  transaction.input.signature,
                  ChainUtil.hash(transaction.output)
            );
      }
}

export default Transaction;
