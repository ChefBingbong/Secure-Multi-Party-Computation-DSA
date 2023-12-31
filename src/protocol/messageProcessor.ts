// import { PartyId } from "../mpc/keygen/partyKey";
// import { KeygenSession } from "../mpc/keygen/keygenSession";
// import { KeygenInputForRound1 } from "../mpc/keygen/types";
// import { Polynomial } from "../mpc/math/polynomial/polynomial";
// import { Helper } from "./helper/helper";

// // Define the Message interface
// interface Message {
//       // Your message properties here
// }

// // Define the Content interface
// interface Content {
//       // Your content properties here
// }

// // Define the BroadcastContent interface
// interface BroadcastContent {
//       // Your broadcast content properties here
// }

// // Define the Number type
// type Number = number;

// // Define the Session interface
// interface Session {
//       // Your session properties here
// }

// // Define the Round interface
// interface Round {
//       // VerifyMessage handles an incoming Message and validates its content with regard to the protocol specification.
//       // The content argument can be cast to the appropriate type for this round without error check.
//       // In the first round, this function returns null.
//       // This function should not modify any saved state as it may be running concurrently.
//       verifyMessage(msg: Message): Promise<Error | null>;

//       // StoreMessage should be called after VerifyMessage and should only store the appropriate fields from the
//       // content.
//       storeMessage(msg: Message): Promise<Error | null>;

//       // Finalize is called after all messages from the parties have been processed in the current round.
//       // Messages for the next round are sent out through the out channel.
//       // If a non-critical error occurs (like a failure to sample, hash, or send a message), the current round can be
//       // returned so that the caller may try to finalize again.
//       //
//       // If an abort occurs, the expected behavior is to return
//       //   r.abortRound(err, culprits), null.
//       // This indicates to the caller that the protocol has aborted due to a "math" error.
//       //
//       // In the last round, Finalize should return
//       //   r.resultRound(result), null
//       // where result is the output of the protocol.
//       finalize(out: Message[]): Promise<[Session, Error | null]>;

//       // MessageContent returns an uninitialized message.Content for this round.
//       //
//       // The first round of a protocol should return null.
//       messageContent(): Content | null;

//       // Number returns the current round number.
//       number(): Number;
// }

// // Define the BroadcastRound interface
// interface BroadcastRound extends Round {
//       // StoreBroadcastMessage must be run before Round.verifyMessage and Round.storeMessage,
//       // since those may depend on the content from the broadcast.
//       // It changes the round's state to store the message after performing basic validation.
//       storeBroadcastMessage(msg: Message): Promise<Error | null>;

//       // BroadcastContent returns an uninitialized message.Content for this round's broadcast message.
//       //
//       // The first round of a protocol, and rounds which do not expect a broadcast message should return null.
//       broadcastContent(): BroadcastContent | null;
// }

// type StartFunc = (sessionID: Uint8Array) => Promise<Session>;

// interface Handler {
//       Result: () => Promise<{ result: unknown; error: Error }>;
//       Listen: () => AsyncGenerator<Message>;
//       Stop: () => void;
//       CanAccept: (msg: Message) => boolean;
//       Accept: (msg: Message) => void;
// }
// interface RoundNumberMap {
//       [roundNumber: number]: Uint8Array;
// }

// export class MultiHandler {
//       private currentRound: {
//             vssSecret: Polynomial;
//             helper: Helper;
//             precomputedPaillierPrimes: {
//                   p: bigint;
//                   q: bigint;
//             };
//             previousSecretECDSA: any;
//             previousPublicSharesECDSA: any;
//             previousChainKey: any;
//       };
//       private rounds: Record<number, any>;
//       private err: Error | null;
//       private result: unknown | null;
//       private messages: Record<number, Record<PartyId, Message | null>>;
//       private broadcast: Record<number, Record<PartyId, Message | null>>;
//       private broadcastHashes: Record<number, Uint8Array>;
//       private out: Message[];
//       private create: () => Promise<{
//             vssSecret: Polynomial;
//             helper: Helper;
//             precomputedPaillierPrimes: {
//                   p: bigint;
//                   q: bigint;
//             };
//             previousSecretECDSA: any;
//             previousPublicSharesECDSA: any;
//             previousChainKey: any;
//       }>;
//       // private mtx: Mutex;

//       constructor(
//             create: () => Promise<{
//                   vssSecret: Polynomial;
//                   helper: Helper;
//                   precomputedPaillierPrimes: {
//                         p: bigint;
//                         q: bigint;
//                   };
//                   previousSecretECDSA: any;
//                   previousPublicSharesECDSA: any;
//                   previousChainKey: any;
//             }>,
//             sessionID: Uint8Array
//       ) {
//             this.currentRound = null!;
//             this.rounds = {};
//             this.err = null;
//             this.result = null;
//             this.messages = {};
//             this.broadcast = {};
//             this.broadcastHashes = {};
//             this.out = [];
//             // this.mtx = new Mutex();
//       }

