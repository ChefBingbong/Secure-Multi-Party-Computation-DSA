import BigNumber from "bignumber.js";
import { extractError } from "../../utils/extractError";

// Numeric fields are represented as strings in case any Bitcoin chain has
// a txindex, an amount or a height that can't be represented by a 64-bit float.
export interface UTXO {
      txid: string;
      txindex: string;
      amount: string;
      height: string | null;
}

export interface BitcoinAPI {
      fetchHeight?: () => Promise<string>;
      fetchUTXO?: (txid: string, txindex: string) => Promise<UTXO>;
      fetchUTXOs?: (address: string, confirmations?: number) => Promise<UTXO[]>;
      fetchTXs?: (address: string, confirmations?: number) => Promise<UTXO[]>;
      broadcastTransaction?: (hex: string) => Promise<string>;
}

// Default timeout for network requests.
const SECONDS = 1000;
export const DEFAULT_TIMEOUT = 30 * SECONDS;

export const sortUTXOs = (a: UTXO, b: UTXO): number => {
      const aHeight = a.height ? new BigNumber(a.height) : null;
      const bHeight = b.height ? new BigNumber(b.height) : null;

      // Compare heights first
      if (aHeight) {
            if (bHeight) {
                  if (!aHeight.isEqualTo(bHeight)) return bHeight.minus(aHeight).toNumber();
            } else {
                  return -1;
            }
      } else if (bHeight) {
            return 1;
      }

      // If the heights are the same (same number of both null), compare amounts.
      const aAmount = new BigNumber(a.amount);
      const bAmount = new BigNumber(b.amount);
      if (aAmount.isEqualTo(bAmount)) {
            return bAmount.minus(aAmount).toNumber();
      }

      // If the heights and amounts are equal, compare txid.
      if (a.txid !== b.txid) {
            return a.txid <= b.txid ? -1 : 1;
      }

      const aTxindex = new BigNumber(a.txindex);
      const bTxindex = new BigNumber(b.txindex);
      return bTxindex.minus(aTxindex).toNumber();
};

export const fixValue = (value: BigNumber | string | number, decimals: number): BigNumber =>
      new BigNumber(value).shiftedBy(decimals).decimalPlaces(0);

export const fixUTXO = (tx: UTXO, decimals: number): UTXO => ({
      ...tx,
      amount: fixValue(tx.amount, decimals).toFixed(),
});

export const fixUTXOs = (utxos: UTXO[], decimals: number): UTXO[] => utxos.map((utxo) => fixUTXO(utxo, decimals));

export interface APIWithPriority {
      api: BitcoinAPI;
      priority: number;
}

const notNull = <T>(x: T | undefined | null): T => {
      if (x === undefined || x === null) {
            throw new Error(`Unexpected ${String(x)} value.`);
      }
      return x;
};

const withPriority = (api: BitcoinAPI | APIWithPriority, defaultPriority = 0) =>
      (api as APIWithPriority).api && (api as APIWithPriority).priority !== undefined
            ? (api as APIWithPriority)
            : { api: api as BitcoinAPI, priority: defaultPriority };

export class CombinedAPI implements BitcoinAPI {
      public apis: APIWithPriority[];

      public constructor(apis: Array<BitcoinAPI | APIWithPriority> = [], { priority = 0 } = {}) {
            this.apis = apis.map((api) => withPriority(api, priority));
      }

      public withAPI = (api: BitcoinAPI | APIWithPriority, { priority = 0 } = {}): this => {
            this.apis.push(withPriority(api, priority));
            return this;
      };

      public fetchHeight = async (): Promise<string> => {
            return this.forEachAPI(
                  (api) => api.fetchHeight !== undefined,
                  (api) => notNull(api.fetchHeight).bind(api)()
            );
      };

      public fetchUTXO = async (txid: string, txindex: string): Promise<UTXO> => {
            return this.forEachAPI(
                  (api) => api.fetchUTXO !== undefined,
                  (api) => notNull(api.fetchUTXO).bind(api)(txid, txindex)
            );
      };

      public fetchUTXOs = async (address: string, confirmations?: number): Promise<UTXO[]> =>
            this.forEachAPI(
                  (api) => api.fetchUTXOs !== undefined,
                  (api) => notNull(api.fetchUTXOs).bind(api)(address, confirmations)
            );

      public fetchTXs = async (address: string, confirmations?: number): Promise<UTXO[]> =>
            this.forEachAPI(
                  (api) => api.fetchTXs !== undefined,
                  (api) => notNull(api.fetchTXs).bind(api)(address, confirmations)
            );

      public broadcastTransaction = async (hex: string): Promise<string> => {
            return this.forEachAPI(
                  (api) => api.broadcastTransaction !== undefined,
                  (api) => notNull(api.broadcastTransaction).bind(api)(hex)
            );
      };

      private forEachAPI = async <T>(
            filter: (api: BitcoinAPI) => boolean,
            onAPI: (api: BitcoinAPI) => Promise<T>
      ) => {
            const apis = this.apis
                  .map((api, index) => ({ api, index }))
                  .filter(({ api }) => filter(api.api))
                  .sort(({ api: a }, { api: b }) =>
                        // Sort by priority, and randomly for the same priority.
                        a.priority !== b.priority ? a.priority - b.priority : Math.random() * 2 - 1
                  );

            if (!apis.length) {
                  throw new Error(`No API available for call.`);
            }

            let firstError: Error | undefined;
            const previousIndices = [];
            for (const { api, index } of apis) {
                  try {
                        const result = await onAPI(api.api);

                        // If any previous API failed, it may be down or rate limited,
                        // so its priority is reduced.
                        for (const previousIndex of previousIndices) {
                              this.apis[previousIndex].priority -= 5;
                        }
                        return result;
                  } catch (error: unknown) {
                        previousIndices.push(index);
                        firstError =
                              firstError || (error instanceof Error ? error : new Error(extractError(error)));
                  }
            }
            throw firstError;
      };
}
