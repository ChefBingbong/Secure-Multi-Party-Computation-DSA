import { modInv, modMultiply, modPow, randBetween } from "bigint-crypto-utils";
import { JSONable, PedersenParams } from "./Pedersen/pendersen";
import { sampleUnitModN } from "../math/sample";
import { modSymmetric } from "./paillierCryptoUtils";
import { PaillierPublicKey } from "./paillierPublicKey";
import { PaillierSecretKeyJSON } from "./types";

export class PaillierSecretKey {
      public p: bigint;
      public q: bigint;
      public phi: bigint;
      public phiInv: bigint;
      public publicKey: PaillierPublicKey;

      public constructor(p: bigint, q: bigint, x?: any, y?: any, z?: any) {
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

      public static fromJSON(secretKeyJson: PaillierSecretKeyJSON): PaillierSecretKey {
            const p = BigInt("0x" + secretKeyJson.pHex);
            const q = BigInt("0x" + secretKeyJson.qHex);
            return PaillierSecretKey.fromPrimes(p, q);
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
      public static fromPrimes = (p: bigint, q: bigint): PaillierSecretKey => {
            const n = p * q;
            const phi = (p - 1n) * (q - 1n);
            const phiInv = modInv(phi, n);
            const publicKey: PaillierPublicKey = PaillierPublicKey.fromN(n);
            const paillierSecretKey = new PaillierSecretKey(p, q, phi, phiInv, publicKey);
            Object.freeze(paillierSecretKey);
            return paillierSecretKey;
      };

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
