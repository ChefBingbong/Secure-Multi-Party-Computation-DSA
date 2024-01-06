import { KeygenSession } from "./keygenSession";

export interface BaseKeygenRound<I, O, B, D> {
      handleBroadcastMessage(bmsg: B): void;
      handleDirectMessage(dmsg: D): void;
      process(): Promise<O>;
}

export abstract class AbstractKeygenRound<I, O, B, D> implements BaseKeygenRound<I, O, B, D> {
      protected session: KeygenSession | undefined;
      protected input: I | undefined;

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
