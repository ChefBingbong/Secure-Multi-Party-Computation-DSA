import { Bitcoin } from "./bitcoinAdapter";
import { Network } from "./utils/types";

async function main() {
      //@ts-ignore
      const btc = new Bitcoin({ network: Network.Testnet });
      btc.watchForDeposits(
            "BTC",
            { type: "gatewayAddress", chain: "Bitcoin" },
            "mmJDB1LhUBgVzSVox5rzVVLqpqgZvniGpQ"
      );
}
main();
