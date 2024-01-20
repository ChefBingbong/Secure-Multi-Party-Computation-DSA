import { abs, gcd, modMultiply, modPow } from "bigint-crypto-utils";
import { generateRandomNonce } from "./paillierCryptoUtils";

export class PaillierPublicKey {
      public n: bigint;
      public n2: bigint;
      public n1: bigint;

      public constructor(n: bigint) {
            this.n = n;
            this.n2 = n * n;
            this.n1 = n + 1n;
      }

      public encryptWithNonce(message: bigint, nonce: bigint): bigint {
            const messageAbs = abs(message);
            const nHalf = this.n / 2n;
            if (messageAbs > nHalf) {
                  throw new Error("MESSAGE_TOO_LARGE");
            }
      }

      public encrypt(message: bigint): { ciphertext: bigint; nonce: bigint } {
            if (abs(message) > this.n / 2n) throw new Error("MESSAGE_TOO_LARGE");

            const nonce = generateRandomNonce(this.n);
            const c = modPow(this.n1, message, this.n2);
            const rhoN = modPow(nonce, this.n, this.n2);
            const ciphertext = modMultiply([c, rhoN], this.n2);

            return { ciphertext, nonce };
      }

      public validateCiphertext = (ciphertext: bigint): boolean => {
            if (!(ciphertext < this.n2) || gcd(ciphertext, this.n2) !== 1n) {
                  return false;
            }
            return true;
      };

      public paillierAdd = (ciphertextA: bigint, ciphertextB: bigint): bigint => {
            const ciphertextSum = modMultiply([ciphertextA, ciphertextB], this.n2);
            return ciphertextSum;
      };

      public paillierMultiply = (ciphertext: bigint, scalar: bigint): bigint => {
            const ciphertextProduct = modPow(ciphertext, scalar, this.n2);
            return ciphertextProduct;
      };
}
