import { ripemd160 as createRipemd160 } from "@noble/hashes/ripemd160";
import { bech32 } from "bech32";
import base58 from "bs58";
import { sha256 as createSha256 } from "@noble/hashes/sha256";
import {
      BitcoinNetworkConfig,
      BitcoinNetworkConfigMap,
      BitcoinNetworkInput,
      isBitcoinNetworkConfig,
} from "./types";
import { assertType, concat } from "./assert";

export const addressToBytes = (address: string): Uint8Array => {
      // Attempt to decode address as a bech32 address, and if that fails
      // fall back to base58.
      try {
            const [type, ...words] = bech32.decode(address).words;
            return concat([new Uint8Array([type]), new Uint8Array(bech32.fromWords(words))]);
      } catch (error: unknown) {
            try {
                  return new Uint8Array(base58.decode(address));
            } catch (internalError) {
                  throw new Error(`Unrecognized address format "${address}".`);
            }
      }
};

export const StandardBitcoinExplorer = (baseUrl: string): BitcoinNetworkConfig["explorer"] => ({
      url: baseUrl,
      address: (address: string) => `${baseUrl.replace(/\/$/, "")}/address/${address}`,
      transaction: (transaction: string) => `${baseUrl.replace(/\/$/, "")}/tx/${transaction || ""}`,
});

export const SoChainExplorer = (chainPath: string, chainId: string): BitcoinNetworkConfig["explorer"] => ({
      url: `https://sochain.com/${chainPath}`,
      address: (address: string) => `https://sochain.com/address/${chainId}/${address}`,
      transaction: (transaction: string) => `https://sochain.com/tx/${chainId}/${transaction}`,
});

export const resolveBitcoinNetworkConfig = (
      configMap: BitcoinNetworkConfigMap,
      renNetwork: BitcoinNetworkInput
): BitcoinNetworkConfig => {
      let networkConfig: BitcoinNetworkConfig | undefined;
      if (renNetwork && isBitcoinNetworkConfig(renNetwork)) {
            networkConfig = renNetwork;
      } else {
            // @ts-ignore
            networkConfig = configMap[renNetwork];
      }

      if (!networkConfig) {
            throw new Error(
                  `Unsupported network '${String(
                        renNetwork
                              ? typeof renNetwork === "string"
                                    ? renNetwork
                                    : renNetwork.selector
                              : renNetwork
                  )}'. Valid options are 'mainnet', 'testnet' or a BitcoinNetworkConfig object.`
            );
      }

      return networkConfig;
};

/** Calculate the ripemd160 hash of the input. */
export const ripemd160 = (...msg: Uint8Array[]): Uint8Array => {
      assertType<Uint8Array[]>("Uint8Array[]", { msg });
      return new Uint8Array(createRipemd160(concat(msg)));
};

export const fromHex = (hexString: string): Uint8Array => {
      assertType<string>("string", { hex: hexString });
      hexString = strip0x(hexString);
      if (hexString.length % 2) {
            hexString = "0" + hexString;
      }
      const match = hexString.match(/.{1,2}/g);
      if (!match) {
            return new Uint8Array();
      }
      return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
};

export const toHex = (array: Uint8Array): string =>
      array.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");

export const strip0x = (hex: string): string => {
      assertType<string>("string", { hex });
      return hex.substring(0, 2) === "0x" ? hex.slice(2) : hex;
};
export const sha256 = (...msg: Uint8Array[]): Uint8Array => {
      assertType<Uint8Array[]>("Uint8Array[]", { msg });
      return new Uint8Array(createSha256(concat(msg)));
};

export const hash160 = (...msg: Uint8Array[]): Uint8Array => {
      assertType<Uint8Array[]>("Uint8Array[]", { msg });
      return ripemd160(sha256(concat(msg)));
};

export const txHashToBytes = (txHash: string): Uint8Array => {
      return fromHex(txHash).reverse();
};
export const txHashFromBytes = (bytes: Uint8Array): string => {
      // Create new Uint8Array before reversing to avoid modifying the input
      // array.
      return toHex(new Uint8Array(bytes).reverse());
};
