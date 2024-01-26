import { Blockchair, BlockchairNetwork } from "./Api/blockchair";
import { BitcoinBaseChain } from "./abstractBitcoinAdapter";
import { BitcoinNetworkConfig, BitcoinNetworkConfigMap, BitcoinNetworkInput } from "./utils/types";
import { resolveBitcoinNetworkConfig, StandardBitcoinExplorer } from "./utils/utils";

const BitcoinMainnet: BitcoinNetworkConfig = {
      label: "Bitcoin",

      selector: "Bitcoin",

      nativeAsset: {
            name: "Bitcoin",
            symbol: "BTC",
            decimals: 8,
      },
      averageConfirmationTime: 60 * 10,

      explorer: StandardBitcoinExplorer("https://live.blockcypher.com/btc/"),
      p2shPrefix: new Uint8Array([0x05]),
      providers: [new Blockchair()],
      // validateAddress: (address: string) =>
      //     validateAddress(address, "BTC", "mainnet"),
};

const BitcoinTestnet: BitcoinNetworkConfig = {
      label: "Bitcoin Testnet",

      selector: "Bitcoin",

      nativeAsset: {
            name: "Testnet Bitcoin",
            symbol: "BTC",
            decimals: 8,
      },
      averageConfirmationTime: 60 * 10,

      isTestnet: true,
      explorer: StandardBitcoinExplorer("https://live.blockcypher.com/btc-testnet/"),
      p2shPrefix: new Uint8Array([0xc4]),
      providers: [new Blockchair(BlockchairNetwork.BITCOIN_TESTNET)],
      // validateAddress: (address: string) =>
      //     validateAddress(address, "BTC", "testnet"),
};
enum BitcoinNertwork {
      Mainet = "Mainet",
      Testnet = "Testnet",
}

export class Bitcoin extends BitcoinBaseChain {
      public static chain = "Bitcoin" as const;
      public static configMap: BitcoinNetworkConfigMap = {
            [BitcoinNertwork.Mainet]: BitcoinMainnet,
            [BitcoinNertwork.Testnet]: BitcoinTestnet,
      };
      public configMap = Bitcoin.configMap;

      public static assets = {
            [BitcoinNertwork.Mainet]: {
                  BTC: "BTC",
            },
            [BitcoinNertwork.Testnet]: {
                  BTC: "BTC",
            },
      };

      public assets:
            | (typeof Bitcoin.assets)[BitcoinNertwork.Mainet]
            | (typeof Bitcoin.assets)[BitcoinNertwork.Testnet];

      public constructor({ network }: { network: BitcoinNetworkInput }) {
            super({
                  network: resolveBitcoinNetworkConfig(Bitcoin.configMap, network),
            });
            this.assets =
                  Bitcoin.assets[this.network.isTestnet ? BitcoinNertwork.Testnet : BitcoinNertwork.Mainet];
      }
}
