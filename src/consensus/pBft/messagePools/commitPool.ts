import ChainUtil from "../../../protocol/validators/chainUtil";
import Wallet from "../../../wallet/wallet";
import { CommitMessage } from "../../types";
import AbstractPBFTMessagePool from "../abstractPBFTPool";

class CommitPool implements AbstractPBFTMessagePool<CommitMessage> {
      public list: { [blockHash: string]: CommitMessage[] } = {};

      // Commit function initializes a list of commit messages for a prepare message
      // and adds the commit message for the current node and returns it
      message(prepare: { blockHash: string }, wallet: Wallet): CommitMessage {
            const commit = this.createCommit(prepare, wallet);
            this.list[prepare.blockHash] = [];
            this.list[prepare.blockHash].push(commit);
            return commit;
      }

      private createCommit(prepare: { blockHash: string }, wallet: Wallet): CommitMessage {
            let commit: CommitMessage = {} as CommitMessage;
            commit.blockHash = prepare.blockHash;
            commit.publicKey = wallet.getPublicKey();
            commit.signature = wallet.sign(prepare.blockHash);

            return commit;
      }

      existingMessage(commit: CommitMessage): CommitMessage | undefined {
            if (!this.list[commit.blockHash]) return undefined;
            return this.list[commit.blockHash].find((p) => p.publicKey === commit.publicKey);
      }

      isValidMessage(commit: CommitMessage): boolean {
            return ChainUtil.verifySignature(commit.publicKey, commit.signature, commit.blockHash);
      }

      addMessage(commit: CommitMessage): void {
            this.list[commit.blockHash].push(commit);
      }
}

export default CommitPool;
