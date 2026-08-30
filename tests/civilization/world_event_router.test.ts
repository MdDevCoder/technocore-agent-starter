import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EventRouter,
  type AgentProfile,
  type CivilizationEvent,
} from "../../src/civilization/index.ts";

describe("Event Router & Agent Wake Coordinator", () => {
  it("routes mission events to agents with matching capabilities", () => {
    const router = new EventRouter();

    const didDev = "did:key:z6Mdev1111111111111111111111111111111111111111111111";
    const didSec = "did:key:z6Msec2222222222222222222222222222222222222222222222";

    const population = new Map<string, { profile: AgentProfile }>([
      [
        didDev,
        {
          profile: {
            agentId: "ag_dev",
            did: didDev,
            displayName: "Dev",
            role: "Developer",
            capabilities: [{ name: "typescript", proficiency: 90 }],
            availability: "available",
            workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
            createdAt: "2026-09-01T00:00:00.000Z",
            metadata: {},
          },
        },
      ],
      [
        didSec,
        {
          profile: {
            agentId: "ag_sec",
            did: didSec,
            displayName: "Sec",
            role: "Security",
            capabilities: [{ name: "security-audit", proficiency: 95 }],
            availability: "available",
            workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 5 },
            createdAt: "2026-09-01T00:00:00.000Z",
            metadata: {},
          },
        },
      ],
    ]);

    const missionEvt: CivilizationEvent = {
      protocol: "civilization-event-v1",
      version: "1.0.0",
      eventId: "evt_mis_99",
      eventType: "MISSION_CREATED",
      missionId: "mis_99",
      authorDid: "did:key:z6Mgenesis",
      timestamp: "2026-09-01T00:00:00.000Z",
      parentEventIds: [],
      signature: "sig",
      payload: {
        title: "TypeScript API",
        objective: "Build API",
        requirements: [{ capability: "typescript", minProficiency: 80, requiredCount: 1 }],
        constraints: [],
        deadline: "2026-09-02T00:00:00.000Z",
        budget: { token: "FLOP", amount: 5000 },
        genesisAgentDid: "did:key:z6Mgenesis",
      },
    };

    const awakened = router.routeEvent(missionEvt, population);
    assert.equal(awakened.includes(didDev), true);
    assert.equal(awakened.includes(didSec), false);
  });
});
