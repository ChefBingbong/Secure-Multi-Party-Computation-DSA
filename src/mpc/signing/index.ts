import { SignerRound1 } from "./signRound1";
import { SignerRound2 } from "./signRound2";
import { SignerRound3 } from "./signRound3";
import { SignerRound4 } from "./signRound4";
import { SignerRound5 } from "./signRound5";
import { SignSession } from "./signSession";

export enum SignSessionRounds {
      KeygenRound1 = "KeygenRound1",
      KeygenRound2 = "KeygenRound2",
      KeygenRound3 = "KeygenRound3",
      KeygenRound4 = "KeygenRound4",
      KeygenRound5 = "KeygenRound5",
}

export const AllSignSessionRounds: {
      SignSession: SignSession;
      SignerRound1: SignerRound1;
      SignerRound2: SignerRound2;
      SignerRound3: SignerRound3;
      SignerRound4: SignerRound4;
      SignerRound5: SignerRound5;
} = {
      SignSession: new SignSession() as SignSession,
      SignerRound1: new SignerRound1() as SignerRound1,
      SignerRound2: new SignerRound2() as SignerRound2,
      SignerRound3: new SignerRound3() as SignerRound3,
      SignerRound4: new SignerRound4() as SignerRound4,
      SignerRound5: new SignerRound5() as SignerRound5,
};