//       public init = async () => {
//             this.create().then((r) => {
//                   this.currentRound = r;
//                   this.rounds = {};
//                   this.messages = this.newQueue(
//                         r.helper.OtherPartyIDs(),
//                         r.helper.FinalRoundNumber()
//                   );
//                   this.broadcast = this.newQueue(
//                         r.helper.OtherPartyIDs(),
//                         r.helper.FinalRoundNumber()
//                   );
//                   this.broadcastHashes = {};
//             });
//             this.finalize()
//       };

//       async Result(): Promise<{ result: unknown; error: Error }> {
//             // await this.mtx.Lock();
//             try {
//                   if (this.result !== null) {
//                         return { result: this.result, error: null! };
//                   }
//                   if (this.err !== null) {
//                         return { result: null!, error: this.err };
//                   }
//                   return {
//                         result: null!,
//                         error: new Error("protocol: not finished"),
//                   };
//             } finally {
//                   this.mtx.Unlock();
//             }
//       }

//       Listen(): AsyncGenerator<Message> {
//             const self = this;
//             return (async function* () {
//                   await self.mtx.Lock();
//                   try {
//                         yield* self.out;
//                   } finally {
//                         self.mtx.Unlock();
//                   }
//             })();
//       }

//       CanAccept(msg: Message): boolean {
//             const r = this.currentRound;
//             if (msg === null) {
//                   return false;
//             }
//             // are we the intended recipient
//             if (!msg.IsFor(r.SelfID())) {
//                   return false;
//             }
//             // is the protocol ID correct
//             if (msg.Protocol !== r.ProtocolID()) {
//                   return false;
//             }
//             // check for same SSID
//             if (!msg.SSID.equals(r.SSID())) {
//                   return false;
//             }
//             // do we know the sender
//             if (!r.PartyIDs().includes(msg.From)) {
//                   return false;
//             }

//             // data is cannot be null
//             if (msg.Data === null) {
//                   return false;
//             }

//             // check if message for unexpected round
//             if (msg.RoundNumber > r.FinalRoundNumber()) {
//                   return false;
//             }

//             if (msg.RoundNumber < r.Number() && msg.RoundNumber > 0) {
//                   return false;
//             }

//             return true;
//       }

//       Accept(msg: Message): void {
//             this.mtx.Lock().then(() => {
//                   try {
//                         // exit early if the message is bad, or if we are already done
//                         if (
//                               !this.CanAccept(msg) ||
//                               this.err !== null ||
//                               this.result !== null ||
//                               this.duplicate(msg)
//                         ) {
//                               return;
//                         }

//                         // a msg with roundNumber 0 is considered an abort from another party
//                         if (msg.RoundNumber === 0) {
//                               this.abort(
//                                     new Error(
//                                           `aborted by other party with error: "${msg.Data}"`
//                                     ),
//                                     msg.From
//                               );
//                               return;
//                         }

//                         this.store(msg);
//                         if (this.currentRound.Number() !== msg.RoundNumber) {
//                               return;
//                         }

//                         if (msg.Broadcast) {
//                               if (this.verifyBroadcastMessage(msg) !== null) {
//                                     this.abort(
//                                           this.verifyBroadcastMessage(msg),
//                                           msg.From
//                                     );
//                                     return;
//                               }
//                         } else {
//                               if (this.verifyMessage(msg) !== null) {
//                                     this.abort(
//                                           this.verifyMessage(msg),
//                                           msg.From
//                                     );
//                                     return;
//                               }
//                         }

//                         this.finalize();
//                   } finally {
//                         this.mtx.Unlock();
//                   }
//             });
//       }

//       private verifyBroadcastMessage(msg: Message): Error | null {
//             const r = this.rounds[msg.RoundNumber];
//             if (r === undefined) {
//                   return null;
//             }

//             // try to convert the raw message into a round.Message
//             const roundMsg = this.getRoundMessage(msg, r);
//             if (roundMsg.error !== null) {
//                   return roundMsg.error;
//             }

//             // store the broadcast message for this round
//             const broadcastRound = r as BroadcastRound;
//             const err = broadcastRound.StoreBroadcastMessage(roundMsg.message);
//             if (err !== null) {
//                   return new Error(`round ${r.Number()}: ${err}`);
//             }

//             // if the round only expected a broadcast message, we can safely return
//             if (!this.expectsNormalMessage(r)) {
//                   return null;
//             }

