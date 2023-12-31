import * as crypto from "crypto";
import { Hasher } from "../../mpc/utils/hasher";

export interface Info {
      SelfID: string;
      PartyIDs: string[];
      ProtocolID: string;
      Threshold: number;
      FinalRoundNumber: number;
      hash: Hasher;
}

interface Content {
      // Define the structure of 'Content'
}

interface Message {
      From: string;
      To?: string;
      Broadcast?: boolean;
      Content: Content;
}

export class Helper {
      private info: Info;
      private partyIDs: string[];
      private otherPartyIDs: string[];
      private ssid: Hasher;
      private hash: Hasher;

      constructor(info: Info) {
            const partyIDs = info.PartyIDs.slice().sort();
            if (!this.validPartyIDs(partyIDs, info.SelfID)) {
                  throw new Error("session: partyIDs invalid");
            }

            if (!partyIDs.includes(info.SelfID)) {
                  throw new Error("session: selfID not included in partyIDs");
            }

            if (
                  info.Threshold < 0 ||
                  info.Threshold > Number.MAX_SAFE_INTEGER
            ) {
                  throw new Error(
                        `session: threshold ${info.Threshold} is invalid`
                  );
            }

            if (info.Threshold > partyIDs.length - 1) {
                  throw new Error(
                        `session: threshold ${info.Threshold} is invalid for the number of parties ${partyIDs.length}`
                  );
            }

            this.info = info;
            this.partyIDs = partyIDs;
            this.otherPartyIDs = this.partyIDs.filter(
                  (id) => id !== info.SelfID
            );
            this.ssid = this.info.hash.clone().update(this.info.SelfID);
            this.hash = this.info.hash;
      }

      private validPartyIDs(partyIDs: string[], selfID: string): boolean {
            // TODO: Implement the validation logic
            return true;
      }

      BroadcastMessage(out: Message[], broadcastContent: Content): void {
            const msg: Message = {
                  From: this.info.SelfID,
                  Broadcast: true,
                  Content: broadcastContent,
            };

            if (out.length === 0) {
                  throw new Error("Out channel is full");
            }

            out.push(msg);
      }

      SendMessage(out: Message[], content: Content, to: string): void {
            const msg: Message = {
                  From: this.info.SelfID,
                  To: to,
                  Content: content,
            };

            if (out.length === 0) {
                  throw new Error("Out channel is full");
            }

            out.push(msg);
      }

      ResultRound(result: any): Session {
            // TODO: Implement ResultRound
            return null!;
      }

      AbortRound(err: Error, culprits: string[]): Session {
            // TODO: Implement AbortRound
            return null!;
      }

      ProtocolID(): string {
            return this.info.ProtocolID;
      }

      FinalRoundNumber(): number {
            return this.info.FinalRoundNumber;
      }

      SSID(): Hasher {
            return this.ssid;
      }

      SelfID(): string {
            return this.info.SelfID;
      }

      PartyIDs(): string[] {
            return this.partyIDs;
      }

      OtherPartyIDs(): string[] {
            return this.otherPartyIDs;
      }

      Threshold(): number {
            return this.info.Threshold;
      }

      N(): number {
            return this.info.PartyIDs.length;
      }
}

// TODO: Implement the Content, types.ThresholdWrapper, types.HashableWithDomain, and other necessary types

interface Session {
      // Define the structure of 'Session'
}

interface BroadcastRound extends Session {
      // Define the structure of 'BroadcastRound'
}
