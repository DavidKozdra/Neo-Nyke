// Data-driven story cinematics and authored story encounter orchestration.
// This deliberately lives above the combat systems: actors are presentation-only
// until a scene explicitly converts them into a real boss or rival encounter.

const Story = globalThis.NeoNyke?.story || {};

const ACTOR_LABELS = Object.freeze({
  thorn_knight: 'THORN', metao: 'METAO', gelleh: 'GELLEH', sarge: 'SARGE',
  princess: 'PRINCESS', turtle_boy: 'TURTLE BOY', mooggy: 'MOOGGY',
  handsome_devil: 'DEVIL', bowman_bane: "BOWMAN'S BANE",
});

const ACTOR_COLORS = Object.freeze({
  thorn_knight: '#8dc7ff', metao: '#b596ff', gelleh: '#ffd478', sarge: '#7da3ff',
  princess: '#ff9acf', turtle_boy: '#7fe0ff', mooggy: '#ff7a8d', handsome_devil: '#ff6d5e',
});

function storyLine(speaker, text) { return { speaker, text }; }

function opponentName(key) {
  return Neo.CHARACTER_DEFS?.[key]?.name || ACTOR_LABELS[key] || key;
}

export class StoryCutsceneManager {
  constructor() {
    this.active = false;
    this.sceneId = '';
    this.queue = [];
    this.command = null;
    this.commandTime = 0;
    this.actors = [];
    this.camera = { active: false, x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 };
    this.skipHeld = 0;
    this.roomToken = '';
    this.pendingTrigger = 0;
    this.lastRoom = null;
    this.storyStateRef = null;
    this.skipInputDown = false;
    this.bindEvents();
    this.bindSkipControls();
  }

  bindEvents() {
    Neo.gameEvents?.on?.('room:enter', ({ room }) => {
      if (Neo.gameMode !== 'story' || !room || Neo.floor === 1) return;
      if (this.storyStateRef !== Neo.storyState) {
        this.storyStateRef = Neo.storyState;
        this.lastRoom = null;
      }
      if (this.lastRoom && this.lastRoom !== room && this.lastRoom.storyEscapeOpen
        && !Neo.storyState?.completedEncounters?.bowman_bane) {
        Neo.storyState.choices.bowmanBane = 'escaped';
        Neo.storyState.completedEncounters.bowman_bane = 'escaped';
        Neo.storyState.objective = `Reach the ladder on Floor ${Neo.floor}`;
        this.lastRoom.storyEscapeOpen = false;
        this.lastRoom.storyEncounterComplete = true;
        Neo.scheduleRunSave?.();
      }
      this.lastRoom = room;
      clearTimeout(this.pendingTrigger);
      this.pendingTrigger = setTimeout(() => this.triggerRoom(room), 80);
    });
    Neo.gameEvents?.on?.('floor:enter', () => this.resetPresentation());
  }