//             // otherwise, we can try to handle the p2p message that may be stored.
//             const storedMsg = this.messages[msg.RoundNumber][msg.From];
//             if (storedMsg === null) {
//                   return null;
//             }

//             return this.verifyMessage(storedMsg);
//       }

//       private verifyMessage(msg: Message): Error | null {
//             // we simply return if we haven't reached the right round.
//             const r = this.rounds[msg.RoundNumber];
//             if (r === undefined) {
//                   return null;
//             }

//             // exit if we don't yet have the broadcast message
//             if (r instanceof BroadcastRound) {
//                   const q = this.broadcast[msg.RoundNumber];
//                   if (q === null || q[msg.From] === null) {
//                         return null;
//                   }
//             }

//             const roundMsg = this.getRoundMessage(msg, r);
//             if (roundMsg.error !== null) {
//                   return roundMsg.error;
//             }

//             // verify message for round
//             const err = r.VerifyMessage(roundMsg.message);
//             if (err !== null) {
//                   return new Error(`round ${r.Number()}: ${err}`);
//             }

//             const storeErr = r.StoreMessage(roundMsg.message);
//             if (storeErr !== null) {
//                   return new Error(`round ${r.Number()}: ${storeErr}`);
//             }

//             return null;
//       }

//       private finalize(): void {
//             // only finalize if we have received all messages
//             if (!this.receivedAll()) {
//                   return;
//             }
//             if (!this.checkBroadcastHash()) {
//                   this.abort(new Error("broadcast verification failed"));
//                   return;
//             }

//             const out: Message[] = [];
//             // since we pass a large enough channel, we should never get an error
//             this.currentRound.Finalize(out).then((r) => {
//                   // either we got an error due to some problem on our end (sampling etc)
//                   // or the new round is null (should not happen)
//                   if (r === null) {
//                         this.abort(
//                               new Error(
//                                     "Unknown error during round finalization"
//                               ),
//                               this.currentRound.SelfID()
//                         );
//                         return;
//                   }

//                   // forward messages with the correct header.
//                   out.forEach((roundMsg) => {
//                         const data = this.marshalRoundMessage(roundMsg.content);
//                         const msg: Message = {
//                               SSID: r.SSID(),
//                               From: r.SelfID(),
//                               To: roundMsg.To,
//                               Protocol: r.ProtocolID(),
//                               RoundNumber: roundMsg.Content.RoundNumber(),
//                               Data: data,
//                               Broadcast: roundMsg.Broadcast,
//                               BroadcastVerification:
//                                     this.broadcastHashes[r.Number() - 1],
//                         };

//                         if (msg.Broadcast) {
//                               this.store(msg);
//                         }

//                         this.out.push(msg);
//                   });

//                   const roundNumber = r.Number();
//                   // if we get a round with the same number, we can safely assume that we got the same one.
//                   if (this.rounds[roundNumber] !== undefined) {
//                         return;
//                   }
//                   this.rounds[roundNumber] = r;
//                   this.currentRound = r;

//                   // either we get the current round, the next one, or one of the two final ones
//                   switch (r.constructor) {
//                         // An abort happened
//                         case AbortRound:
//                               const abortRound = r as AbortRound;
//                               this.abort(
//                                     abortRound.Err,
//                                     ...abortRound.Culprits
//                               );
//                               break;
//                         // We have the result
//                         case OutputRound:
//                               const outputRound = r as OutputRound;
//                               this.result = outputRound.Result;
//                               this.abort(null!);
//                               break;
//                         default:
//                   }

//                   if (r instanceof BroadcastRound) {
//                         // handle queued broadcast messages, which will then check the subsequent normal message
//                         for (const [id, m] of Object.entries(
//                               this.broadcast[roundNumber]
//                         )) {
//                               if (m === null || id === r.SelfID()) {
//                                     continue;
//                               }
//                               // if false, we aborted and so we return
//                               const verifyErr = this.verifyBroadcastMessage(m);
//                               if (verifyErr !== null) {
//                                     this.abort(verifyErr, m.From);
//                                     return;
//                               }
//                         }
//                   } else {
//                         // handle simple queued messages
//                         for (const m of this.messages[roundNumber]) {
//                               if (m === null) {
//                                     continue;
//                               }
//                               // if false, we aborted and so we return
//                               const verifyErr = this.verifyMessage(m);
//                               if (verifyErr !== null) {
//                                     this.abort(verifyErr, m.From);
//                                     return;
//                               }
//                         }
//                   }

//                   // we only do this if the current round has changed
//                   this.finalize();
//             });
//       }

