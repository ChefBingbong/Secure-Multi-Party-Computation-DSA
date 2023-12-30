import ChainUtil from "./chainUtil";

class Validator {
      private keyPair: any;
      private publicKey: string;
      public ID: string;

      constructor() {
            this.ID = ChainUtil.id();
            this.keyPair = ChainUtil.genKeyPair(this.ID);
            this.publicKey = this.keyPair.getPublic("hex");
      }

      // Used for printing the wallet details
      toString(): string {
            return `Wallet - 
            publicKey: ${this.publicKey.toString()}`;
      }

      sign(dataHash: string): string {
            return this.keyPair.sign(dataHash).toHex();
      }

      getPublicKey(): string {
            return this.publicKey;
      }
}

export default Validator;
