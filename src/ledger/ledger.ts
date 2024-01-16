import Block from "./block";
import Stake from "./stake";
import Account from "./account";
import Validators from "./validators";
import Wallet from "../wallet/wallet";

let secret = "i am the first leader";

enum TRANSACTION_TYPE {
      transaction = "TRANSACTION",
      stake = "STAKE",
      validator_fee = "VALIDATOR_FEE",
}

class Blockchain {
      public chain: Block[];
      private stakes: Stake;
      private accounts: Account;
      private validators: Validators;

      constructor() {
            this.chain = [Block.genesis()];
            this.stakes = new Stake();
            this.accounts = new Account();
            this.validators = new Validators();
      }

      addBlock(data: any): Block {
            const block = Block.createBlock(this.chain[this.chain.length - 1], data, new Wallet(secret));

            this.chain.push(block);
            console.log("NEW BLOCK ADDED");
            return block;
      }

      createBlock(transactions: any, wallet: Wallet): Block {
            const block = Block.createBlock(this.chain[this.chain.length - 1], transactions, wallet);
            return block;
      }

      isValidChain(chain: Block[]): boolean {
            if (JSON.stringify(chain[0]) !== JSON.stringify(Block.genesis())) {
                  return false;
            }

            for (let i = 1; i < chain.length; i++) {
                  const block = chain[i];
                  const lastBlock = chain[i - 1];

                  if (block.lastHash !== lastBlock.hash || block.hash !== Block.blockHash(block)) {
                        return false;
                  }
            }

            return true;
      }

      replaceChain(newChain: Block[]): void {
            console.log(newChain.length, this.chain.length);
            if (newChain.length <= this.chain.length) {
                  console.log("Received chain is not longer than the current chain");
                  return;
            } else if (!this.isValidChain(newChain)) {
                  console.log("Received chain is invalid");
                  return;
            }

            console.log("Replacing the current chain with a new chain");
            this.resetState();
            this.executeChain(newChain);
            this.chain = newChain;
      }

      getBalance(publicKey: string): number {
            return this.accounts.getBalance(publicKey);
      }

      getLeader(): any {
            return this.stakes.getMax(this.validators.list);
      }

      initialize(address: string): void {
            this.accounts.initialize(address);
            this.stakes.initialize(address);
      }

      isValidBlock(block: Block): boolean {
            const lastBlock = this.chain[this.chain.length - 1];
            if (
                  block.lastHash === lastBlock.hash &&
                  block.hash === Block.blockHash(block) &&
                  Block.verifyBlock(block)
                  // Block.verifyLeader(block, this.getLeader())
            ) {
                  console.log("block valid");
                  this.addBlock(block);
                  this.executeTransactions(block);
                  return true;
            } else {
                  return false;
            }
      }

      executeTransactions(block: Block): void {
            block.data.forEach((transaction) => {
                  switch (transaction.type) {
                        case TRANSACTION_TYPE.transaction:
                              this.accounts.update(transaction);
                              this.accounts.transferFee(block, transaction);
                              break;
                        case TRANSACTION_TYPE.stake:
                              this.stakes.update(transaction);
                              this.accounts.decrement(transaction.input.from, transaction.output.amount);
                              this.accounts.transferFee(block, transaction);
                              break;
                        case TRANSACTION_TYPE.validator_fee:
                              console.log("VALIDATOR_FEE");
                              if (this.validators.update(transaction)) {
                                    this.accounts.decrement(transaction.input.from, transaction.output.amount);
                                    this.accounts.transferFee(block, transaction);
                              }
                              break;
                  }
            });
      }

      executeChain(chain: Block[]): void {
            chain.forEach((block) => {
                  this.executeTransactions(block);
            });
      }

      resetState(): void {
            this.chain = [Block.genesis()];
            this.stakes = new Stake();
            this.accounts = new Account();
            this.validators = new Validators();
      }
}

export default Blockchain;
