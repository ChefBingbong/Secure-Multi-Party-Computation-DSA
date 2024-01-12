import { WalletInfo } from "../../protocol/validators/validator";
import { JsonRpcProvider, Provider } from "../jsonRpc";
import { ParamsQueryValidators, ResponseQueryValidators } from "../methods/get_validators";
import { Logger } from "winston";
import { AppLogger } from "../../http/middleware/logger";
import { RPCMethod, RPCParams, RPCResponses } from "../methods";

export interface ProviderInterface extends Provider<RPCParams, RPCResponses> {
      queryValidators: () => Promise<WalletInfo>;
}

export class BasicProvider extends JsonRpcProvider<RPCParams, RPCResponses> {
      public logger: Logger;

      public constructor(
            endpointOrProvider: string | Provider<RPCParams, RPCResponses>,
            logger: Logger = new AppLogger().getLogger("provider")
      ) {
            super(endpointOrProvider);
            this.logger = logger;
      }

      public queryValidators = async (retry?: number): Promise<ResponseQueryValidators> =>
            await this.sendMessage<RPCMethod.QueryValidators>(
                  RPCMethod.QueryValidators,
                  {} as ParamsQueryValidators,
                  retry
            );
}
