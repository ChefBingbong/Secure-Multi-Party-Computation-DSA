import { secp256k1 } from "@noble/curves/secp256k1";
import { AffinePoint, AffinePointJSON } from "./types";
import { PaillierPublicKey } from "./paillierKeyPair/paillierPublicKey";
import { PaillierSecretKey } from "./paillierKeyPair/paillierSecretKey";
import {
      PaillierPublicKeyJSON,
      PaillierSecretKeyJSON,
} from "./paillierKeyPair/types";
import { PedersenParams } from "./Pedersen/pendersen";
import { PedersenParametersJSON } from "./Pedersen/types";
import { lagrange } from "./polynomial/lagrange";
import { bytesToNumberBE } from "@noble/curves/abstract/utils";
import { utf8ToBytes } from "@noble/hashes/utils";
import { Hashable, IngestableBasic } from "./utils/hasher";
import { pointFromJSON, pointToJSON } from "./curve";

export type PartyId = string;

export class PartyPublicKeyConfig implements Hashable {
      public partyId: PartyId;
      public ecdsa: AffinePoint;
      public elgamal: AffinePoint;
      public paillier: PaillierPublicKey;
      public pedersen: PedersenParams;

      private constructor(
            partyId: PartyId,
            ecdsa: AffinePoint,
            elgamal: AffinePoint,
            paillier: PaillierPublicKey,
            pedersen: PedersenParams
      ) {
            this.partyId = partyId;
            this.ecdsa = ecdsa;
            this.elgamal = elgamal;
            this.paillier = paillier;
            this.pedersen = pedersen;
      }

      public static fromJSON(
            serialized: PartyPublicKeyConfigJSON
      ): PartyPublicKeyConfig {
            const n = BigInt("0x" + serialized.paillier.nHex);
            const pcfg = new PartyPublicKeyConfig(
                  serialized.partyId,
                  pointFromJSON(serialized.ecdsa),
                  pointFromJSON(serialized.elgamal),
                  new PaillierPublicKey(n),
                  new PedersenParams(
                        BigInt("0x" + serialized.pedersen.nHex),
                        BigInt("0x" + serialized.pedersen.sHex),
                        BigInt("0x" + serialized.pedersen.tHex)
                  )
            );
            Object.freeze(pcfg);
            return pcfg;
      }

      public static from({
            partyId,
            ecdsa,
            elgamal,
            paillier,
            pedersen,
      }: {
            partyId: PartyId;
            ecdsa: AffinePoint;
            elgamal: AffinePoint;
            paillier: PaillierPublicKey;
            pedersen: PedersenParams;
      }): PartyPublicKeyConfig {
            const pcfg = new PartyPublicKeyConfig(
                  partyId,
                  ecdsa,
                  elgamal,
                  paillier,
                  pedersen
            );
            Object.freeze(pcfg);
            return pcfg;
      }

      public toJSON(): PartyPublicKeyConfigJSON {
            return {
                  partyId: this.partyId,
                  ecdsa: pointToJSON(this.ecdsa),
                  elgamal: pointToJSON(this.elgamal),
                  paillier: { nHex: this.paillier.n.toString(16) },
                  pedersen: {
                        nHex: this.pedersen.n.toString(16),
                        sHex: this.pedersen.s.toString(16),
                        tHex: this.pedersen.t.toString(16),
                  },
            };
      }

      public hashable(): IngestableBasic[] {
            return [
                  this.ecdsa.x,
                  this.ecdsa.y,
                  this.elgamal.x,
                  this.elgamal.y,
                  ...[this.paillier.n, this.paillier.n2, this.paillier.n1],
                  ...[this.pedersen.n, this.pedersen.s, this.pedersen.t],
            ];
      }
}

export type PartyPublicKeyConfigJSON = {
      partyId: string;
      ecdsa: AffinePointJSON;
      elgamal: AffinePointJSON;
      paillier: PaillierPublicKeyJSON;
      pedersen: PedersenParametersJSON;
};

export class PartySecretKeyConfig implements Hashable {
      public curve: "secp256k1";
      public partyId: PartyId;
      public threshold: number;
      public ecdsa: bigint;
      public elgamal: bigint;
      public paillier: PaillierSecretKey;
      public rid: bigint;
      public chainKey: bigint;
      public publicPartyData: Record<PartyId, PartyPublicKeyConfig>;

