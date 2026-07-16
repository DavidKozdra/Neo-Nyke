// Authored PNG assets used by environment renderers. Keeping these in one
// registry lets gameplay and the sprite editor share the exact live images.
const ENVIRONMENT_IMAGE_PATHS = {
  anvil_0: 'assets/sprites/env/anvil_0.png',
  barrel_0: 'assets/sprites/env/barrel_0.png',
  chair_0: 'assets/sprites/env/chair_0.png',
  chair_1: 'assets/sprites/env/chair_1.png',
  chest_0: 'assets/sprites/env/chest_0.png',
  chest_a_b: 'assets/sprites/env/chest_a_b.png',
  forge_0: 'assets/sprites/env/forge_0.png',
  ground_0: 'assets/sprites/env/ground_0.png',
  ladder_0: 'assets/sprites/env/ladder_0.png',
  pillar: 'assets/sprites/env/pillar.png',
  pillar_1: 'assets/sprites/env/pillar_1.png',
  pillar_2: 'assets/sprites/env/pillar_2.png',
  pillar_3: 'assets/sprites/env/pillar_3.png',
  table_0: 'assets/sprites/env/table_0.png',
  table_1: 'assets/sprites/env/table_1.png',
};

export async function preloadEnvironmentImages() {
  const loaded = await Promise.all(Object.entries(ENVIRONMENT_IMAGE_PATHS).map(([key, src]) => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve([key, { image, src }]);
    image.onerror = () => resolve([key, null]);
    image.src = src;
  })));
  Neo.ENVIRONMENT_IMAGES = Object.fromEntries(loaded.filter(([, asset]) => asset));
  return Neo.ENVIRONMENT_IMAGES;
}

Neo.ENVIRONMENT_IMAGE_PATHS = ENVIRONMENT_IMAGE_PATHS;
Neo.preloadEnvironmentImages = preloadEnvironmentImages;
