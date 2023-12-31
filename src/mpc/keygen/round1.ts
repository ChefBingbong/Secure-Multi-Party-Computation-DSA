import { randBetween } from "bigint-crypto-utils";
import { partyIdToScalar } from "./partyKey";
import {
      randomPaillierPrimes,
      validatePaillierPrime,
} from "../paillierKeyPair/paillierCryptoUtils";
import { PaillierSecretKey } from "../paillierKeyPair/paillierSecretKey";
import { Exponent } from "../math/polynomial/exponent";
import { Polynomial } from "../math/polynomial/polynomial";
import { generateElGamalKeyPair } from "../math/sample";
import { zkSchCreateRandomness } from "../zk/zksch";
import { KeygenSession } from "./keygenSession";
import { KeygenBroadcastForRound2 } from "./round2";
import { KeygenInputForRound1, KeygenRound1Output } from "./types";
// import { validatePaillierPrime } from "../paillierKeygen";

export class KeygenRound1 {
      public session: KeygenSession;
      private input: KeygenInputForRound1;

      constructor(session: KeygenSession, input: KeygenInputForRound1) {
            this.session = session;
            this.input = input;
      }

      public async process(): Promise<KeygenRound1Output> {
            // generate large random primes and use these to create a paillier keypair
            const { p, q } = await randomPaillierPrimes();
            const paillierSecret = new PaillierSecretKey(p, q);

            // a pedersen commit is used to add extra security with the
            // paillier key pair
            const selfPaillierPublic = paillierSecret.publicKey;
            const { pedersen: selfPedersenPublic, lambda: pedersenSecret } =
                  paillierSecret.generatePedersen();

            const [elGamalSecret, elGamalPublic] = generateElGamalKeyPair();

            const selfShare = this.session.inputForRound1.vssSecret.evaluate(
                  partyIdToScalar(this.session.selfId)
            );

            const selfVSSpolynomial = Exponent.fromPoly(
                  this.session.inputForRound1.vssSecret
            );

            // here we create randomness for a schnorr ZKP which
            // is used later for round proofs
            const schnorrRand = zkSchCreateRandomness();

            const selfRID = randBetween(2n ** 256n);
            const chainKey = randBetween(2n ** 256n);

            const { commitment: selfCommitment, decommitment } = this.session
                  .cloneHashForId(this.session.selfId)
                  .commit([
                        selfRID,
                        chainKey,
                        selfVSSpolynomial,
                        schnorrRand.commitment.C,
                        elGamalPublic,
                        selfPedersenPublic,
                  ]);

            //broadcast results to other parties
            const broadcasts: Array<KeygenBroadcastForRound2> = [
                  KeygenBroadcastForRound2.from({
                        from: this.session.selfId,
                        commitment: selfCommitment,
                  }),
            ];

            return {
                  broadcasts,
                  inputForRound2: {
                        inputRound1: this.input,
                        selfVSSpolynomial,
                        selfCommitment,
                        selfRID,
                        chainKey,
                        selfShare,
                        elGamalPublic,
                        selfPaillierPublic,
                        selfPedersenPublic,
                        elGamalSecret,
                        paillierSecret,
                        pedersenSecret,
                        schnorrRand,
                        decommitment,
                  },
            };
      }
}
