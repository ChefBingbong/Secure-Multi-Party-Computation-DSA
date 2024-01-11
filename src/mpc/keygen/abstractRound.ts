import { KeygenSession } from "./keygenSession";
import {
      GenericRoundOutput,
      KeygenBroadcastForRound2JSON,
      KeygenBroadcastForRound3JSON,
      KeygenBroadcastForRound4JSON,
      KeygenBroadcastForRound5JSON,
      KeygenDirectMessageForRound4JSON,
      SessionConfig,
} from "./types";

export interface BaseKeygenRound {
      output: any;
      isBroadcastRound: boolean;
      isDirectMessageRound: boolean;
      handleBroadcastMessage(bmsg: any): void;
      handleDirectMessage(dmsg: any): void;
      process(): Promise<RoundOutputExtended>;
}

export type RoundOutputExtended = GenericRoundOutput & {
      directMessages?: KeygenDirectMessageForRound4JSON[];
      broadcasts?: GenericKeygenRoundBroadcast;
};
export type GenericKeygenRoundBroadcast = Partial<
      | KeygenBroadcastForRound2JSON
      | KeygenBroadcastForRound3JSON
      | KeygenBroadcastForRound4JSON
      | KeygenBroadcastForRound5JSON
>;

export abstract class AbstractKeygenRound implements BaseKeygenRound {
      public currentRound: number;
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;
      public session: KeygenSession | undefined;
      protected input: any | undefined;
      public output: GenericRoundOutput;

      public abstract handleBroadcastMessage(bmsg: any): void;
      public abstract handleDirectMessage(dmsg: any): void;
      public abstract process(): Promise<RoundOutputExtended>;

      constructor({
            isBroadcastRound,
            isDriectMessageRound,
            currentRound,
      }: {
            isBroadcastRound: boolean;
            isDriectMessageRound: boolean;
            currentRound: number;
      }) {
            this.isBroadcastRound = isBroadcastRound;
            this.isDirectMessageRound = isDriectMessageRound;
            this.currentRound = currentRound;
      }

      public init<I>({
            session,
            input,
      }: {
            session?: KeygenSession;
            input?: I;
            sessionConfig?: SessionConfig;
      }): void {
            this.session = session;
            this.input = input;
      }

      public getProperties(): {
            session: KeygenSession;
            input: any;
      } {
            if (!this.session || !this.input) {
                  throw new Error("Properties not initialized");
            }

            return {
                  session: this.session,
                  input: this.input,
            };
      }
}
