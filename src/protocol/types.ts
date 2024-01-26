import { AbstractKeygenRound, GenericKeygenRoundBroadcast } from "../mpc/keygen/abstractRound";
import { KeygenSession } from "../mpc/keygen/keygenSession";
import { KeygenDirectMessageForRound4JSON } from "../mpc/keygen/types";
import { Message as Msg } from "./message/message";

export type Round = {
      round: AbstractKeygenRound;
      initialized?: boolean;
      roundResponses?: RoundResponse;
      finished?: boolean;
};
export type Rounds = { [x: number]: Round };
export type Message<T> = { [round: number]: T[] };
export type RoundResponse = boolean[];

export type KeygenCurrentState = {
      currentRound: number;
      roundState: Round;
      round: AbstractKeygenRound;
      session: KeygenSession;
};

export type ServerMessage<T extends any = {}> = {
      message: string;
      type: string;
      data: T;
      senderNode: string;
};

export type TransactionData<T extends any = {}> = {
      type: string;
      data: T;
};

export type KeygenMessageData = {
      broadcasts?: Msg<GenericKeygenRoundBroadcast>;
      directMessages?: Msg<KeygenDirectMessageForRound4JSON>[];
      proof?: string;
};

export type GenericMessageParams<T> = {
      type: "BROADCAST" | "DIRECT";
      data: T;
      destination?: string;
      ttl?: number;
};
export type ServerDirectMessage<Protocol> = {
      message: string;
      type: string;
      data: {
            directMessages?: Msg<Protocol>;
      };
      senderNode: string;
};

export interface Queue<T> {
      [partyId: string]: T | null;
}

export interface MessageQueue<T> {
      [roundNumber: number]: Queue<T>;
}

export type MessageData = any;

export type KeygenRoundHandlerMessage = any;

export interface Messages {
      [round: string]: KeygenRoundHandlerMessage[];
}