  bindSkipControls() {
    window.addEventListener('keydown', event => {
      if (!this.active || event.key !== 'Escape') return;
      this.skipInputDown = true;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    window.addEventListener('keyup', event => {
      if (event.key === 'Escape') this.skipInputDown = false;
    }, true);
    const button = document.getElementById('storySkipHold');
    const start = event => { if (this.active) { this.skipInputDown = true; event.stopPropagation(); } };
    const stop = event => { this.skipInputDown = false; event?.stopPropagation?.(); };
    button?.addEventListener('pointerdown', start);
    button?.addEventListener('pointerup', stop);
    button?.addEventListener('pointercancel', stop);
    button?.addEventListener('pointerleave', stop);
    button?.addEventListener('click', event => event.stopPropagation());
  }

  isSceneComplete(id) { return !!Neo.storyState?.completedScenes?.[id]; }

  markSceneComplete(id) {
    if (!Neo.storyState || !id) return;
    Neo.storyState.completedScenes[id] = true;
    const seen = Neo.metaProgress.storyScenesSeen ||= [];
    if (!seen.includes(id)) seen.push(id);
    Neo.persistMetaSoon?.();
    Neo.scheduleRunSave?.();
  }

  triggerRoom(room) {
    if (this.active || Neo.gameMode !== 'story' || !Neo.storyState) return false;
    const plan = Story.getFloorPlan?.(Neo.player?.character || Neo.chosenCharacter, Neo.floor);
    if (!plan?.scene || plan.scene === 'tutorial') return false;
    const isStart = room.type === 'start';
    const isSecretScene = ['secret_beasts', 'sarge_skip_warning'].includes(plan.scene);
    if (isSecretScene ? !room.storySecretRoom : !isStart) return false;
    if (this.isSceneComplete(plan.scene)) {
      this.ensureCompletedSceneOutcome(plan, room);
      return false;
    }
    return this.play(plan.scene, this.buildScene(plan.scene, room));
  }

  ensureCompletedSceneOutcome(plan, room) {
    if (plan.encounter && !Neo.storyState.completedEncounters?.[plan.encounter]) {
      this.startEncounter(plan.encounter, room);
    }
    if (plan.scene === 'five_dragon_orbs') this.ensureDragonOrbCache(room);
    if (Neo.storyState.ally?.character === 'thorn_knight') this.ensureThornAlly();
  }

  buildScene(id, room) {
    const character = Neo.player?.character || Neo.chosenCharacter;
    const centerX = Neo.ROOM_W / 2;
    const centerY = Neo.ROOM_H / 2;
    if (id === 'heroes_meeting' || id === 'princess_departure') {
      const princessIsPlayer = character === 'princess';
      const roster = Story.HERO_ROUTE_CHARACTERS.filter(key => key !== character);
      const focusKeys = princessIsPlayer ? [...roster, 'player'] : [...roster, 'princess', 'player'];
      const commands = [
        { type: 'placePlayer', x: centerX, y: centerY + 185 },
        ...roster.map((key, index) => ({ type: 'spawn', key, x: centerX - 180 + index * 150, y: centerY - 30 })),
        ...(princessIsPlayer ? [] : [{ type: 'spawn', key: 'princess', x: centerX + 220, y: centerY + 35 }]),
        { type: 'focusGroup', keys: focusKeys, zoom: 0.9, duration: 0.7 },
        { type: 'dialogue', lines: Story.MEETING_LINES },
        { type: 'move', key: princessIsPlayer ? 'player' : 'princess', x: Neo.ROOM_W - 90, y: centerY + 35, duration: 1.1 },
      ];
      if (princessIsPlayer) commands.push(
        { type: 'emote', key: 'player', mark: '?', duration: 0.8 },
        { type: 'dialogue', lines: [storyLine('PRINCESS THOUGHT', 'I wonder what it would be like if I saved the day without them')] },
      );
      return commands;
    }
    if (id === 'secret_beasts') {
      return [
        { type: 'spawn', key: 'sarge', x: 100, y: centerY },
        { type: 'focus', key: 'sarge', zoom: 1.12, duration: 0.5 },
        { type: 'dialogue', lines: [storyLine('SARGE', 'Hey cool a skip room we can come all the way back here as much as we want')] },
        { type: 'move', key: 'sarge', x: centerX, y: centerY, duration: 0.75 },
        { type: 'jump', key: 'sarge', height: 52, duration: 0.6 },
        { type: 'warp', key: 'sarge', x: 130, y: centerY },
        { type: 'move', key: 'sarge', x: centerX, y: centerY, duration: 0.75 },
        { type: 'jump', key: 'sarge', height: 52, duration: 0.6 },
        { type: 'warp', key: 'sarge', x: 130, y: centerY },
        { type: 'move', key: 'sarge', x: centerX - 20, y: centerY, duration: 0.65 },
        { type: 'emote', key: 'sarge', mark: '!', duration: 0.65 },
        { type: 'lightning', key: 'sarge', duration: 1.1 },
        { type: 'transformBane', room },
      ];
    }
    if (id === 'sarge_skip_warning') {
      return [
        { type: 'focus', key: 'player', zoom: 1.12, duration: 0.5 },
        { type: 'dialogue', lines: [storyLine('SARGE', 'Hey cool a skip room we can come all the way back here as much as we want')] },
        { type: 'jump', key: 'player', height: 52, duration: 0.7 },
        { type: 'lightning', key: 'player', duration: 1 },
        { type: 'emote', key: 'player', mark: '!', duration: 0.65 },
        { type: 'dialogue', lines: [storyLine('SARGE', 'Nope. That warp is bad news. We move on.')] },
      ];
    }
    if (id === 'devil_trance') {
      const rushers = ['thorn_knight', 'metao', 'gelleh'];
      return [
        { type: 'spawn', key: 'handsome_devil', x: centerX, y: centerY - 190 },
        ...rushers.filter(key => key !== character).map((key, index) => ({ type: 'spawn', key, x: centerX - 160 + index * 150, y: centerY + 130 })),
        { type: 'focusGroup', keys: ['handsome_devil', ...rushers, 'player'], zoom: 0.86, duration: 0.7 },
        ...rushers.map(key => ({ type: 'move', key: key === character ? 'player' : key, x: centerX, y: centerY - 100, duration: 0.65 })),
        { type: 'blast', keys: rushers.map(key => key === character ? 'player' : key), duration: 0.75 },
        { type: 'dialogue', lines: Story.DEVIL_POEM },
        ...rushers.filter(key => key !== character).map(key => ({ type: 'emote', key, mark: '!', duration: 0.25 })),
        { type: 'startEncounter', encounter: 'trance_heroes', room },
      ];
    }
    if (id === 'dragon_orb_quest') {
      return [
        { type: 'focus', key: 'player', zoom: 1.14, duration: 0.5 },
        { type: 'emote', key: 'player', mark: '!', duration: 0.6 },
        { type: 'dialogue', lines: [storyLine('TURTLE BOY', 'I need to find all the dragon orbs I can to become the strongest')] },
        { type: 'grantOrb', count: 1 },
      ];
    }
    if (id === 'turtle_meets_mooggy') {
      return [
        { type: 'spawn', key: 'mooggy', x: centerX, y: centerY - 120 },
        { type: 'focusGroup', keys: ['player', 'mooggy'], zoom: 1.05, duration: 0.5 },
        { type: 'emote', key: 'mooggy', mark: '?', duration: 0.45 },
        { type: 'dialogue', lines: [
          storyLine('MOOGGY', 'Who are you'),
          storyLine('TURTLE BOY', 'Who are you ?'),
          storyLine('MOOGGY', 'well might as well fight'),
        ] },
        { type: 'startEncounter', encounter: 'mooggy_duel', room },
      ];
    }
    if (id === 'five_dragon_orbs') {
      return [
        { type: 'focus', key: 'player', zoom: 1.12, duration: 0.45 },
        { type: 'emote', key: 'player', mark: '!', duration: 0.7 },
        { type: 'dialogue', lines: [storyLine('TURTLE BOY', 'Five free Dragon Orbs. Now I am getting somewhere.')] },
        { type: 'orbCache', room },
      ];
    }
    if (id === 'devil_recruits_mooggy') {
      return [
        { type: 'lava', room },
        { type: 'spawn', key: 'handsome_devil', x: centerX, y: centerY - 130 },
        { type: 'focusGroup', keys: ['player', 'handsome_devil'], zoom: 1.02, duration: 0.6 },
        { type: 'dialogue', lines: [
          storyLine('DEVIL', 'Ok moogy listen you must stop the heroes at all cost'),
          storyLine('MOOGGY', 'Yes, uncle.'),
        ] },
      ];
    }
    if (id.startsWith('mooggy_duel_')) {
      const opponent = id.slice('mooggy_duel_'.length);
      return [
        { type: 'spawn', key: opponent, x: centerX, y: centerY - 125 },
        { type: 'focusGroup', keys: ['player', opponent], zoom: 1.04, duration: 0.5 },
        { type: 'emote', key: opponent, mark: '!', duration: 0.55 },
        { type: 'dialogue', lines: [storyLine(opponentName(opponent).toUpperCase(), 'You are not getting past me.')] },
        { type: 'startEncounter', encounter: `hero_duel:${opponent}`, room },
      ];
    }
    if (id === 'thorn_churu_alliance') {
      return [
        { type: 'spawn', key: 'thorn_knight', x: centerX, y: centerY - 125 },
        { type: 'focusGroup', keys: ['player', 'thorn_knight'], zoom: 1.04, duration: 0.5 },
        { type: 'dialogue', lines: [
          storyLine('THORN', 'You have fought everyone else. Before we fight, take this churu.'),
          storyLine('MOOGGY', '...mrow.'),
        ] },
        { type: 'grantChuru' },
        { type: 'startEncounter', encounter: 'hero_duel:thorn_knight', room, alliance: true },
      ];
    }
    return [];
  }

  play(id, commands) {
    if (!id || !Array.isArray(commands) || commands.length === 0 || this.active) return false;
    this.active = true;
    this.sceneId = id;
    this.queue = commands.slice();
    this.command = null;
    this.commandTime = 0;
    this.skipHeld = 0;
    this.roomToken = `${Neo.floor}:${Neo.currentRoom?.gx},${Neo.currentRoom?.gy}`;
    this.camera.active = true;
    document.getElementById('storySkipHold')?.classList.remove('hidden');
    Neo.storyCamera = this.camera;
    Neo.clearGameplayInput?.();
    Neo.setShopPanelOpen?.(false);
    Neo.setInventoryPanelOpen?.(false);
    if (Neo.gameState !== 'cutscene') Neo.setGameState?.('cutscene');
    return true;
  }

  tick(dt) {
    const step = Math.min(0.05, Math.max(0, Number(dt) || 0));
    this.updateEmotes(step);
    this.updatePersistentAlly(step);
    if (!this.active) return;
    this.updateSkip(step);
    this.updateCamera(step);
    if (!this.command) this.beginNextCommand();
    if (!this.command) return;
    this.commandTime += step;
    this.updateCommand(this.command, step);
  }

  beginNextCommand() {
    this.command = this.queue.shift() || null;
    this.commandTime = 0;
    if (!this.command) {
      this.finish();
      return;
    }
    const command = this.command;
    if (command.type === 'spawn') {
      this.spawnActor(command.key, command.x, command.y);
      this.completeCommand();
    } else if (command.type === 'placePlayer') {
      Object.assign(Neo.player, { x: command.x, y: command.y, vx: 0, vy: 0 });
      this.completeCommand();
    } else if (command.type === 'dialogue') {
      const lines = command.lines.map(line => ({ speaker: line.speaker, text: line.text }));
      const started = Neo.uiController?.playDialogue?.(lines, {
        returnState: 'cutscene',
        onComplete: () => this.completeCommand(),
      });
      if (!started) this.completeCommand();
    } else if (command.type === 'emote') {
      const actor = this.getActor(command.key);
      if (actor === Neo.player) {
        actor.storyEmote = command.mark || '!';
        actor.storyEmoteTime = command.duration || 0.7;
      } else if (actor) {
        actor.emote = command.mark || '!'; actor.emoteTime = command.duration || 0.7;
      }
    } else if (command.type === 'focus' || command.type === 'focusGroup') {
      this.setCameraTarget(command);
    } else if (command.type === 'warp') {
      const actor = this.getActor(command.key);
      if (actor) Object.assign(actor, { x: command.x, y: command.y, vx: 0, vy: 0 });
      Neo.ringBurst?.(command.x, command.y, 36, ACTOR_COLORS[command.key] || '#fff', 0.45);
      this.completeCommand();
    } else if (command.type === 'grantOrb') {
      this.ensureQuestOrb();
      this.completeCommand();
    } else if (command.type === 'orbCache') {
      this.ensureDragonOrbCache(command.room);
      this.completeCommand();
    } else if (command.type === 'grantChuru') {
      this.grantItem('churu_stick', 1, 'story:thorn_churu');
      if (Neo.player) Neo.player.hp = Math.min(Neo.player.maxHp, Neo.player.hp + Neo.player.maxHp * 0.3);
      this.completeCommand();
    } else if (command.type === 'lava') {
      this.ensureLavaPit(command.room);
      this.completeCommand();
    } else if (command.type === 'transformBane') {
      this.transformSargeIntoBane(command.room);
      this.completeCommand();
    } else if (command.type === 'startEncounter') {
      this.startEncounter(command.encounter, command.room, command);
      this.completeCommand();
    }
  }

  updateCommand(command) {
    const duration = Math.max(0.01, Number(command.duration) || 0.01);
    const t = Math.min(1, this.commandTime / duration);
    if (command.type === 'move') {
      const actor = this.getActor(command.key);
      if (!actor) { this.completeCommand(); return; }
      if (!command._start) command._start = { x: actor.x, y: actor.y };
      const ease = t * t * (3 - 2 * t);
      actor.x = command._start.x + (command.x - command._start.x) * ease;
      actor.y = command._start.y + (command.y - command._start.y) * ease;
      actor.vx = command.x - command._start.x;
      actor.vy = command.y - command._start.y;
      if (t >= 1) { actor.vx = 0; actor.vy = 0; this.completeCommand(); }
    } else if (command.type === 'jump') {
      const actor = this.getActor(command.key);
      if (!actor) { this.completeCommand(); return; }
      actor.jumpZ = Math.sin(t * Math.PI) * (command.height || 52);
      if (t >= 1) {
        actor.jumpZ = 0;
        Neo.ringBurst?.(actor.x, actor.y, 28, ACTOR_COLORS[actor.character] || '#fff', 0.35);
        this.completeCommand();
      }
    } else if (command.type === 'emote' || command.type === 'focus' || command.type === 'focusGroup'
      || command.type === 'lightning' || command.type === 'blast') {
      if (command.type === 'lightning' && this.commandTime < duration && Math.floor(this.commandTime * 14) !== command._pulse) {
        command._pulse = Math.floor(this.commandTime * 14);
        const actor = this.getActor(command.key);
        if (actor) {
          Neo.spawnParticle?.({ x: actor.x + (Math.random() - 0.5) * 45, y: actor.y - 30, life: 0.25, text: '⚡', c: '#c9e8ff' });
          Neo.addTrauma?.(0.08);
        }
      }
      if (command.type === 'blast' && !command._applied) {
        command._applied = true;
        command.keys.forEach((key, index) => {
          const actor = this.getActor(key);
          if (actor) { actor.x += (index - 1) * 95; actor.y += 120; actor.jumpZ = 30; }
        });
        Neo.addTrauma?.(0.28);
      }
      if (t >= 1) {
        if (command.type === 'blast') command.keys.forEach(key => { const actor = this.getActor(key); if (actor) actor.jumpZ = 0; });
        this.completeCommand();
      }
    }
  }

  completeCommand() {
    this.command = null;
    this.commandTime = 0;
  }

  updateSkip(dt) {
    const held = this.skipInputDown
      || !!Neo.keys?.Escape
      || (!!Neo.keys?.Shift && !!Neo.keys?.Enter)
      || !!window.NeoGamepad?.[0]?.buttonStates?.[1];
    this.skipHeld = held ? this.skipHeld + dt : 0;
    document.getElementById('storySkipHold')?.style.setProperty('--skip-progress', `${Math.min(100, this.skipHeld / 0.8 * 100)}%`);
    if (this.skipHeld >= 0.8) this.skip();
  }

  skip() {
    if (!this.active) return;
    Neo.uiController?.closeDialogue?.();
    const commands = [this.command, ...this.queue].filter(Boolean);
    commands.forEach(command => {
      if (command.type === 'placePlayer') Object.assign(Neo.player, { x: command.x, y: command.y, vx: 0, vy: 0 });
      if (command.type === 'spawn') this.spawnActor(command.key, command.x, command.y);
      if (command.type === 'move' || command.type === 'warp') {
        const actor = this.getActor(command.key);
        if (actor) Object.assign(actor, { x: command.x, y: command.y, jumpZ: 0, vx: 0, vy: 0 });
      }
      if (command.type === 'grantOrb') this.ensureQuestOrb();
      if (command.type === 'grantChuru') this.grantItem('churu_stick', 1, 'story:thorn_churu');
      if (command.type === 'orbCache') this.ensureDragonOrbCache(command.room);
      if (command.type === 'lava') this.ensureLavaPit(command.room);
      if (command.type === 'transformBane') this.transformSargeIntoBane(command.room);
      if (command.type === 'startEncounter') this.startEncounter(command.encounter, command.room, command);
    });
    this.queue = [];
    this.command = null;
    this.finish();
  }

  finish() {
    if (!this.active) return;
    const id = this.sceneId;
    this.markSceneComplete(id);
    this.active = false;
    this.skipInputDown = false;
    const skipButton = document.getElementById('storySkipHold');
    skipButton?.classList.add('hidden');
    skipButton?.style.setProperty('--skip-progress', '0%');
    this.sceneId = '';
    this.queue = [];
    this.command = null;
    this.camera.active = false;
    this.camera.zoom = 1;
    const persistent = this.actors.filter(actor => actor.persistent);
    this.actors.splice(0, this.actors.length, ...persistent);
    Neo.clearGameplayInput?.();
    if ((Neo.gameState === 'dialogue' || Neo.gameState === 'cutscene') && !Neo.uiController?.isDialogueOpen?.()) Neo.setGameState?.('play');
    Neo.updateObjective?.();
  }

  resetPresentation() {
    if (this.active) {
      this.active = false;
      this.queue = [];
      this.command = null;
    }
    this.actors.splice(0, this.actors.length);
    this.camera.active = false;
    this.camera.zoom = 1;
    this.skipInputDown = false;
    this.skipHeld = 0;
    const skipButton = document.getElementById('storySkipHold');
    skipButton?.classList.add('hidden');
    skipButton?.style.setProperty('--skip-progress', '0%');
  }

  spawnActor(character, x, y, options = {}) {
    const existing = this.actors.find(actor => actor.character === character && !actor.combatConverted);
    if (existing) { Object.assign(existing, { x, y, ...options }); return existing; }
    const actor = {
      id: `story-${character}-${this.actors.length + 1}`,
      character,
      spriteKey: character,
      name: ACTOR_LABELS[character] || opponentName(character).toUpperCase(),
      x, y, vx: 0, vy: 0, r: 16, jumpZ: 0, emote: '', emoteTime: 0,
      facing: 1, animSeed: this.actors.length * 0.73,
      ...options,
    };
    this.actors.push(actor);
    return actor;
  }

  getActor(key) {
    if (key === 'player') return Neo.player;
    return this.actors.find(actor => actor.character === key && !actor.combatConverted) || null;
  }

  setCameraTarget(command) {
    const keys = command.type === 'focusGroup' ? command.keys : [command.key];
    const actors = keys.map(key => this.getActor(key)).filter(Boolean);
    if (!actors.length) return;
    this.camera.targetX = actors.reduce((sum, actor) => sum + actor.x, 0) / actors.length;
    this.camera.targetY = actors.reduce((sum, actor) => sum + actor.y - Number(actor.jumpZ || 0), 0) / actors.length;
    this.camera.targetZoom = Number(command.zoom || 1);
    if (!Number.isFinite(this.camera.x) || this.camera.x === 0) {
      this.camera.x = this.camera.targetX;
      this.camera.y = this.camera.targetY;
    }
  }

  updateCamera(dt) {
    if (!this.camera.active || !Neo.canvas) return;
    const reduced = window.NeoSettings?.getAccess?.().reducedMotion === true;
    const k = reduced ? 1 : 1 - Math.exp(-6 * dt);
    this.camera.x += (this.camera.targetX - this.camera.x) * k;
    this.camera.y += (this.camera.targetY - this.camera.y) * k;
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * k;
    Neo.camera.x = this.camera.x - Neo.canvas.width / 2;
    Neo.camera.y = this.camera.y - Neo.canvas.height / 2;
  }

  updateEmotes(dt) {
    this.actors.forEach(actor => { actor.emoteTime = Math.max(0, Number(actor.emoteTime || 0) - dt); });
    if (Neo.player?.storyEmoteTime > 0) Neo.player.storyEmoteTime = Math.max(0, Neo.player.storyEmoteTime - dt);
  }

  drawActors() {
    if (!Neo.drawActorSprite) return;
    this.actors.forEach(actor => {
      if (actor.combatConverted) return;
      const drawY = actor.y - Number(actor.jumpZ || 0);
      Neo.drawActorSprite(actor, actor.spriteKey, actor.x, drawY, 54, {
        animation: { attackTime: 0, isMoving: Math.hypot(actor.vx || 0, actor.vy || 0) > 1 },
      });
      this.drawEmote(actor, drawY);
    });
    if (Neo.player?.storyEmoteTime > 0) this.drawEmote({ ...Neo.player, emote: Neo.player.storyEmote, emoteTime: Neo.player.storyEmoteTime }, Neo.player.y);
  }

  drawEmote(actor, drawY) {
    if (!actor?.emote || Number(actor.emoteTime || 0) <= 0) return;
    const pop = Math.min(1, (0.8 - actor.emoteTime + 0.16) / 0.16);
    Neo.ctx.save();
    Neo.ctx.translate(actor.x, drawY - (actor.r || 16) - 34 - Math.sin(actor.emoteTime * 10) * 3);
    Neo.ctx.scale(pop, pop);
    Neo.ctx.fillStyle = actor.emote === '?' ? '#8dd4ff' : '#ffd24a';
    Neo.ctx.strokeStyle = '#08111f';
    Neo.ctx.lineWidth = 4;
    Neo.ctx.font = '900 28px system-ui';
    Neo.ctx.textAlign = 'center';
    Neo.ctx.textBaseline = 'middle';
    Neo.ctx.strokeText(actor.emote, 0, 0);
    Neo.ctx.fillText(actor.emote, 0, 0);
    Neo.ctx.restore();
  }

  grantItem(key, count, rewardId) {
    if (!Neo.storyState || Neo.storyState.rewards[rewardId]) return false;
    Neo.storyState.rewards[rewardId] = true;
    Neo.player.items[key] = Number(Neo.player.items[key] || 0) + Math.max(1, Number(count) || 1);
    Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 30, life: 1.1, text: `${Neo.ITEM_DEFS?.[key]?.name || key} +${count}`, c: Neo.ITEM_DEFS?.[key]?.color || '#fff' });
    Neo.playSfx?.('powerup');
    Neo.updateHud?.();
    Neo.scheduleRunSave?.();
    return true;
  }

