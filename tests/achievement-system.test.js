const { createEventBus } = require("../Koz_Engine_Lib/Events/eventBus");
const {
  createAchievementSystem,
  createMemoryAchievementStore,
} = require("../Koz_Engine_Lib/Achievements/achievementSystem");

function definitions() {
  return [
    {
      id: "three_kills",
      name: "Three Kills",
      rule: { event: "enemy:killed", mode: "count", target: 3 },
    },
    {
      id: "heavy_hit",
      name: "Heavy Hit",
      rule: { event: "damage:dealt", mode: "max", value: "amount", target: 100 },
    },
    {
      id: "collector",
      name: "Collector",
      rule: {
        event: "item:collected",
        mode: "unique",
        value: payload => payload.kind,
        target: 2,
      },
    },
    {
      id: "run_combo",
      name: "Run Combo",
      rule: { event: "combo", mode: "max", value: "count", target: 5, scope: "run" },
    },
  ];
}

describe("Koz Engine AchievementSystem", () => {
  test("subscribes declarative rules and unlocks count, max, and unique achievements", async () => {
    const eventBus = createEventBus();
    const unlocked = [];
    const system = createAchievementSystem({
      eventBus,
      definitions: definitions(),
      onUnlocked: detail => unlocked.push(detail.id),
      now: () => 1234,
    });
    await system.start();

    await Promise.all([
      eventBus.emitAsync("enemy:killed"),
      eventBus.emitAsync("enemy:killed"),
      eventBus.emitAsync("enemy:killed"),
    ]);
    await eventBus.emitAsync("damage:dealt", { amount: 40 });
    await eventBus.emitAsync("damage:dealt", { amount: 100 });
    await eventBus.emitAsync("item:collected", { kind: "fire" });
    await eventBus.emitAsync("item:collected", { kind: "fire" });
    await eventBus.emitAsync("item:collected", { kind: "ice" });

    expect(await system.isUnlocked("three_kills")).toBe(true);
    expect(await system.isUnlocked("heavy_hit")).toBe(true);
    expect(await system.isUnlocked("collector")).toBe(true);
    expect(await system.getProgress("three_kills")).toBe(3);
    expect(await system.getProgress("collector")).toEqual(["fire", "ice"]);
    expect(new Set(unlocked)).toEqual(new Set(["three_kills", "heavy_hit", "collector"]));
  });

  test("keeps run progress separate and resets it without erasing lifetime progress", async () => {
    const eventBus = createEventBus();
    const system = createAchievementSystem({ eventBus, definitions: definitions() });
    await system.start();
    await eventBus.emitAsync("combo", { count: 4 });
    await eventBus.emitAsync("enemy:killed");

    expect(await system.getProgress("run_combo", { scope: "run" })).toBe(4);
    expect(await system.getProgress("three_kills")).toBe(1);
    system.resetRunProgress();
    expect(await system.getProgress("run_combo", { scope: "run" })).toBeUndefined();
    expect(await system.getProgress("three_kills")).toBe(1);
  });

  test("persists lifetime progress and unlock records through an injected store", async () => {
    const store = createMemoryAchievementStore();
    const firstBus = createEventBus();
    const first = createAchievementSystem({ eventBus: firstBus, definitions: definitions(), store });
    await first.start();
    await firstBus.emitAsync("damage:dealt", { amount: 100 });
    await first.flush();
    first.dispose();

    const second = createAchievementSystem({
      eventBus: createEventBus(),
      definitions: definitions(),
      store,
    });
    await second.start();
    expect(await second.isUnlocked("heavy_hit")).toBe(true);
    expect(await second.getProgress("heavy_hit")).toBe(100);
    expect((await second.exportState()).unlocked.heavy_hit.unlockedAt).toEqual(expect.any(Number));
  });

  test("supports custom host subscriptions for campaign-specific rules", async () => {
    const eventBus = createEventBus();
    const system = createAchievementSystem({
      eventBus,
      definitions: [{ id: "speedrun", name: "Speedrun" }],
    });
    system.subscribe("run:won", async (payload, achievement) => {
      if (payload.mode === "campaign" && payload.seconds <= 300) {
        await achievement.unlock("speedrun", { seconds: payload.seconds });
      }
    });
    await system.start();

    await eventBus.emitAsync("run:won", { mode: "endless", seconds: 100 });
    expect(await system.isUnlocked("speedrun")).toBe(false);
    await eventBus.emitAsync("run:won", { mode: "campaign", seconds: 299 });
    expect(await system.isUnlocked("speedrun")).toBe(true);
  });

  test("applies a host processing filter before rules", async () => {
    let practice = true;
    const eventBus = createEventBus();
    const system = createAchievementSystem({
      eventBus,
      definitions: definitions(),
      shouldProcess: () => !practice,
    });
    await system.start();
    await eventBus.emitAsync("enemy:killed");
    expect(await system.getProgress("three_kills")).toBeUndefined();

    practice = false;
    await eventBus.emitAsync("enemy:killed");
    expect(await system.getProgress("three_kills")).toBe(1);
  });
});
