class IDSlice {
      private partyIDs: string[];

      private constructor(partyIDs: string[]) {
            this.partyIDs = partyIDs;
            this.partyIDs.sort();
      }

      // Returns a sorted slice from partyIDs.
      static create(partyIDs: string[]): IDSlice {
            return new IDSlice(partyIDs);
      }

      // Returns true if partyIDs contains id.
      // Assumes that the IDSlice is valid.
      public contains(...ids: string[]): boolean {
            for (const id of ids) {
                  const index = this.search(id);
                  if (index < 0) {
                        return false;
                  }
            }
            return true;
      }

      // Returns true if the IDSlice is sorted and does not contain any duplicates.
      public isValid(): boolean {
            const n = this.partyIDs.length;
            for (let i = 1; i < n; i++) {
                  if (this.partyIDs[i - 1] >= this.partyIDs[i]) {
                        return false;
                  }
            }
            return true;
      }

      // Finds id in partyIDs and returns a copy of the slice if it was found.
      public remove(id: string): IDSlice {
            const newPartyIDs = this.partyIDs.filter((partyID) => partyID !== id);
            return new IDSlice(newPartyIDs);
      }

      // Returns the length of the IDSlice.
      public get length(): number {
            return this.partyIDs.length;
      }

      // search returns the index of x in the sorted array.
      private search(x: string): number {
            return this.partyIDs.indexOf(x);
      }

      // WriteTo implements io.WriterTo and should be used within the hash.Hash function.
      // It writes the full uncompressed point to w, ie 64 bytes.
      writeTo(w: WriteStream): Promise<number> {
            return new Promise<number>((resolve, reject) => {
                  if (!this.partyIDs) {
                        reject(new Error("Unexpected EOF"));
                  }

                  const lengthBuffer = Buffer.alloc(8);
                  lengthBuffer.writeBigUInt64BE(BigInt(this.partyIDs.length));

                  w.write(lengthBuffer, (err) => {
                        if (err) {
                              reject(err);
                        } else {
                              let nAll = 8;

                              const writeNext = (index: number): void => {
                                    if (index < this.partyIDs.length) {
                                          const idBuffer = Buffer.from(
                                                this.partyIDs[index]
                                          );

                                          w.write(idBuffer, (err) => {
                                                if (err) {
                                                      reject(err);
                                                } else {
                                                      nAll += idBuffer.length;
                                                      writeNext(index + 1);
                                                }
                                          });
                                    } else {
                                          resolve(nAll);
                                    }
                              };

                              writeNext(0);
                        }
                  });
            });
      }

      // Domain implements hash.WriterToWithDomain, and separates this type within hash.Hash.
      static domain(): string {
            return "IDSlice";
      }

      // String implements fmt.Stringer.
      public toString(): string {
            return this.partyIDs.join(", ");
      }
}

// Assuming WriteStream is an interface or class representing an asynchronous writable stream.
interface WriteStream {
      write(buffer: Buffer, callback: (error?: Error) => void): void;
}

// Example usage:
const partyIDs = ["id3", "id1", "id2"];
const idSlice = IDSlice.create(partyIDs);
console.log(idSlice.contains("id1", "id2")); // true
console.log(idSlice.isValid()); // true
console.log(idSlice.toString()); // id1, id2, id3