  ensureDragonOrbCache(room) {
    if (!room || Neo.storyState?.rewards?.floor8DragonOrbs) return;
    const offsets = [-120, -60, 0, 60, 120];
    room.pickups = room.pickups || [];
    if (!room.pickups.some(pickup => pickup.storyRewardGroup === 'floor8DragonOrbs')) {
      const claimed = Neo.storyState?.floor8DragonOrbsClaimed || {};
      offsets.forEach((offset, index) => {
        if (claimed[index]) return;
        room.pickups.push({
        x: Neo.ROOM_W / 2 + offset,
        y: Neo.ROOM_H / 2,
        type: 'item',
        key: 'dragon_orb',
        storyRewardGroup: 'floor8DragonOrbs',
        storyRewardIndex: index,
        });
      });
      if (Neo.currentRoom === room) Neo.pickups = room.pickups;
    }
  }

  ensureQuestOrb() {
    if (Neo.storyState?.rewards?.floor3DragonOrb || !Neo.currentRoom) return;
    if (!Neo.pickups.some(pickup => pickup.storyRewardGroup === 'floor3DragonOrb')) {
      Neo.pickups.push({
        x: Neo.ROOM_W / 2,
        y: Neo.ROOM_H / 2 - 80,
        type: 'item',
        key: 'dragon_orb',
        storyRewardGroup: 'floor3DragonOrb',
      });
      Neo.currentRoom.pickups = Neo.pickups;
    }
  }

