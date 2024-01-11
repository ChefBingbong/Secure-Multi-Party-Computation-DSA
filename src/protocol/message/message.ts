import { GenericKeygenRoundBroadcast } from "../../mpc/keygen/abstractRound";
import { KeygenDirectMessageForRound4 } from "../../mpc/keygen/keygenMessages/directMessages";

export class Message<T> {
      From: string;
      To: string;
      Protocol: string;
      RoundNumber: number;
      Data: T;
      Broadcast: boolean;

      constructor(From: string, To: string, Protocol: string, RoundNumber: number, Data: T, Broadcast: boolean) {
            this.From = From;
            this.To = To;
            this.Protocol = Protocol;
            this.RoundNumber = RoundNumber;
            this.Data = Data;
            this.Broadcast = Broadcast;
      }

      toString(): string {
            return `message: round ${this.RoundNumber}, from: ${this.From}, to: ${this.To}, protocol: ${this.Protocol}`;
      }

      static isFor<T extends Message<GenericKeygenRoundBroadcast> | Message<KeygenDirectMessageForRound4>>(
            id: string,
            msg: T
      ): boolean {
            if (msg.From === id) {
                  return false;
            }
            // console.log(msg);
            return msg.To === "" || msg.To === id;
      }

      static create<T>(
            From: string,
            To: string,
            Protocol: string,
            RoundNumber: number,
            Data: T,
            Broadcast: boolean
      ): Message<T> {
            const msg = new Message<T>(From, To, Protocol, RoundNumber, Data, Broadcast);
            Object.freeze(msg);
            return msg;
      }
}
