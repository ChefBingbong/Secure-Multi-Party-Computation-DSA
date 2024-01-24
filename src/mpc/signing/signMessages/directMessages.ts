import { PartyId } from "../../keygen/partyKey";
import { ZkAffgProof } from "../../zk/affg";
import { ZkEncProof } from "../../zk/enc";
import { ZkLogstarProof } from "../../zk/logstar";
import { SignMessageForRound2JSON, SignMessageForRound3JSON, SignMessageForRound4JSON } from "../types";
import { AbstractSignDirectMessage } from "./abstractSignDirectMessage";

export class SignMessageForRound4 extends AbstractSignDirectMessage {
      public readonly from: PartyId;
      public readonly to: PartyId;
      public readonly ProofLog: ZkLogstarProof;

      public constructor(from: PartyId, to: PartyId, ProofLog: ZkLogstarProof) {
            super(from, 4);
            this.from = from;
            this.to = to;
            this.ProofLog = ProofLog;
      }

      public static from({
            from,
            to,
            ProofLog,
      }: {
            from: PartyId;
            to: PartyId;
            ProofLog: ZkLogstarProof;
      }): SignMessageForRound4 {
            const msg = new SignMessageForRound4(from, to, ProofLog);
            Object.freeze(msg);
            return msg;
      }

      public static fromJSON({ from, to, ProofLog }: SignMessageForRound4JSON): SignMessageForRound4 {
            const msg = new SignMessageForRound4(from, to, ZkLogstarProof.fromJSON(ProofLog));
            Object.freeze(msg);
            return msg;
      }

      public toJSON(): SignMessageForRound4JSON {
            return {
                  from: this.from,
                  to: this.to,
                  ProofLog: this.ProofLog.toJSON(),
                  type: 4,
            };
      }
}

export class SignMessageForRound3 extends AbstractSignDirectMessage {
      public readonly from: PartyId;
      public readonly to: PartyId;
      public readonly DeltaD: bigint; // Ciphertext
      public readonly DeltaF: bigint; // Ciphertext
      public readonly DeltaProof: ZkAffgProof;
      public readonly ChiD: bigint; // Ciphertext
      public readonly ChiF: bigint; // Ciphertext
      public readonly ChiProof: ZkAffgProof;
      public readonly ProofLog: ZkLogstarProof;

      private constructor(
            from: PartyId,
            to: PartyId,
            DeltaD: bigint,
            DeltaF: bigint,
            DeltaProof: ZkAffgProof,
            ChiD: bigint,
            ChiF: bigint,
            ChiProof: ZkAffgProof,
            ProofLog: ZkLogstarProof
      ) {
            super(from, 3);
            this.from = from;
            this.to = to;
            this.DeltaD = DeltaD;
            this.DeltaF = DeltaF;
            this.DeltaProof = DeltaProof;
            this.ChiD = ChiD;
            this.ChiF = ChiF;
            this.ChiProof = ChiProof;
            this.ProofLog = ProofLog;
      }

      public static from({
            from,
            to,
            DeltaD,
            DeltaF,
            DeltaProof,
            ChiD,
            ChiF,
            ChiProof,
            ProofLog,
      }: {
            from: PartyId;
            to: PartyId;
            DeltaD: bigint;
            DeltaF: bigint;
            DeltaProof: ZkAffgProof;
            ChiD: bigint;
            ChiF: bigint;
            ChiProof: ZkAffgProof;
            ProofLog: ZkLogstarProof;
      }): SignMessageForRound3 {
            const msg = new SignMessageForRound3(
                  from,
                  to,
                  DeltaD,
                  DeltaF,
                  DeltaProof,
                  ChiD,
                  ChiF,
                  ChiProof,
                  ProofLog
            );
            Object.freeze(msg);
            return msg;
      }

      public static fromJSON(json: SignMessageForRound3JSON): SignMessageForRound3 {
            return SignMessageForRound3.from({
                  from: json.from as PartyId,
                  to: json.to as PartyId,
                  DeltaD: BigInt(`0x${json.DeltaDhex}`),
                  DeltaF: BigInt(`0x${json.DeltaFhex}`),
                  DeltaProof: ZkAffgProof.fromJSON(json.DeltaProof),
                  ChiD: BigInt(`0x${json.ChiDhex}`),
                  ChiF: BigInt(`0x${json.ChiFhex}`),
                  ChiProof: ZkAffgProof.fromJSON(json.ChiProof),
                  ProofLog: ZkLogstarProof.fromJSON(json.ProofLog),
            });
      }

      public toJSON(): SignMessageForRound3JSON {
            return {
                  from: this.from,
                  to: this.to,
                  DeltaDhex: this.DeltaD.toString(16),
                  DeltaFhex: this.DeltaF.toString(16),
                  DeltaProof: this.DeltaProof.toJSON(),
                  ChiDhex: this.ChiD.toString(16),
                  ChiFhex: this.ChiF.toString(16),
                  ChiProof: this.ChiProof.toJSON(),
                  ProofLog: this.ProofLog.toJSON(),
                  type: 3,
            };
      }
}

export class SignMessageForRound2 extends AbstractSignDirectMessage {
      public readonly from: PartyId;
      public readonly to: PartyId;
      public readonly proofEnc: ZkEncProof;

      private constructor(from: PartyId, to: PartyId, proofEnc: ZkEncProof) {
            super(from, 2);
            this.from = from;
            this.to = to;
            this.proofEnc = proofEnc;
      }

      public static from({
            from,
            to,
            proofEnc,
      }: {
            from: PartyId;
            to: PartyId;
            proofEnc: ZkEncProof;
      }): SignMessageForRound2 {
            const msg = new SignMessageForRound2(from, to, proofEnc);
            Object.freeze(msg);
            return msg;
      }

      public static fromJSON(json: SignMessageForRound2JSON): SignMessageForRound2 {
            return SignMessageForRound2.from({
                  from: json.from as PartyId,
                  to: json.to as PartyId,
                  proofEnc: ZkEncProof.fromJSON(json.proofEnc),
            });
      }

      public toJSON(): SignMessageForRound2JSON {
            return {
                  from: this.from,
                  to: this.to,
                  proofEnc: this.proofEnc.toJSON(),
                  type: 2,
            };
      }
}
