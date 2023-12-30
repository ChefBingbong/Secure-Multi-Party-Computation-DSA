import { eddsa as EDDSA } from "elliptic";
import { v4 } from "uuid";
import { SHA256 } from "crypto-js";

class ChainUtil {
      static genKeyPair(secret: string): any {
            const eddsa = new EDDSA("ed25519");
            return eddsa.keyFromSecret(secret);
      }

      static id(): string {
            return v4();
      }

      static hash(data: any): string {
            return SHA256(JSON.stringify(data)).toString();
      }

      static verifySignature(
            publicKey: string,
            signature: string,
            dataHash: string
      ): boolean {
            const eddsa = new EDDSA("ed25519");
            return eddsa.keyFromPublic(publicKey).verify(dataHash, signature);
      }
}

export default ChainUtil;