  ensureLavaPit(room) {
    if (!room) return;
    room.storyLavaPit = true;
    room.hazards = room.hazards || [];
    if (!room.hazards.some(hazard => hazard.storyLavaPit)) {
      [
        { x: Neo.ROOM_W / 2, y: 105, w: Neo.ROOM_W - 180, h: 90 },
        { x: Neo.ROOM_W / 2, y: Neo.ROOM_H - 105, w: Neo.ROOM_W - 180, h: 90 },
      ].forEach(hazard => room.hazards.push({ ...hazard, kind: 'lava', storyLavaPit: true, life: 9999, tick: 0 }));
      if (Neo.currentRoom === room) Neo.hazards = room.hazards;
    }
  }

  transformSargeIntoBane(room) {
    if (!room || Neo.storyState?.completedEncounters?.bowman_bane) return;
    const sarge = this.getActor('sarge');
    if (sarge) sarge.combatConverted = true;
    room.secret = true;
    room.secretKind = 'bowman_bane';
    room.cleared = false;
    room.storyEscapeOpen = true;
    const boss = Neo.spawnBowmanBane?.();
    if (boss) boss.storyEncounter = 'bowman_bane';
    Neo.spawnParticle?.({ x: boss?.x || Neo.ROOM_W / 2, y: (boss?.y || Neo.ROOM_H / 2) - 52, life: 1.3, text: 'FIGHT OR ESCAPE', c: '#c9aaff' });
  }

