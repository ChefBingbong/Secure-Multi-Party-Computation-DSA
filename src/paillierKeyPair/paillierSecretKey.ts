import { modInv, modMultiply, modPow, randBetween } from "bigint-crypto-utils";
import { PedersenParams } from "../Pedersen/pendersen";
import { sampleUnitModN } from "../sample";
import { modSymmetric } from "./paillierCryptoUtils";
import { PaillierPublicKey } from "./paillierPublicKey";

export class PaillierSecretKey {
      public p: bigint;
      public q: bigint;
      public phi: bigint;
      public phiInv: bigint;
      public publicKey: PaillierPublicKey;

      public constructor(p: bigint, q: bigint) {
            const n = p * q;
            const phi = (p - 1n) * (q - 1n);
            const phiInv = modInv(phi, n);
            const publicKey = new PaillierPublicKey(n);

            this.p = p;
            this.q = q;
            this.phi = phi;
            this.phiInv = phiInv;
            this.publicKey = publicKey;
      }

      public decrypt(ciphertext: bigint): bigint {
            if (!this.publicKey.validateCiphertext(ciphertext)) {
                  throw new Error("INVALID_CIPHERTEXT");
            }

            const c1 = modPow(ciphertext, this.phi, this.publicKey.n2);
            const c2 = c1 - 1n;
            const c3 = c2 / this.publicKey.n;
            const c4 = modMultiply([c3, this.phiInv], this.publicKey.n);
            const message = modSymmetric(c4, this.publicKey.n);

            return message;
      }

      public generatePedersen(): {
            pedersen: PedersenParams;
            lambda: bigint;
      } {
            const lambda = randBetween(this.phi);
            const tau = sampleUnitModN(this.publicKey.n);
            const t = modMultiply([tau, tau], this.publicKey.n);
            const s = modPow(t, lambda, this.publicKey.n);
            const pedersen = new PedersenParams(this.publicKey.n, s, t);
            return { pedersen, lambda };
      }
}
