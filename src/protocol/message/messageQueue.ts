import { MessageQueue, Queue, Message } from "../types";

export class MessageQueueMap<T> {
      private queueMap: MessageQueue<T>;

      constructor(senders: string[], rounds: number) {
            this.queueMap = this.initializeMessageQueue(senders, rounds);
      }

      private initializeMessageQueue(senders: string[], rounds: number): MessageQueue<T> {
            const q: MessageQueue<T> = {};
            for (let i = 0; i <= rounds; i++) {
                  const queue: Queue<T> = {};
                  senders.forEach((id) => {
                        queue[id] = null;
                  });
                  q[i] = queue;
            }
            return q;
      }

      public set(round: number, id: string, value: T | null): void {
            if (this.queueMap[round] && this.queueMap[round][id] !== undefined) {
                  this.queueMap[round][id] = value;
            }
      }

      public get(round: number, id: string): T | null {
            return this.queueMap[round] && this.queueMap[round][id] !== undefined
                  ? this.queueMap[round][id]
                  : null;
      }

      public getAll(): MessageQueue<T> {
            return this.queueMap;
      }

      public getRoundValues(round: number): Array<T | null> {
            return this.queueMap[round] ? Object.values(this.queueMap[round]) : [];
      }

      public getRoundMessagesLen(round: number): number {
            return this.getMessagesLength(this.queueMap[round]);
      }

      private getMessagesLength(obj: any): number {
            return Object.keys(obj).reduce((count, key) => (obj[key] !== null ? count + 1 : count), 0);
      }

      public reset(): void {
            this.queueMap = this.initializeMessageQueue(
                  Object.keys(this.queueMap[0]), // Use senders from round 0
                  Object.keys(this.queueMap).length - 1
            );
      }
}

export class MessageQueueArray<T> {
      private queueMap: Message<T>;

      constructor(rounds: number) {
            this.queueMap = this.initializeMessageQueue(rounds);
      }

      private initializeMessageQueue(rounds: number): Message<T> {
            const q: Message<T> = {};
            for (let i = 0; i <= rounds; i++) {
                  q[i] = [];
            }
            return q;
      }

      public set(round: number, value: T): void {
            if (this.queueMap[round] !== undefined) {
                  this.queueMap[round].push(value);
            }
      }

      public get(round: number, index: number): T | undefined {
            return this.queueMap[round] !== undefined ? this.queueMap[round][index] : undefined;
      }

      public getAll(): Message<T> {
            return this.queueMap;
      }

      public getRoundValues(round: number): T[] {
            return this.queueMap[round] !== undefined ? this.queueMap[round] : [];
      }

      public getNonNullValuesLength(round: number): number {
            return this.getMessagesLength(this.queueMap[round]);
      }

      private getMessagesLength(arr: T[] | undefined): number {
            return arr ? arr.filter((value) => value !== null && value !== undefined).length : 0;
      }

      public reset(): void {
            this.queueMap = this.initializeMessageQueue(Object.keys(this.queueMap).length - 1);
      }
}
