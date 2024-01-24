import { SignSession } from "./signSession";
import {
      SignBroadcastForRound2JSON,
      SignBroadcastForRound3JSON,
      SignBroadcastForRound4JSON,
      SignBroadcastForRound5JSON,
      SignInputForRound3,
      SignInputForRound4,
      SignInputForRound5,
      SignMessageForRound2JSON,
      SignMessageForRound3JSON,
      SignMessageForRound4JSON,
} from "./types";

export interface BaseSignRound {
      output: any;
      isBroadcastRound: boolean;
      isDirectMessageRound: boolean;
      handleBroadcastMessage(bmsg: any): void;
      handleDirectMessage(dmsg: any): void;
      process(): Promise<SignRoundOutputExtended>;
}

export type GenericSignRoundOutput = {};

export type SignRoundOutputExtended = GenericSignRoundOutput & {
      directMessages?: GenericSignRoundDirectMessage[];
      broadcasts?: GenericSignRoundBroadcast;
};

export type GenericSignRoundDirectMessage = Partial<
      SignMessageForRound2JSON | SignMessageForRound3JSON | SignMessageForRound4JSON
>;

export type GenericSignRoundBroadcast = Partial<
      | SignBroadcastForRound2JSON
      | SignBroadcastForRound3JSON
      | SignBroadcastForRound4JSON
      | SignBroadcastForRound5JSON
>;
export type GenericSignRoundInput = SignInputForRound3 & SignInputForRound4 & SignInputForRound5;

export abstract class AbstractSignRound implements BaseSignRound {
      public currentRound: number;
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;
      public session: SignSession | undefined;
      protected input: GenericSignRoundInput | undefined;
      public output: GenericSignRoundOutput | undefined;

      public abstract handleBroadcastMessage(bmsg: any): void;
      public abstract handleDirectMessage(dmsg: any): void;
      public abstract process(): Promise<any>;

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

      public init({
            session,
            input,
      }: {
            session?: SignSession;
            input?: GenericSignRoundInput;
            sessionConfig?: any;
      }): void {
            this.session = session;
            this.input = input;
      }

      public getProperties(): {
            session: SignSession;
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
