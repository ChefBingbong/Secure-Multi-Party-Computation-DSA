import { APIWithPriority, BitcoinAPI } from "../Api/apiUtils";

export type BitcoinInputPayload =
      | {
              chain: string;
              type?: "gatewayAddress";
        }
      | {
              chain: string;
              type: "transaction";
              params: {
                    tx: any;
              };
        };

export interface BitcoinOutputPayload {
      chain: string;
      type?: "address";
      params: {
            address: string;
      };
}

export enum Network {
      Mainet = "Mainet",
      Testnet = "Testnet",
}
export type BitcoinNetworkConfigMap = {
      [network in Network]?: BitcoinNetworkConfig;
};

export interface BitcoinNetworkConfig {
      label: string;

      selector: string;

      nativeAsset: {
            name: string;
            symbol: string;
            decimals: number;
      };
      averageConfirmationTime: number;

      isTestnet?: boolean;
      p2shPrefix: Uint8Array;
      explorer: {
            url: string;
            address: (address: string) => string;
            transaction: (txid: string) => string;
      };
      providers: Array<BitcoinAPI | APIWithPriority>;
}

export const isBitcoinNetworkConfig = (input: unknown): input is BitcoinNetworkConfig =>
      !!(input as BitcoinNetworkConfig).label &&
      !!(input as BitcoinNetworkConfig).selector &&
      !!(input as BitcoinNetworkConfig).nativeAsset &&
      !!(input as BitcoinNetworkConfig).p2shPrefix &&
      !!(input as BitcoinNetworkConfig).explorer &&
      !!(input as BitcoinNetworkConfig).providers;

export type BitcoinNetworkInput = BitcoinNetworkConfig;
