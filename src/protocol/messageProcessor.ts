import { PartyId } from "../mpcTss/keyConfig";
import { KeygenSession } from "../mpcTss/keygen/keygenSession";
import { KeygenInputForRound1 } from "../mpcTss/keygen/types";

// Define the Message interface
interface Message {
      // Your message properties here
}

// Define the Content interface
interface Content {
      // Your content properties here
}

// Define the BroadcastContent interface
interface BroadcastContent {
      // Your broadcast content properties here
}

// Define the Number type
type Number = number;

// Define the Session interface
interface Session {
      // Your session properties here
}

// Define the Round interface
interface Round {
      // VerifyMessage handles an incoming Message and validates its content with regard to the protocol specification.
      // The content argument can be cast to the appropriate type for this round without error check.
      // In the first round, this function returns null.
      // This function should not modify any saved state as it may be running concurrently.
      verifyMessage(msg: Message): Promise<Error | null>;

      // StoreMessage should be called after VerifyMessage and should only store the appropriate fields from the
      // content.
      storeMessage(msg: Message): Promise<Error | null>;

      // Finalize is called after all messages from the parties have been processed in the current round.
      // Messages for the next round are sent out through the out channel.
      // If a non-critical error occurs (like a failure to sample, hash, or send a message), the current round can be
      // returned so that the caller may try to finalize again.
      //
      // If an abort occurs, the expected behavior is to return
      //   r.abortRound(err, culprits), null.
      // This indicates to the caller that the protocol has aborted due to a "math" error.
      //
      // In the last round, Finalize should return
      //   r.resultRound(result), null
      // where result is the output of the protocol.
      finalize(out: Message[]): Promise<[Session, Error | null]>;

      // MessageContent returns an uninitialized message.Content for this round.
      //
      // The first round of a protocol should return null.
      messageContent(): Content | null;

      // Number returns the current round number.
      number(): Number;
}

// Define the BroadcastRound interface
interface BroadcastRound extends Round {
      // StoreBroadcastMessage must be run before Round.verifyMessage and Round.storeMessage,
      // since those may depend on the content from the broadcast.
      // It changes the round's state to store the message after performing basic validation.
      storeBroadcastMessage(msg: Message): Promise<Error | null>;

      // BroadcastContent returns an uninitialized message.Content for this round's broadcast message.
      //
      // The first round of a protocol, and rounds which do not expect a broadcast message should return null.
      broadcastContent(): BroadcastContent | null;
}

type StartFunc = (sessionID: Uint8Array) => Promise<Session>;

interface Handler {
      Result: () => Promise<{ result: unknown; error: Error }>;
      Listen: () => AsyncGenerator<Message>;
      Stop: () => void;
      CanAccept: (msg: Message) => boolean;
      Accept: (msg: Message) => void;
}

export class MultiHandler {
      private currentRound: Session;
      private rounds: Record<number, Session>;
      private err: Error | null;
      private result: unknown | null;
      private messages: Record<number, Record<PartyId, Message | null>>;
      private broadcast: Record<number, Record<PartyId, Message | null>>;
      private broadcastHashes: Record<number, Uint8Array>;
      private out: Message[];
      // private mtx: Mutex;

      constructor(create: () => Promise<KeygenSession>, sessionID: Uint8Array) {
            this.currentRound = null!;
            this.rounds = {};
            this.err = null;
            this.result = null;
            this.messages = {};
            this.broadcast = {};
            this.broadcastHashes = {};
            this.out = [];
            // this.mtx = new Mutex();

            create().then((r) => {
                  this.currentRound = r;
                  this.rounds[0] = r;

                  const n = r.partyIds.length;
                  const otherPartyIDs = r.partyIds.filter(
                        (p) => p !== r.selfId
                  );
                  console.log(otherPartyIDs);
                  this.messages = this.newQueue(r.partyIds, r.finalRound, n);
                  this.broadcast = this.newQueue(
                        otherPartyIDs,
                        r.finalRound,
                        n
                  );
                  console.log(this.messages);

                  // this.finalize();
            });
            console.log(this.broadcast);
      }

      private newQueue(
            senders: PartyId[],
            rounds: number,
            n: number
      ): Record<number, Record<PartyId, Message | null>> {
            const q: Record<number, Record<PartyId, Message | null>> = {};
            for (let i = 2; i <= rounds; i++) {
                  q[i] = {};
                  for (const id of senders) {
                        q[i][id] = null;
                  }
            }
            return q;
      }

      // String(): string {
      //       return `party: ${this.}, protocol: ${this.currentRound.ProtocolID()}`;
      // }
}
