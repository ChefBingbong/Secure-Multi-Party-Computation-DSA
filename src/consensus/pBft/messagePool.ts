import ChainUtil from "../../protocol/validators/chainUtil";
import Wallet from "../../wallet/wallet";

export interface RoundChangeMessage {
      publicKey: string;
      message: string;
      signature: string;
      blockHash: string;
}

class MessagePool {
      public list: { [blockHash: string]: RoundChangeMessage[] };
      public message: string;

      constructor() {
            this.list = {};
            this.message = "INITIATE NEW ROUND";
      }

      // Creates a round change message for the given block hash
      createMessage(blockHash: string, wallet: Wallet): RoundChangeMessage {
            const roundChange: RoundChangeMessage = {
                  publicKey: wallet.getPublicKey(),
                  message: this.message,
                  signature: wallet.sign(ChainUtil.hash(this.message + blockHash)),
                  blockHash: blockHash,
            };

            this.list[blockHash] = [roundChange];
            return roundChange;
      }

      existingMessage(message: RoundChangeMessage): RoundChangeMessage | undefined {
            if (this.list[message.blockHash]) {
                  return this.list[message.blockHash].find((p) => p.publicKey === message.publicKey);
            } else {
                  return undefined;
            }
      }

      isValidMessage(message: RoundChangeMessage): boolean {
            return ChainUtil.verifySignature(
                  message.publicKey,
                  message.signature,
                  ChainUtil.hash(message.message + message.blockHash)
            );
      }

      addMessage(message: RoundChangeMessage): void {
            console.log(this.list[message.blockHash]);
            this.list[message.blockHash].push(message);
      }
}

export default MessagePool;
