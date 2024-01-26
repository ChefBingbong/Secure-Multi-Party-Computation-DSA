import { concat } from "../utils/assert";
import { hash160, sha256 } from "../utils/utils";
import { Opcode } from "./opcodes";

const checksum = (hash: Uint8Array) => sha256(sha256(hash)).slice(0, 4);

export class Script {
      private script: Uint8Array;

      public static OP = Opcode;
      public OP = Opcode;

      public constructor() {
            this.script = new Uint8Array();
      }

      public addOp = (op: Opcode): this => {
            this.script = new Uint8Array([...this.script, op]);
            return this;
      };

      public addData = (data: Uint8Array): this => {
            this.script = new Uint8Array([...this.script, data.length, ...data]);
            return this;
      };

      public bytes = (): Uint8Array => {
            return this.script;
      };

      public toScriptHashOut = (): Uint8Array => {
            return new Script()
                  .addOp(Script.OP.OP_HASH160)
                  .addData(hash160(this.bytes()))
                  .addOp(Script.OP.OP_EQUAL)
                  .bytes();
      };

      public toAddress = (prefix: Uint8Array | Uint8Array): Uint8Array => {
            const hash = hash160(this.bytes());
            const hashWithPrefix = concat([prefix, hash]);
            const hashWithChecksum = concat([hashWithPrefix, checksum(hashWithPrefix)]);

            return hashWithChecksum;
      };
}
