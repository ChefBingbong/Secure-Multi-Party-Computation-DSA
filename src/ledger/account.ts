class Account {
      addresses: string[];
      balance: Record<string, number>;

      constructor(initialAccount?: string) {
            this.addresses = [initialAccount];
            this.balance = {
                  initialAccount: 1000,
            };
      }

      initialize(address: string): void {
            if (this.balance[address] === undefined) {
                  this.balance[address] = Math.random();
                  this.addresses.push(address);
            }
      }

      transfer(from: string, to: string, amount: number): void {
            this.initialize(from);
            this.initialize(to);
            this.increment(to, amount);
            this.decrement(from, amount);
      }

      increment(to: string, amount: number): void {
            this.balance[to] += amount;
      }

      decrement(from: string, amount: number): void {
            this.balance[from] -= amount;
      }

      getBalance(address: string): number {
            this.initialize(address);
            return this.balance[address];
      }

      update(transaction: any): void {
            const amount = transaction.output.amount;
            const from = transaction.input.from;
            const to = transaction.output.to;
            this.transfer(from, to, amount);
      }

      transferFee(block: any, transaction: any): void {
            const amount = transaction.output.fee;
            const from = transaction.input.from;
            const to = block.validator;
            this.transfer(from, to, amount);
      }
}

export default Account;
