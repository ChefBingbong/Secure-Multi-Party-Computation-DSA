import Wallet from "../../wallet/wallet";

interface BasePBFTMessagePoolInterface<PBFTMessageType> {
      message(
            prepare: {
                  blockHash: string;
            },
            wallet: Wallet
      ): PBFTMessageType;

      existingMessage(commit: PBFTMessageType): PBFTMessageType | undefined | false;

      isValidMessage(commit: PBFTMessageType): boolean;

      addMessage(commit: PBFTMessageType): void;
}

export abstract class AbstractPBFTMessagePool<PBFTMessageType>
      implements BasePBFTMessagePoolInterface<PBFTMessageType>
{
      public list: { [blockHash: string]: PBFTMessageType[] } = {};

      // message function initializes a list of commit messages for a prepare message
      // and adds the commit message for the current node and returns it
      public abstract message(prepare: { blockHash: string }, wallet: Wallet): PBFTMessageType;

      public abstract existingMessage(commit: PBFTMessageType): PBFTMessageType | undefined | false;

      public abstract isValidMessage(commit: PBFTMessageType): boolean;

      public abstract addMessage(commit: PBFTMessageType): void;
}

export default AbstractPBFTMessagePool;