      private constructor(
            curve: "secp256k1",
            partyId: PartyId,
            threshold: number,
            ecdsa: bigint,
            elgamal: bigint,
            paillier: PaillierSecretKey,
            rid: bigint,
            chainKey: bigint,
            publicPartyData: Record<PartyId, PartyPublicKeyConfig>
      ) {
            this.curve = curve;
            this.partyId = partyId;
            this.threshold = threshold;
            this.ecdsa = ecdsa;
            this.elgamal = elgamal;
            this.paillier = paillier;
            this.rid = rid;
            this.chainKey = chainKey;
            this.publicPartyData = publicPartyData;
      }

      public static fromJSON(
            serialized: PartySecretKeyConfigJSON
      ): PartySecretKeyConfig {
            const publicPartyData = Object.fromEntries(
                  Object.entries(serialized.publicPartyData).map(
                        ([partyId, partyPublicKeyConfigSerialized]) => [
                              partyId,
                              PartyPublicKeyConfig.fromJSON(
                                    partyPublicKeyConfigSerialized
                              ),
                        ]
                  )
            );

            const scfg = new PartySecretKeyConfig(
                  serialized.curve,
                  serialized.partyId,
                  serialized.threshold,
                  BigInt("0x" + serialized.ecdsaHex),
                  BigInt("0x" + serialized.elgamalHex),
                  new PaillierSecretKey(
                        BigInt("0x" + serialized.paillier.pHex),
                        BigInt("0x" + serialized.paillier.qHex)
                  ),
                  BigInt("0x" + serialized.ridHex),
                  BigInt("0x" + serialized.chainKeyHex),
                  publicPartyData
            );
            Object.freeze(scfg);
            return scfg;
      }

      public static from({
            curve,
            partyId,
            threshold,
            ecdsa,
            elgamal,
            paillier,
            rid,
            chainKey,
            publicPartyData,
      }: {
            curve: "secp256k1";
            partyId: PartyId;
            threshold: number;
            ecdsa: bigint;
            elgamal: bigint;
            paillier: PaillierSecretKey;
            rid: bigint;
            chainKey: bigint;
            publicPartyData: Record<PartyId, PartyPublicKeyConfig>;
      }): PartySecretKeyConfig {
            const scfg = new PartySecretKeyConfig(
                  curve,
                  partyId,
                  threshold,
                  ecdsa,
                  elgamal,
                  paillier,
                  rid,
                  chainKey,
                  publicPartyData
            );
            Object.freeze(scfg);
            return scfg;
      }

      public toJSON(): PartySecretKeyConfigJSON {
            const publicPartyData = Object.fromEntries(
                  Object.entries(this.publicPartyData).map(
                        ([partyId, partyPublicKeyConfig]) => [
                              partyId,
                              partyPublicKeyConfig.toJSON(),
                        ]
                  )
            );

            return {
                  curve: this.curve,
                  partyId: this.partyId,
                  threshold: this.threshold,
                  ecdsaHex: this.ecdsa.toString(16),
                  elgamalHex: this.elgamal.toString(16),
                  paillier: {
                        pHex: this.paillier.p.toString(16),
                        qHex: this.paillier.q.toString(16),
                  },
                  ridHex: this.rid.toString(16),
                  chainKeyHex: this.chainKey.toString(16),
                  publicPartyData,
            };
      }

      public publicPoint(): AffinePoint {
            let sum = secp256k1.ProjectivePoint.ZERO;
            const partyIds = Object.keys(this.publicPartyData).sort();
            const lag = lagrange(partyIds);
            for (const partyId of partyIds) {
                  const partyPoint = secp256k1.ProjectivePoint.fromAffine(
                        this.publicPartyData[partyId].ecdsa
                  ).multiply(lag[partyId]);
                  sum = sum.add(partyPoint);
            }
            return sum.toAffine();
      }

      public hashable(): IngestableBasic[] {
            return [
                  BigInt(this.threshold),
                  ...Object.keys(this.publicPartyData).sort(),
                  this.rid,
                  ...Object.values(this.publicPartyData).flatMap((p) =>
                        p.hashable()
                  ),
            ];
      }
}

export type PartySecretKeyConfigJSON = {
      curve: "secp256k1";
      partyId: string;
      threshold: number;
      ecdsaHex: string;
      elgamalHex: string;
      paillier: PaillierSecretKeyJSON;
      ridHex: string; // TODO
      chainKeyHex: string; // TODO
      publicPartyData: Record<string, PartyPublicKeyConfigJSON>;
};

export const otherPartyIds = (
      partyIds: Array<PartyId>,
      selfId: PartyId
): Array<PartyId> => {
      return partyIds.filter((partyId) => partyId !== selfId);
};

export const partyIdToScalar = (partyId: PartyId): bigint => {
      return bytesToNumberBE(utf8ToBytes(partyId));
};