  startEncounter(encounter, room, options = {}) {
    if (!encounter || !room || Neo.storyState?.completedEncounters?.[encounter]) return;
    if ((Neo.enemies || []).some(enemy => !enemy.dead && enemy.storyEncounter === encounter)) return;
    room.cleared = false;
    room.storyEncounter = encounter;
    const opponents = encounter === 'trance_heroes'
      ? (Neo.player.character === 'sarge' ? ['thorn_knight', 'metao', 'gelleh'] : ['thorn_knight', 'metao', 'gelleh'].filter(key => key !== Neo.player.character))
      : encounter === 'mooggy_duel' ? ['mooggy']
      : encounter.startsWith('hero_duel:') ? [encounter.split(':')[1]] : [];
    this.actors.forEach(actor => {
      if (opponents.includes(actor.character)) actor.combatConverted = true;
    });
    opponents.forEach((character, index) => this.spawnStoryRival(character, encounter, index, options));
    Neo.storyState.objective = opponents.length > 1 ? `Defeat ${opponents.length} entranced heroes` : `Defeat ${opponentName(opponents[0])}`;
    Neo.scheduleRunSave?.();
  }

  spawnStoryRival(character, encounter, index, options = {}) {
    const def = Neo.RIVAL_DEFS?.[character];
    if (!def) return null;
    const rivalSource = {
      rivalId: `story:${encounter}:${character}`,
      characterKey: character,
      name: def.name,
      color: def.color,
      attackStyle: def.attackStyle,
      enterLine: '', deathLine: '',
      roomGx: Neo.currentRoom.gx, roomGy: Neo.currentRoom.gy,
      baseHp: def.hp, baseDmg: def.dmg, baseSpeed: def.speed, baseAttackCd: def.attackCd,
      hp: def.hp, max: def.hp, dmg: def.dmg, speed: def.speed, r: def.r, attackCd: def.attackCd,
      level: Math.max(1, Neo.floor), xp: 0, xpToNext: 99, growthTick: 0,
      loot: [], homeGx: Neo.currentRoom.gx, homeGy: Neo.currentRoom.gy,
      objectiveGx: Neo.currentRoom.gx, objectiveGy: Neo.currentRoom.gy, objectiveKind: 'engage', route: [], aggroTimer: 0,
      relationship: -10, vendetta: true, lives: 1, dead: false,
    };
    // Reuse the full rival migration path so story rivals receive canonical
    // weapon kits, AI memory, cooldown state, and floor scaling.
    const rival = Neo.migrateRivalState?.(rivalSource) || rivalSource;
    rival.storyEncounter = encounter;
    rival.storyAlliance = !!options.alliance;
    rival.relationship = -10;
    rival.vendetta = true;
    Neo.rivals.push(rival);
    Neo.injectRivalToCurrentRoom?.(rival);
    const enemy = Neo.enemies.find(entry => entry.rivalData === rival);
    if (enemy) {
      enemy.x = Neo.ROOM_W / 2 + (index - (encounter === 'trance_heroes' ? 0.5 : 0)) * 150;
      enemy.y = Neo.ROOM_H / 2 - 110;
      enemy.storyEncounter = encounter;
      enemy.storyAlliance = !!options.alliance;
    }
    return enemy;
  }

