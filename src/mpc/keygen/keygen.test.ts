import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Hasher } from "../utils/hasher";
import { KeygenSession } from "./keygenSession";
import { KeygenRound1 } from "./round1";
import { KeygenBroadcastForRound2, KeygenRound2 } from "./round2";
import { KeygenBroadcastForRound3, KeygenRound3 } from "./round3";
import {
      KeygenBroadcastForRound4,
      KeygenDirectMessageForRound4,
      KeygenRound4,
      KeygenRound4Output,
} from "./round4";
import { KeygenBroadcastForRound5, KeygenRound5 } from "./round5";
import { KeygenRound1Output, KeygenRound2Output, KeygenRound3Output } from "./types";

// Global map to store round outputs
const roundOutputsMap: Map<number, any[]> = new Map();

describe("keygen 2/3", async () => {
      const partyIds = ["a", "b", "c"];
      const threshold = 1; // 2/3

      let sessionA: KeygenSession;
      let sessionB: KeygenSession;
      let sessionC: KeygenSession;
      let sessions: KeygenSession[];

      test("initiate session", async () => {
            // Use precomputed primes to speed up tests
            sessionA = new KeygenSession("a", partyIds, threshold);
            sessionB = new KeygenSession("b", partyIds, threshold);
            sessionC = new KeygenSession("c", partyIds, threshold);
            sessions = [sessionA, sessionB, sessionC];
      });

      test("round 1", async () => {
            const [round1a, round1b, round1c] = sessions.map((session) => {
                  return new KeygenRound1(session, session.inputForRound1);
            });
            roundOutputsMap.set(1, [
                  await round1a.process(),
                  await round1b.process(),
                  await round1c.process(),
            ]);
      });

      test("round 2", async () => {
            const round1Outputs: KeygenRound1Output[] = roundOutputsMap.get(1);

            let allBroadcasts: KeygenBroadcastForRound2[] = [];
            round1Outputs.forEach((session) => allBroadcasts.push(...session.broadcasts));

            console.log([
                  ...round1Outputs[0].broadcasts,
                  ...round1Outputs[1].broadcasts,
                  ...round1Outputs[2].broadcasts,
            ]);
            const [round2a, round2b, round2c] = sessions.map((session, i) => {
                  const r = new KeygenRound2(session, round1Outputs[i].inputForRound2);
                  allBroadcasts.forEach((b) => r.handleBroadcastMessage(b));
                  return r;
            });

            roundOutputsMap.set(2, [
                  await round2a.process(),
                  await round2b.process(),
                  await round2c.process(),
            ]);
      });

      test("round 3", async () => {
            const round2Outputs: KeygenRound2Output[] = roundOutputsMap.get(2);

            let allBroadcasts: KeygenBroadcastForRound3[] = [];
            round2Outputs.forEach((session) => allBroadcasts.push(...session.broadcasts));

            const [round3a, round3b, round3c] = sessions.map((session, i) => {
                  const r = new KeygenRound3(session, round2Outputs[i].inputForRound3);
                  allBroadcasts.forEach((b) => r.handleBroadcastMessage(b));
                  return r;
            });

            roundOutputsMap.set(3, [
                  await round3a.process(),
                  await round3b.process(),
                  await round3c.process(),
            ]);
      });

      test("round 4", async () => {
            const round3Outputs: KeygenRound3Output[] = roundOutputsMap.get(3);

            // Use round 1 outputs to create broadcasts for round 2
            let allBroadcasts: KeygenBroadcastForRound4[] = [];
            let allMessages: KeygenDirectMessageForRound4[] = [];
            round3Outputs.forEach((session) => {
                  allBroadcasts.push(...session.broadcasts);
                  allMessages.push(...session.directMessages);
            });

            const [round4a, round4b, round4c] = sessions.map((session, i) => {
                  const r = new KeygenRound4(session, round3Outputs[i].inputForRound4);
                  allBroadcasts.forEach((b) => r.handleBroadcastMessage(b));
                  allMessages
                        .filter((m) => m.to === partyIds[i])
                        .forEach((m) => r.handleDirectMessage(m));
                  return r;
            });
            // Store round outputs in the global map
            roundOutputsMap.set(4, [
                  await round4a.process(),
                  await round4b.process(),
                  await round4c.process(),
            ]);
      });

      test("round 5", async () => {
            const round4Outputs: KeygenRound4Output[] = roundOutputsMap.get(4);

            // Use round 1 outputs to create broadcasts for round 2
            const allBroadcasts = [
                  ...round4Outputs[0].broadcasts,
                  ...round4Outputs[1].broadcasts,
                  ...round4Outputs[2].broadcasts,
            ]
                  .map((b) => b.toJSON())
                  .map((b) => KeygenBroadcastForRound5.fromJSON(b));
            assert.equal(allBroadcasts.length, 3);

            const [round5a, round5b, round5c] = sessions.map((session, i) => {
                  const r = new KeygenRound5(session, round4Outputs[i].inputForRound5);
                  allBroadcasts.forEach((b) => r.handleBroadcastMessage(b));
                  return r;
            });

            const outputs = [
                  await round5a.process(),
                  await round5b.process(),
                  await round5c.process(),
            ];
            roundOutputsMap.set(5, outputs);

            // Additional assertions or actions for round 5 can be added here
            assert.deepEqual(
                  Hasher.create().update(outputs[0].UpdatedConfig).digestBigint(),
                  Hasher.create().update(outputs[1].UpdatedConfig).digestBigint()
            );
            assert.deepEqual(
                  Hasher.create().update(outputs[0].UpdatedConfig).digestBigint(),
                  Hasher.create().update(outputs[2].UpdatedConfig).digestBigint()
            );
            assert.deepEqual(
                  Hasher.create().update(outputs[1].UpdatedConfig).digestBigint(),
                  Hasher.create().update(outputs[2].UpdatedConfig).digestBigint()
            );
      });
});
