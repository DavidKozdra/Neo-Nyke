const { NavigationAgent } = require('../Koz_Engine_Lib/AI/navigationAgent');
const collision = require('../Koz_Engine_Lib/Combat/collisionLayers');

describe('Koz Engine navigation and collision layers', () => {
  test('caches paths, consumes waypoints, and repaths only when needed', () => {
    const agent = new NavigationAgent({ repathInterval: 1, targetMoveThreshold: 5, waypointRadius: 1 });
    let requests = 0;
    const requestPath = () => { requests += 1; return [{ x: 4, y: 0 }, { x: 10, y: 0 }]; };
    expect(agent.update({ position: { x: 0, y: 0 }, target: { x: 10, y: 0 }, delta: 0.1, requestPath })).toMatchObject({ repathed: true, directionX: 1 });
    expect(agent.update({ position: { x: 4, y: 0 }, target: { x: 10, y: 0 }, delta: 0.1, requestPath })).toMatchObject({ repathed: false, waypoint: { x: 10, y: 0 } });
    expect(requests).toBe(1);
  });

  test('filters interaction layers and finds the earliest swept circle hit', () => {
    const layers = collision.createCollisionLayers(['hero', 'enemy', 'wall']);
    const hero = { collisionLayer: layers.hero, collisionMask: collision.maskFor(layers, 'enemy', 'wall') };
    const wall = { collisionLayer: layers.wall, collisionMask: collision.maskFor(layers, 'hero') };
    expect(collision.canCollide(hero, wall)).toBe(true);
    const hit = collision.findFirstSweepHit({ x: 0, y: 0, radius: 1, dx: 10, dy: 0 }, [{ x: 7, y: -2, w: 2, h: 4 }, { x: 4, y: -2, w: 1, h: 4 }]);
    expect(hit).toEqual(expect.objectContaining({ x: 3, y: 0, normalX: -1 }));
  });
});