  onStoryEnemyDefeated(enemy) {
    const encounter = enemy?.storyEncounter || enemy?.rivalData?.storyEncounter;
    if (!encounter || !Neo.storyState) return false;
    const remaining = Neo.enemies.some(other => other !== enemy && !other.dead && other.storyEncounter === encounter && other.hp > 0);
    if (remaining) return true;
    Neo.storyState.completedEncounters[encounter] = true;
    Neo.currentRoom.storyEncounterComplete = true;
    Neo.currentRoom.cleared = true;
    Neo.storyState.objective = `Reach the ladder on Floor ${Neo.floor}`;
    if (encounter === 'bowman_bane') this.grantBaneInsignia();
    if (encounter === 'hero_duel:thorn_knight') {
      Neo.storyState.ally = { character: 'thorn_knight', hp: 1 };
      this.ensureThornAlly();
      Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 42, life: 1.5, text: 'THORN JOINS YOU', c: '#8dc7ff' });
    }
    Neo.scheduleRunSave?.();
    Neo.updateObjective?.();
    return true;
  }

  grantBaneInsignia() {
    if (Neo.storyState.rewards.baneInsignia) return;
    Neo.storyState.rewards.baneInsignia = true;
    Neo.player.storyBaneInsignia = true;
    Neo.spawnParticle?.({ x: Neo.player.x, y: Neo.player.y - 36, life: 1.4, text: "BANE'S INSIGNIA", c: '#c9aaff' });
    Neo.updateHud?.();
    Neo.scheduleRunSave?.();
  }

  ensureThornAlly() {
    if (Neo.gameMode !== 'story' || Neo.storyState?.ally?.character !== 'thorn_knight') return;
    // Friendly story allies are presentation-followers outside the final boss;
    // they never consume loot, collide with doors, or enter rival state.
    return this.spawnActor('thorn_knight', Neo.player.x - 46, Neo.player.y + 30, { persistent: true, friendly: true });
  }

  updatePersistentAlly(dt) {
    if (Neo.gameMode !== 'story' || Neo.storyState?.ally?.character !== 'thorn_knight' || !Neo.player) return;
    const actor = this.ensureThornAlly();
    if (!actor || this.active) return;
    const targetX = Neo.player.x - (Neo.player.vx >= 0 ? 48 : -48);
    const targetY = Neo.player.y + 34;
    const k = 1 - Math.exp(-5 * dt);
    actor.vx = targetX - actor.x;
    actor.vy = targetY - actor.y;
    actor.x += actor.vx * k;
    actor.y += actor.vy * k;
    if (Math.hypot(actor.vx, actor.vy) < 2) { actor.vx = 0; actor.vy = 0; }
    actor.attackCd = Math.max(0, Number(actor.attackCd || 0) - dt);
    if (Neo.gameState === 'play' && actor.attackCd <= 0) {
      const target = (Neo.enemies || [])
        .filter(enemy => enemy && !enemy.dead && enemy.hp > 0 && !(enemy.type === 'rival' && enemy.rivalData?.friend))
        .sort((left, right) => Neo.dist(actor.x, actor.y, left.x, left.y) - Neo.dist(actor.x, actor.y, right.x, right.y))[0];
      if (target && Neo.dist(actor.x, actor.y, target.x, target.y) <= 280) {
        actor.attackCd = 1.1;
        const angle = Math.atan2(target.y - actor.y, target.x - actor.x);
        actor.facing = Math.cos(angle) < 0 ? -1 : 1;
        Neo.hitEnemy?.(target, 18 + Neo.floor * 2, angle, 120, '#8dc7ff', { rawDamage: true, bloodOnHit: false });
        Neo.ringBurst?.(target.x, target.y, 24, '#8dc7ff', 0.25);
      }
    }
  }
}

export const storyCutsceneManager = new StoryCutsceneManager();
Neo.storyManager = storyCutsceneManager;
Neo.storyActors = storyCutsceneManager.actors;
Neo.drawStoryActors = () => storyCutsceneManager.drawActors();
Neo.onStoryEnemyDefeated = enemy => storyCutsceneManager.onStoryEnemyDefeated(enemy);
