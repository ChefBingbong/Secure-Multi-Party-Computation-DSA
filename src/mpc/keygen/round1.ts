import { randBetween } from "bigint-crypto-utils";
import { Exponent } from "../math/polynomial/exponent";
import { generateElGamalKeyPair } from "../math/sample";
import { randomPaillierPrimes } from "../paillierKeyPair/paillierCryptoUtils";
import { PaillierSecretKey } from "../paillierKeyPair/paillierSecretKey";
import { zkSchCreateRandomness } from "../zk/zksch";
import { AbstractKeygenRound } from "./abstractRound";
import { partyIdToScalar } from "./partyKey";
import { KeygenBroadcastForRound2 } from "./round2";
import { KeygenInputForRound1, KeygenInputForRound2, KeygenRound1Output } from "./types";
// import { validatePaillierPrime } from "../paillierKeygen";

export class KeygenRound1 extends AbstractKeygenRound {
      public output: KeygenInputForRound2;
      constructor() {
            super({ isBroadcastRound: true, isDriectMessageRound: false, currentRound: 1 });
      }

      public fromJSON(json: any): void {}
      public fromJSOND(json: any): void {}

      public handleBroadcastMessage(bmsg: any): void {}
      public handleDirectMessage(bmsg: any): void {}

      public async process(): Promise<KeygenRound1Output> {
            // generate large random primes and use these to create a paillier keypair
            const { p, q } = await randomPaillierPrimes();
            const paillierSecret = new PaillierSecretKey(p, q);

            // a pedersen commit is used to add extra security with the
            // paillier key pair
            const selfPaillierPublic = paillierSecret.publicKey;
            const { pedersen: selfPedersenPublic, lambda: pedersenSecret } = paillierSecret.generatePedersen();

            const [elGamalSecret, elGamalPublic] = generateElGamalKeyPair();

            const selfShare = this.session.output.vssSecret.evaluate(partyIdToScalar(this.session.selfId));

            const selfVSSpolynomial = Exponent.fromPoly(this.session.output.vssSecret);

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

            this.output = {
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
            };
            return {
                  broadcasts,
                  // @ts-ignore
                  inputForRound2: this.output,
            };
      }
}
