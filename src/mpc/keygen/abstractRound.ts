import { KeygenSession } from "./keygenSession";

export interface BaseKeygenRound<O, B, D> {
      output: any;
      handleBroadcastMessage(bmsg: B): void;
      handleDirectMessage(dmsg: D): void;
      process(): Promise<O>;
}

export abstract class AbstractKeygenRound<I, O, B, D> implements BaseKeygenRound<O, B, D> {
      protected session: KeygenSession | undefined;
      protected input: I | undefined;
      public output: any;

      public abstract handleBroadcastMessage(bmsg: B): void;
      public abstract handleDirectMessage(dmsg: D): void;
      public abstract process(): Promise<O>;

      constructor() {}

      public init({ session, input }: { session: KeygenSession; input: I }): void {
            this.session = session;
            this.input = input;
      }

      public getProperties(): {
            session: KeygenSession;
            input: I;
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
