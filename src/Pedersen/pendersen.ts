import { gcd, modPow, modMultiply } from "bigint-crypto-utils";
import { Hashable, IngestableBasic } from "../utils/hasher";

export class PedersenParams implements Hashable {
      public n: bigint;
      public s: bigint;
      public t: bigint;

      public constructor(n: bigint, s: bigint, t: bigint) {
            this.n = n;
            this.s = s;
            this.t = t;
      }

      public hashable(): IngestableBasic[] {
            return [this.n, this.s, this.t];
      }

      public static validateParams(n: bigint, s: bigint, t: bigint): void {
            if (n <= 0n) {
                  throw new Error("INVALID_PEDERSEN_PARAMETERS: n must be positive");
            }
            if (s <= 0n) {
                  throw new Error("INVALID_PEDERSEN_PARAMETERS: s must be positive");
            }
            if (t <= 0n) {
                  throw new Error("INVALID_PEDERSEN_PARAMETERS: t must be positive");
            }
            if (s >= n) {
                  throw new Error(
                        "INVALID_PEDERSEN_PARAMETERS: s must be less than n"
                  );
            }
            if (t >= n) {
                  throw new Error(
                        "INVALID_PEDERSEN_PARAMETERS: t must be less than n"
                  );
            }
            if (s === t) {
                  throw new Error(
                        "INVALID_PEDERSEN_PARAMETERS: s and t must be different"
                  );
            }
            if (gcd(s, n) !== 1n) {
                  throw new Error(
                        "INVALID_PEDERSEN_PARAMETERS: s must be coprime to n"
                  );
            }
            if (gcd(t, n) !== 1n) {
                  throw new Error(
                        "INVALID_PEDERSEN_PARAMETERS: t must be coprime to n"
                  );
            }
      }

      public validate(): void {
            PedersenParams.validateParams(this.n, this.s, this.t);
      }

      public commit(x: bigint, y: bigint): bigint {
            const sx = modPow(this.s, x, this.n);
            const ty = modPow(this.t, y, this.n);
            return modMultiply([sx, ty], this.n);
      }

      public verify(a: bigint, b: bigint, e: bigint, S: bigint, T: bigint): boolean {
            try {
                  PedersenParams.validateParams(this.n, S, T);
            } catch (error) {
                  // TODO: check error type
                  return false;
            }

            const sa = modPow(this.s, a, this.n);
            const tb = modPow(this.t, b, this.n);
            const lhs = modMultiply([sa, tb], this.n);

            const te = modPow(T, e, this.n);
            const rhs = modMultiply([te, S], this.n);
            return lhs === rhs;
      }
}
