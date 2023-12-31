import { KeygenSession } from "./keygenSession";
import { KeygenRound1 } from "./round1";
import { KeygenRound2 } from "./round2";
import { KeygenRound3 } from "./round3";
import { KeygenRound4 } from "./round4";
import { KeygenRound5 } from "./round5";

export type KGInstance = (
      | typeof KeygenSession
      | typeof KeygenRound1
      | typeof KeygenRound2
      | typeof KeygenRound3
      | typeof KeygenRound4
      | typeof KeygenRound5
)

const keygenSessionInstance: KGInstance = [
      KeygenSession,
      KeygenRound1,
      KeygenRound2,
      KeygenRound3,
      KeygenRound4,
      KeygenRound5,
];

export {
      KeygenSession,
      KeygenRound1,
      KeygenRound2,
      KeygenRound3,
      KeygenRound4,
      KeygenRound5,
      keygenSessionInstance,
};
{
      sessionId: 0,
      currentRound = 0
      rounds: {
      [0]: { session: [class KeygenSession], initialized: false, roundResponses: 0 },
      [1]: { session: [class KeygenRound1], initialized: false, roundResponses: 0},
      [2]: { session: [class KeygenRound2], initialized: false, roundResponses: 0 },
      [3]: { session: [class KeygenRound3], initialized: false, roundResponses: 0 },
      [4]: { session: [class KeygenRound4], initialized: false, roundResponses: 0 },
      [5]: { session: [class KeygenRound5], initialized: false, roundResponses: 0 }
      }
    }