//       private abort(err: Error | null, ...culprits: PartyID[]): void {
//             if (err !== null) {
//                   this.err = {
//                         Culprits: culprits,
//                         Err: err,
//                   };
//                   if (this.out.length < 2 * this.currentRound.N()) {
//                         this.out.push({
//                               SSID: this.currentRound.SSID(),
//                               From: this.currentRound.SelfID(),
//                               Protocol: this.currentRound.ProtocolID(),
//                               Data: new TextEncoder().encode(this.err.Error),
//                         });
//                   }
//             }
//             this.out.complete();
//       }

//       private expectsNormalMessage(r: Session): boolean {
//             return r.MessageContent() !== null;
//       }

//       private receivedAll(): boolean {
//             const r = this.currentRound;
//             const number = r.helper.N();
//             // check all broadcast messages
//             // @ts-ignore
//             if (r.broadcasts) {
//                   if (this.broadcast[number] === null) {
//                         return true;
//                   }
//                   for (const id of r.helper.PartyIDs()) {
//                         const msg = this.broadcast[number][id];
//                         if (msg === null) {
//                               return false;
//                         }
//                   }

//                   // create hash of all message for this round
//                   if (this.broadcastHashes[number] === null) {
//                         const hashState = r.();
//                         for (const id of r.helper.PartyIDs()) {
//                               const msg = this.broadcast[number][id];
//                               const bytesWithDomain: = {
//                                     TheDomain: "Message",
//                                     Bytes: msg.Hash,
//                               };
//                               hashState.WriteAny(bytesWithDomain);
//                         }
//                         this.broadcastHashes[number] = hashState.Sum();
//                   }
//             }

//             // check all normal messages
//             if (this.expectsNormalMessage(r)) {
//                   if (this.messages[number] === null) {
//                         return true;
//                   }
//                   for (const id of r.OtherPartyIDs()) {
//                         if (this.messages[number][id] === null) {
//                               return false;
//                         }
//                   }
//             }
//             return true;
//       }

//       private duplicate(msg: Message): boolean {
//             if (msg.RoundNumber === 0) {
//                   return false;
//             }
//             let q: Record<PartyID, Message | null>;
//             if (msg.Broadcast) {
//                   q = this.broadcast[msg.RoundNumber];
//             } else {
//                   q = this.messages[msg.RoundNumber];
//             }
//             // technically, we already received the nil message since it is not expected :)
//             if (q === null) {
//                   return true;
//             }
//             return q[msg.From] !== null;
//       }

//       private store(msg: Message): void {
//             let q: Record<PartyID, Message | null>;
//             if (msg.Broadcast) {
//                   q = this.broadcast[msg.RoundNumber];
//             } else {
//                   q = this.messages[msg.RoundNumber];
//             }
//             if (q === null || q[msg.From] !== null) {
//                   return;
//             }
//             q[msg.From] = msg;
//       }

//       private getRoundMessage(
//             msg: Message,
//             r: Session
//       ): { message: Message; error: Error | null } {
//             let content: Content;

//             // there are two possible content messages
//             if (msg.Broadcast) {
//                   const b = r as BroadcastRound;
//                   content = b.BroadcastContent();
//             } else {
//                   content = r.MessageContent();
//             }

//             // unmarshal message
//             try {
//                   const contentObj = cbor.decode(msg.Data, { coerce: false });
//                   const roundMsg: Message = {
//                         From: msg.From,
//                         To: msg.To,
//                         Content: contentObj,
//                         Broadcast: msg.Broadcast,
//                   };
//                   return { message: roundMsg, error: null };
//             } catch (err) {
//                   return {
//                         message: null!,
//                         error: new Error(`failed to unmarshal: ${err.message}`),
//                   };
//             }
//       }

//       private checkBroadcastHash(): boolean {
//             const number = this.currentRound.Number();
//             // check BroadcastVerification
//             const previousHash = this.broadcastHashes[number - 1];
//             if (previousHash === null) {
//                   return true;
//             }

//             for (const msg of Object.values(this.messages[number])) {
//                   if (
//                         msg !== null &&
//                         !previousHash.equals(msg.BroadcastVerification)
//                   ) {
//                         return false;
//                   }
//             }
//             for (const msg of Object.values(this.broadcast[number])) {
//                   if (
//                         msg !== null &&
//                         !previousHash.equals(msg.BroadcastVerification)
//                   ) {
//                         return false;
//                   }
//             }
//             return true;
//       }

//       private newQueue(
//             senders: PartyId[],
//             rounds: number
//       ): Record<number, Record<PartyId, Message | null>> {
//             const q: Record<number, Record<PartyId, Message | null>> = {};
//             for (let i = 2; i <= rounds; i++) {
//                   q[i] = {};
//                   for (const id of senders) {
//                         q[i][id] = null;
//                   }
//             }
//             return q;
//       }

//       // String(): string {
//       //       return `party: ${this.}, protocol: ${this.currentRound.ProtocolID()}`;
//       // }
// }
