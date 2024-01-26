import { createHash } from "crypto";
import crypto from "crypto";
import { AffinePoint } from "./types";
import { numberToBytesBE } from "@noble/curves/abstract/utils";
import base58 from "bs58";

export const btcAddress = (pub: AffinePoint) => {
      const xBytes = numberToBytesBE(pub.x, 32);
      const yBytes = numberToBytesBE(pub.y, 32);
      const pubKeyBytes = Buffer.concat([Buffer.from([0x04]), xBytes, yBytes], 65);
      const hash = crypto.createHash("sha256").update(pubKeyBytes).digest();
      const publicKeyHash = createHash("rmd160").update(hash).digest();
      const addressBytes = Buffer.concat([Buffer.from([0x00]), publicKeyHash], 21);
      const checksum = crypto.createHash("sha256").update(addressBytes).digest();
      const checksumHash = crypto.createHash("sha256").update(checksum).digest().slice(0, 4);
      const address = Buffer.concat([addressBytes, checksumHash]);
      return base58Encode(address);
};

export const btcTestnetAddress = (pub: AffinePoint) => {
      const xBytes = numberToBytesBE(pub.x, 32);
      const yBytes = numberToBytesBE(pub.y, 32);
      const pubKeyBytes = Buffer.concat([Buffer.from([0x04]), xBytes, yBytes], 65);
      const hash = crypto.createHash("sha256").update(pubKeyBytes).digest();
      const publicKeyHash = createHash("rmd160").update(hash).digest();
      // Use testnet address version (0x6F) instead of mainnet version (0x00)
      const addressBytes = Buffer.concat([Buffer.from([0x6f]), publicKeyHash], 21);

      const checksum = crypto.createHash("sha256").update(addressBytes).digest();
      const checksumHash = crypto.createHash("sha256").update(checksum).digest().slice(0, 4);

      const address = Buffer.concat([addressBytes, checksumHash]);
      return base58.encode(address);
};

export const base58Encode = (buffer: Buffer) => {
      const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      let num = BigInt("0x" + buffer.toString("hex"));
      let base58 = "";

      while (num > BigInt(0)) {
            const remainder = Number(num % BigInt(58));
            base58 = ALPHABET[remainder] + base58;
            num = num / BigInt(58);
      }

      for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] !== 0x00) break;
            base58 = "1" + base58;
      }

      return base58;
};
