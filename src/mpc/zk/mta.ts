import { Hasher } from "../utils/hasher";
import { AffinePoint } from "../types";
import {
      paillierAdd,
      paillierMultiply,
      PaillierPublicKey,
      PaillierSecretKey,
} from "../paillierKeyPair/paillierKeygen";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { sampleIntervalLprime } from "../math/sample";
import { ZkAffgPrivate, ZkAffgProof, ZkAffgPublic, zkAffgCreateProof } from "../zk/affg";
import { ZkAffpPrivate, ZkAffpProof, ZkAffpPublic, zkAffpCreateProof } from "../zk/affp";

export const mtaProveAffG = (
      senderSecretShare: bigint,
      senderSecretSharePoint: AffinePoint,
      receiverEncryptedShare: bigint, // Ciphertext
      sender: PaillierSecretKey,
      receiver: PaillierPublicKey,
      verifier: PedersenParams,
      hasher: Hasher
): {
      Beta: bigint;
      D: bigint; // Ciphertext
      F: bigint; // Ciphertext
      proof: ZkAffgProof;
} => {
      const { D, F, S, R, BetaNeg } = mtaNew(senderSecretShare, receiverEncryptedShare, sender, receiver);

      const pub: ZkAffgPublic = {
            Kv: receiverEncryptedShare,
            Dv: D,
            Fp: F,
            Xp: senderSecretSharePoint,
            prover: sender.publicKey,
            verifier: receiver,
            aux: verifier,
      };
      const priv: ZkAffgPrivate = {
            X: senderSecretShare,
            Y: BetaNeg,
            S,
            R,
      };
      const proof = zkAffgCreateProof(pub, priv, hasher);

      const Beta = -BetaNeg;

      return { Beta, D, F, proof };
};

export const mtaProveAffP = (
      senderSecretShare: bigint,
      senderEncryptedShare: bigint, // Ciphertext
      senderEncryptedShareNonce: bigint,
      receiverEncryptedShare: bigint, // Ciphertext
      sender: PaillierSecretKey,
      receiver: PaillierPublicKey,
      verifier: PedersenParams,
      hasher: Hasher
): {
      Beta: bigint;
      D: bigint; // Ciphertext
      F: bigint; // Ciphertext
      proof: ZkAffpProof;
} => {
      const { D, F, S, R, BetaNeg } = mtaNew(senderSecretShare, receiverEncryptedShare, sender, receiver);

      const pub: ZkAffpPublic = {
            Kv: receiverEncryptedShare,
            Dv: D,
            Fp: F,
            Xp: senderEncryptedShare,
            prover: sender.publicKey,
            verifier: receiver,
            aux: verifier,
      };
      const priv: ZkAffpPrivate = {
            X: senderSecretShare,
            Y: BetaNeg,
            S,
            Rx: senderEncryptedShareNonce,
            R,
      };
      const proof = zkAffpCreateProof(pub, priv, hasher);

      const Beta = -BetaNeg;

      return { Beta, D, F, proof };
};

export const mtaNew = (
      senderSecretShare: bigint,
      receiverEncryptedShare: bigint, // Ciphertext
      sender: PaillierSecretKey,
      receiver: PaillierPublicKey
): {
      D: bigint; // Ciphertext
      F: bigint; // Ciphertext
      S: bigint;
      R: bigint;
      BetaNeg: bigint;
} => {
      const BetaNeg = sampleIntervalLprime();

      const { ciphertext: F, nonce: R } = sender.publicKey.encrypt(BetaNeg);

      const { ciphertext: D_, nonce: S } = receiver.encrypt(BetaNeg);
      const D = paillierAdd(receiver, D_, paillierMultiply(receiver, receiverEncryptedShare, senderSecretShare));

      return { D, F, S, R, BetaNeg };
};
