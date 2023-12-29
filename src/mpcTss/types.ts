import { secp256k1 } from '@noble/curves/secp256k1';

// Extract some types from @noble/curves because they're not exported
export type AffinePoint = Parameters<typeof secp256k1.ProjectivePoint.fromAffine>[0];
export type ProjectivePoint = ReturnType<typeof secp256k1.ProjectivePoint.fromAffine>;

export type AffinePointJSON = {
  xHex: string,
  yHex: string,
}

export type PublicKey = {
      readonly n: bigint;
      readonly n2: bigint;
      readonly g: bigint;
};

export type PrivateKey = {
      readonly lambda: bigint;
      readonly mu: bigint;
};

export type KeyPair = {
      readonly pub: PublicKey;
      readonly priv: PrivateKey;
};
