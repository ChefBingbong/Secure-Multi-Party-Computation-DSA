import { KeygenSession } from "./keygenSession";
import { KeygenRound1 } from "./round1";
import { KeygenRound2 } from "./round2";
import { KeygenRound3 } from "./round3";
import { KeygenRound4 } from "./round4";
import { KeygenRound5 } from "./round5";

export type KGInstance =
      | typeof KeygenSession
      | typeof KeygenRound1
      | typeof KeygenRound2
      | typeof KeygenRound3
      | typeof KeygenRound4
      | typeof KeygenRound5;

export type KGInstance1 =
      | KeygenSession
      | KeygenRound1
      | KeygenRound2
      | KeygenRound3
      | KeygenRound4
      | KeygenRound5;

const keygenRounds = [
      KeygenRound1,
      KeygenRound2,
      KeygenRound3,
      KeygenRound4,
      KeygenRound5,
];

export const KeygenSessionMap = {
      1: KeygenRound1,
      2: KeygenRound2,
      3: KeygenRound3,
      4: KeygenRound4,
      5: KeygenRound5,
};

export {
      KeygenSession,
      KeygenRound1,
      KeygenRound2,
      KeygenRound3,
      KeygenRound4,
      KeygenRound5,
      keygenRounds,
};
const a = KeygenRound1;
