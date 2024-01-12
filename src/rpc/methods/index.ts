import { ParamsQueryValidators, ResponseQueryValidators } from "./get_validators";

export enum RPCMethod {
      // method to get infomation of all validators in the network
      QueryValidators = "query_validators",
}

export type RPCParams = {
      [RPCMethod.QueryValidators]: ParamsQueryValidators;
};

export type RPCResponses = {
      [RPCMethod.QueryValidators]: ResponseQueryValidators;
};

(): RPCParams[RPCMethod] | void => {};
(): RPCResponses[RPCMethod] | void => {};
