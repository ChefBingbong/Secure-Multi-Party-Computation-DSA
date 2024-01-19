import Wallet from "../../wallet/wallet";
import ChainUtil from "../../protocol/validators/chainUtil";

export interface CommitMessage {
      blockHash: string;
      publicKey: string;
      signature: string;
}

class CommitPool {
      public list: { [blockHash: string]: CommitMessage[] };

      constructor() {
            this.list = {};
      }

      // Commit function initializes a list of commit messages for a prepare message
      // and adds the commit message for the current node and returns it
      commit(prepare: { blockHash: string }, wallet: Wallet): CommitMessage {
            const commit = this.createCommit(prepare, wallet);
            this.list[prepare.blockHash] = [];
            this.list[prepare.blockHash].push(commit);
            return commit;
      }

      private createCommit(prepare: { blockHash: string }, wallet: Wallet): CommitMessage {
            const commit: CommitMessage = {
                  blockHash: prepare.blockHash,
                  publicKey: wallet.getPublicKey(),
                  signature: wallet.sign(prepare.blockHash),
            };

            return commit;
      }

      existingCommit(commit: CommitMessage): CommitMessage | undefined {
            if (!this.list[commit.blockHash]) return undefined;
            return this.list[commit.blockHash].find((p) => p.publicKey === commit.publicKey);
      }

      isValidCommit(commit: CommitMessage): boolean {
            return ChainUtil.verifySignature(commit.publicKey, commit.signature, commit.blockHash);
      }

      addCommit(commit: CommitMessage): void {
            this.list[commit.blockHash].push(commit);
      }
}

export default CommitPool;
