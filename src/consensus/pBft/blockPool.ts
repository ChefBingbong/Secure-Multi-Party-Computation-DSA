import Block from "../block";

class BlockPool {
      private list: Block[];

      constructor() {
            this.list = [];
      }

      existingBlock(block: Block): Block | undefined {
            return this.list.find((b) => b.hash === block.hash);
      }

      addBlock(block: Block): void {
            this.list.push(block);
            console.log(`ADDED BLOCK TO POOL\n`);
      }

      getBlock(hash: string): Block | undefined {
            return this.list.find((b) => b.hash === hash);
      }
}

export default BlockPool;
