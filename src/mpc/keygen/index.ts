import { AbstractKeygenRound } from "./abstractRound";
import { KeygenSession } from "./keygenSession";
import { KeygenRound1 } from "./round1";
import { KeygenRound2 } from "./round2";
import { KeygenRound3 } from "./round3";
import { KeygenRound4 } from "./round4";
import { KeygenRound5 } from "./round5";
import {
      GenericKeygenRoundBroadcast,
      GenericKeygenRoundDirectMessage,
      GenericKeygenRoundInput,
      GenericKeygenRoundOutput,
} from "./types";

export enum KeyGenRounds {
      KeygenRound1 = "KeygenRound1",
      KeygenRound2 = "KeygenRound2",
      KeygenRound3 = "KeygenRound3",
      KeygenRound4 = "KeygenRound4",
      KeygenRound5 = "KeygenRound5",
}

export const AllKeyGenRounds: {
      KeygenSession: KeygenSession;
      KeygenRound1: KeygenRound1;
      KeygenRound2: KeygenRound2;
      KeygenRound3: KeygenRound3;
      KeygenRound4: KeygenRound4;
      KeygenRound5: KeygenRound5;
} = {
      KeygenSession: new KeygenSession() as KeygenSession,
      KeygenRound1: new KeygenRound1() as KeygenRound1,
      KeygenRound2: new KeygenRound2() as KeygenRound2,
      KeygenRound3: new KeygenRound3() as KeygenRound3,
      KeygenRound4: new KeygenRound4() as KeygenRound4,
      KeygenRound5: new KeygenRound5() as KeygenRound5,
};

export type KeygenRoundTypes =
      | KeygenSession
      | KeygenRound1
      | KeygenRound2
      | KeygenRound3
      | KeygenRound4
      | KeygenRound5;
