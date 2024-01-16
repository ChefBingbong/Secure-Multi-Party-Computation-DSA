class Stake {
      addresses: string[];
      balance: Record<string, number>;

      constructor() {
            this.addresses = ["5aad9b5e21f63955e8840e8b954926c60e0e2d906fdbc0ce1e3afe249a67f614"];
            this.balance = {
                  "5aad9b5e21f63955e8840e8b954926c60e0e2d906fdbc0ce1e3afe249a67f614": 0,
            };
      }

      initialize(address: string): void {
            if (this.balance[address] === undefined) {
                  this.balance[address] = 0;
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
