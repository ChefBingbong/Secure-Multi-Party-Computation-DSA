class Stake {
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

      addStake(from: string, amount: number): void {
            this.initialize(from);
            this.balance[from] += amount;
      }

      getBalance(address: string): number {
            this.initialize(address);
            return this.balance[address];
      }

      getMax(addresses: string[]): string | undefined {
            let balance = -1;
            let leader: string | undefined = undefined;
            addresses.forEach((address) => {
                  if (this.getBalance(address) > balance) {
                        leader = address;
                  }
            });
            return leader;
      }

      update(transaction: any): void {
            const amount = transaction.output.amount;
            const from = transaction.input.from;
            this.addStake(from, amount);
      }
}

export default Stake;
