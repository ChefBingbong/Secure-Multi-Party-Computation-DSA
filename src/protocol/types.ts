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
export type Message = { [round: number]: any };
export type RoundResponse = boolean[];

export type KeygenCurrentState = {
      currentRound: number;
      roundState: Round;
      round: AbstractKeygenRound;
      session: KeygenSession;
};

export type ServerMessage = {
      message: string;
      type: string;
      data: {
            broadcasts?: Msg<GenericKeygenRoundBroadcast>;
            directMessages?: Msg<KeygenDirectMessageForRound4JSON>[];
            proof?: string;
      };
};
