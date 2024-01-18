import config from "../../config/config";
import Validator from "./validator";

export class ValidatorsGroup {
      public static validators: Map<string, string>;

      constructor(initialValidator: string) {
            ValidatorsGroup.validators = new Map([[config.p2pPort, initialValidator]]);
      }

      public static update(validatorPublicKey: string, validatorId: string): boolean {
            if (!validatorPublicKey) return false;
            this.validators.set(validatorPublicKey, validatorId);
            return true;
      }

      public static delete(validatorId: string): boolean {
            this.validators.delete(validatorId);
            return true;
      }

      public static getAllValidators = () => {
            return [...this.validators.values()].filter((value, index, self) => {
                  return self.indexOf(value) === index;
            });
      };

      public static getAllKeys = () => {
            const partyIds = this.getAllValidators();
            return {
                  ports: partyIds.map((info) => Validator.parseWalletInfo(info).port),
                  publickKeys: partyIds.map((info) => Validator.parseWalletInfo(info).publicKey),
            };
      };
}

// export default Validators;