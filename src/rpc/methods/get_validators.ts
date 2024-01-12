import { WalletInfo } from "../../protocol/validators/validator";

interface ParsedWalletInfo {
      partyIds: WalletInfo[];
}

export interface ParamsQueryValidators {
      // No parameters.
}
export interface ResponseQueryValidators {
      partyIds: WalletInfo[]; // Block json.RawMessage`json:"block"`
}
