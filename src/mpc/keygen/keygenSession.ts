import { AbstractKeygenRound } from "./abstractRound";

export class KeygenSession extends AbstractKeygenRound<any, any, any, any> {
      constructor() {
            super({ isBroadcastRound: false, isDriectMessageRound: false });
      }

      public fromJSON(json: any): void {}
      public fromJSOND(json: any): void {}
      public handleBroadcastMessage(bmsg: any): void {}
      public handleDirectMessage(bmsg: any): void {}
      public async process(): Promise<any> {}
}
