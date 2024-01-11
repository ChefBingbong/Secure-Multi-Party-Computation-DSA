import { Transform } from "stream";

const SPLIT_SEQUENCE = "}{";

const T = () =>
      new Transform({
            objectMode: true,
            write(chunk, enc, cb) {
                  // Split int json messages by the following
                  // sequence. But keep in mind we may see it
                  // inside a string inside JSON
                  try {
                        let possibleMessages = chunk.toString().split(SPLIT_SEQUENCE);

                        for (let i = 0; i < possibleMessages.length - 1; ++i) {
                              possibleMessages[i] = possibleMessages[i] + "}";
                        }

                        for (let i = 1; i < possibleMessages.length; ++i) {
                              possibleMessages[i] = "{" + possibleMessages[i];
                        }

                        while (possibleMessages.length > 0) {
                              try {
                                    // console.log(possibleMessages[0]);
                                    const m = JSON.parse(possibleMessages[0]);
                                    // console.log(m);

                                    this.push(m);
                              } catch (e) {
                                    console.log(e);
                                    if (possibleMessages.length > 1) {
                                          possibleMessages[0] = possibleMessages[0]
                                                .concat(possibleMessages.splice(1, 1))
                                                .join(SPLIT_SEQUENCE);
                                    } else {
                                          return cb(e);
                                    }
                              }

                              possibleMessages.splice(0, 1);
                        }

                        cb();
                  } catch (err) {
                        console.log(err);
                  }
            },
      });

export default T;
