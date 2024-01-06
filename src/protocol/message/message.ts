export class Message<T> {
      SSID: string;
      From: string;
      To: string;
      Protocol: string;
      RoundNumber: number;
      Data: T;
      Broadcast: boolean;

      constructor(
            SSID: string,
            From: string,
            To: string,
            Protocol: string,
            RoundNumber: number,
            Data: T,
            Broadcast: boolean
      ) {
            this.SSID = SSID;
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

      static isFor(id: string, msg: Message<any>): boolean {
            if (msg.From === id) {
                  return false;
            }
            return msg.To === "" || msg.To === id;
      }

      static create<T>(
            SSID: string,
            From: string,
            To: string,
            Protocol: string,
            RoundNumber: number,
            Data: T,
            Broadcast: boolean
      ): Message<T> {
            return new Message<T>(SSID, From, To, Protocol, RoundNumber, Data, Broadcast);
      }
}
