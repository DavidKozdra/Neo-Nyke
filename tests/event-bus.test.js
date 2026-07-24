const { createEventBus } = require("../Koz_Engine_Lib/Events/eventBus");

describe("Koz Engine EventBus", () => {
  test("delivers exact, namespace wildcard, and global subscriptions by priority", () => {
    const bus = createEventBus();
    const calls = [];
    bus.subscribe("*", () => calls.push("global"), { priority: -1 });
    bus.subscribe("combat:*", () => calls.push("combat"));
    const unsubscribe = bus.subscribe("combat:hit", () => calls.push("exact"), { priority: 10 });

    const first = bus.emit("combat:hit", { amount: 4 });
    expect(first).toMatchObject({ delivered: 3, filtered: false });
    expect(calls).toEqual(["exact", "combat", "global"]);

    unsubscribe();
    bus.emit("combat:hit");
    expect(calls).toEqual(["exact", "combat", "global", "combat", "global"]);
  });

  test("supports once, abort signals, and listener counts", () => {
    const bus = createEventBus();
    const once = jest.fn();
    const aborted = jest.fn();
    const controller = new AbortController();
    bus.once("run:won", once);
    bus.subscribe("run:won", aborted, { signal: controller.signal });
    expect(bus.listenerCount("run:won")).toBe(2);

    controller.abort();
    bus.emit("run:won");
    bus.emit("run:won");

    expect(once).toHaveBeenCalledTimes(1);
    expect(aborted).not.toHaveBeenCalled();
    expect(bus.listenerCount("run:won")).toBe(0);
  });

  test("contains synchronous and asynchronous listener failures", async () => {
    const errors = [];
    const bus = createEventBus({
      onError(error, context) {
        errors.push([error.message, context.topic]);
      },
    });
    bus.on("bad", () => { throw new Error("sync"); });
    bus.on("bad", async () => { throw new Error("async"); });

    const receipt = await bus.emitAsync("bad");
    expect(receipt.delivered).toBe(2);
    expect(receipt.errors).toHaveLength(2);
    expect(errors).toEqual([["sync", "bad"], ["async", "bad"]]);
  });

  test("filters host events before achievement-style subscribers see them", () => {
    let practice = true;
    const listener = jest.fn();
    const bus = createEventBus({
      shouldPublish: () => !practice,
    });
    bus.on("enemy:killed", listener);

    expect(bus.emit("enemy:killed").filtered).toBe(true);
    practice = false;
    expect(bus.emit("enemy:killed").filtered).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
