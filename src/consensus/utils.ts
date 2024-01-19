export const calculateThreshold = (nodes: string[]): number => {
      if (nodes.length < 3) {
            throw new Error("BFT requires at least 3 nodes.");
      }
      return Math.floor((nodes.length - 1) / 2);
};
