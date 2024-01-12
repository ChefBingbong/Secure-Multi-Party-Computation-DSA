import { Transform } from "stream";

const SPLIT_SEQUENCE = "}{";

class SplitStream extends Transform {
      private buffer: string;

      constructor() {
            super({ objectMode: true });
            this.buffer = "";
      }

      _transform(chunk: any, encoding: BufferEncoding, callback: Function) {
            try {
                  // Concatenate the buffer with the incoming chunk
                  this.buffer += chunk.toString();

                  // Split the combined buffer by the split sequence
                  const possibleMessages = this.buffer.split(SPLIT_SEQUENCE);

                  // Process all complete messages (except the last one) in the buffer
                  for (let i = 0; i < possibleMessages.length - 1; ++i) {
                        const completeMessage = possibleMessages[i] + "}";
                        const parsedMessage = JSON.parse(completeMessage);

                        // Push the parsed message to the readable stream
                        this.push(parsedMessage);
                  }

                  // Update the buffer with the last incomplete message
                  this.buffer = possibleMessages[possibleMessages.length - 1];

                  callback();
            } catch (err) {
                  // Handle parsing errors or incomplete messages
                  callback(err);
            }
      }

      _flush(callback: Function) {
            try {
                  // Parse any remaining message in the buffer
                  if (this.buffer) {
                        const parsedMessage = JSON.parse(this.buffer);
                        this.push(parsedMessage);
                  }

                  callback();
            } catch (err) {
                  callback(err);
            }
      }
}

export default new SplitStream();
