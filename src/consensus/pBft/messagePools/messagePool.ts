import ChainUtil from "../../../p2p/validators/chainUtil";
import Wallet from "../../../wallet/wallet";
import { RoundChangeMessage } from "../../types";
import AbstractPBFTMessagePool from "../abstractPBFTPool";

class MessagePool implements AbstractPBFTMessagePool<RoundChangeMessage> {
      public list: { [blockHash: string]: RoundChangeMessage[] } = {};
      public msg: string = "INITIATE NEW ROUND";

      message(): any {}
      // Creates a round change message for the given block hash
      public createMessage(blockHash: string, wallet: Wallet): RoundChangeMessage {
            const roundChange: RoundChangeMessage = {
                  publicKey: wallet.getPublicKey(),
                  message: this.msg,
                  signature: wallet.sign(ChainUtil.hash(this.msg + blockHash)),
                  blockHash: blockHash,
            };

            this.list[blockHash] = [roundChange];
            return roundChange;
      }

      public existingMessage(message: RoundChangeMessage): RoundChangeMessage | false {
            if (this.list[message.blockHash]) {
                  return this.list[message.blockHash].find((p) => p.publicKey === message.publicKey);
            } else {
                  return false;
            }
      }

      public isValidMessage(message: RoundChangeMessage): boolean {
            return ChainUtil.verifySignature(
                  message.publicKey,
                  message.signature,
                  ChainUtil.hash(message.message + message.blockHash)
            );
      }

      public addMessage(message: RoundChangeMessage): void {
            this.list[message.blockHash]?.push(message);
      }
}

export default MessagePool;
