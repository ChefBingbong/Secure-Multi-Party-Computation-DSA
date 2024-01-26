import BigNumber from "bignumber.js";
import base58 from "bs58";
import { validate } from "wallet-address-validator";
import { tryNTimes } from "../rpc/utils/helpers";
import { sleep } from "../utils/sleep";
import { APIWithPriority, BitcoinAPI, CombinedAPI } from "./Api/apiUtils";
import { createAddressArray } from "./script/index";
import {
      BitcoinInputPayload,
      BitcoinNetworkConfig,
      BitcoinNetworkConfigMap,
      BitcoinNetworkInput,
      isBitcoinNetworkConfig,
} from "./utils/types";
import { addressToBytes, hash160, txHashFromBytes, txHashToBytes } from "./utils/utils";

/**
 * A base Bitcoin chain class that is extended by each Bitcoin chain/fork.
 */
export abstract class BitcoinBaseChain {
      public static chain: string;
      public chain: string;
      public assets: { [asset: string]: string } = {};

      public static configMap: BitcoinNetworkConfigMap = {};
      public configMap: BitcoinNetworkConfigMap = {};

      public network: BitcoinNetworkConfig;

      public api = new CombinedAPI();

      public constructor({ network }: { network: BitcoinNetworkInput }) {
            const networkConfig = isBitcoinNetworkConfig(network) ? network : this.configMap[network];
            if (!networkConfig) {
                  if (typeof network === "string") {
                        throw new Error(`Unknown network ${network}.`);
                  } else {
                        throw new Error(`Invalid network config.`);
                  }
            }
            this.network = networkConfig;
            this.chain = this.network.selector;
            for (const provider of this.network.providers) {
                  this.withAPI(provider);
            }
      }

      public withAPI = (api: BitcoinAPI | APIWithPriority, { priority = 0 } = {}): this => {
            this.api.withAPI(api, { priority });
            return this;
      };

      public addressExplorerLink = (address: string): string | undefined => {
            return this.network.explorer.address(address);
      };

      public getBalance = async (
            asset: string,
            address: string
            // eslint-disable-next-line @typescript-eslint/require-await
      ): Promise<BigNumber> => {
            this._assertAssetIsSupported(asset);
            if (!this.validateAddress(address)) {
                  throw new Error(`Invalid address ${address}.`);
            }
            // TODO: Implement.
            return new BigNumber(0);
      };

      public validateAddress = (address: string): boolean => {
            try {
                  return validate(
                        address,
                        this.network.nativeAsset.symbol,
                        this.network.isTestnet ? "testnet" : "prod"
                  );
            } catch (error) {
                  return false;
            }
      };

      public addressToBytes = (address: string): Uint8Array => {
            return addressToBytes(address);
      };

      public addressFromBytes = (bytes: Uint8Array): string => {
            return base58.encode(bytes);
      };

      public txHashToBytes = (txHash: string): Uint8Array => {
            return txHashToBytes(txHash);
      };

      public txHashFromBytes = (bytes: Uint8Array): string => {
            return txHashFromBytes(bytes);
      };

      public isLockAsset = (asset: string): boolean => {
            return asset === this.network.nativeAsset.symbol;
      };

      public isDepositAsset = (asset: string): boolean => {
            this._assertAssetIsSupported(asset);
            return true;
      };

      private _assertAssetIsSupported = (asset: string) => {
            if (!this.isLockAsset(asset)) {
                  throw new Error(`Asset ${asset} not supported on ${this.chain}.`);
            }
      };

      /**
       * See [[LockChain.assetDecimals]].
       */
      public assetDecimals = (asset: string): number => {
            this._assertAssetIsSupported(asset);
            return 8;
      };

      public watchForDeposits = async (
            asset: string,
            fromPayload: BitcoinInputPayload,
            address: string,
            onInput: (input: any) => void,
            _removeInput: (input: any) => void,
            listenerCancelled: () => boolean
      ): Promise<void> => {
            this._assertAssetIsSupported(asset);
            if (fromPayload.chain !== this.chain) {
                  throw new Error(`Invalid payload for chain ${fromPayload.chain} instead of ${this.chain}.`);
            }

            // If the payload is a transaction, submit it to onInput and then loop
            // indefinitely.
            if (fromPayload.type === "transaction") {
                  const inputTx = fromPayload.params.tx;
                  if ((inputTx as any).amount === undefined) {
                        while (true) {
                              try {
                                    const tx = await this.api.fetchUTXO(inputTx.txHash, inputTx.txindex);
                                    //
                                    // do procesiesing
                                    break;
                              } catch (error: unknown) {
                                    console.error(error);
                              }
                        }

                        while (true) {
                              await sleep(15 * 1000);
                        }
                  }
            }

            try {
                  const txs = await tryNTimes(async () => this.api.fetchTXs(address), 2);
                  txs.map((tx) =>
                        // do processing
                        {}
                  );
            } catch (error: unknown) {
                  // Ignore error and fallback to getUTXOs.
            }

            while (!listenerCancelled()) {
                  try {
                        const utxos = await this.api.fetchUTXOs(address);
                        utxos.map((tx) =>
                              // do processing
                              {}
                        );
                  } catch (error: unknown) {
                        console.error(error);
                  }
                  await sleep(15 * sleep.SECONDS);
            }
      };

      public createGatewayAddress = (
            asset: string,
            fromPayload: BitcoinInputPayload,
            shardPublicKey: Uint8Array,
            gHash: Uint8Array
      ): Promise<string> | string => {
            this._assertAssetIsSupported(asset);
            if (fromPayload.chain !== this.chain) {
                  throw new Error(`Invalid payload for chain ${fromPayload.chain} instead of ${this.chain}.`);
            }
            return this.addressFromBytes(
                  createAddressArray(hash160(shardPublicKey), gHash, this.network.p2shPrefix)
            );
      };

      public toSats = (value: BigNumber | string | number): string => {
            return new BigNumber(value).shiftedBy(8).decimalPlaces(0).toFixed();
      };

      public fromSats = (value: BigNumber | string | number): string => {
            return new BigNumber(value).shiftedBy(-8).toFixed();
      };
}
