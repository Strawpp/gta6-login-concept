// 使用可控时钟验证轮播状态边界，不依赖网络、真实浏览器或额外运行依赖。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const controllerSource = source.slice(0, source.indexOf('  const background = new BackgroundController();')) +
  '\n globalThis.Controller = BackgroundController; })();';
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

function setup(fails = () => false) {
  let now = 0, nextId = 0;
  const timers = new Map();
  const later = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
  const clear = id => timers.delete(id);
  const animations = [];
  class Animation {
    constructor(frames, options) {
      this.frames = frames;
      this.duration = options.duration;
      this.elapsed = 0;
      this.state = 'paused';
      this.finished = new Promise(resolve => { this.resolve = resolve; });
      animations.push(this);
      this.play();
    }
    get currentTime() { return this.elapsed + (this.state === 'running' ? now - this.started : 0); }
    get playState() { return this.state; }
    pause() {
      if (this.state === 'running') { this.elapsed = this.currentTime; clear(this.timer); this.state = 'paused'; }
      else if (this.state === 'finished') this.state = 'paused';
    }
    play() {
      if (this.state !== 'paused') return;
      if (this.elapsed >= this.duration) this.elapsed = 0;
      this.state = 'running'; this.started = now;
      this.timer = later(() => this.finish(), this.duration - this.elapsed);
    }
    finish() { clear(this.timer); this.elapsed = this.duration; this.state = 'finished'; this.resolve(); }
    cancel() { clear(this.timer); this.state = 'idle'; this.resolve(); }
  }
  class Element {
    constructor() {
      this.dataset = {};
      this.children = [];
      this.classList = { toggle() {}, add() {}, remove() {} };
      this.style = { getPropertyValue(name) { return this[name] || ''; }, setProperty(name, value) { this[name] = value; } };
    }
    querySelector() { return this.children[0] || null; }
    replaceChildren(image) { assert.equal(image.decoded, true, '图片必须先解码再挂载'); this.children = [image]; }
    setAttribute(name, value) { this[name] = value; }
    removeAttribute(name) { delete this[name]; }
    animate(frames, options) { return new Animation(frames, options); }
  }
  class TestImage extends Element {
    set src(value) {
      this.address = value;
      queueMicrotask(() => {
        if (!value || fails(value)) this.onerror?.();
        else { this.naturalWidth = 1280; this.onload?.(); }
      });
    }
    get src() { return this.address; }
    async decode() { this.decoded = true; }
  }
  const elements = new Map();
  const get = selector => { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); };
  const dialog = { open: false };
  get('#modal-content').closest = () => dialog;
  const reduced = { matches: false };
  const document = {
    hidden: false, documentElement: get('html'), body: get('body'),
    querySelector: get, querySelectorAll: () => [],
  };
  const context = { document, Image: TestImage, console, performance: { now: () => now },
    window: { innerWidth: 844, innerHeight: 390, matchMedia: () => reduced, addEventListener() {} },
    setTimeout: later, clearTimeout: clear, requestAnimationFrame: fn => queueMicrotask(fn), cancelAnimationFrame() {},
  };
  vm.runInNewContext(controllerSource, context);
  return { background: new context.Controller(), document, dialog, reduced, elements, animations, timers,
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].fn(); await flush();
      }
      now = target; await flush();
    }
  };
}

test('下一张提前解码挂载；周期 6 秒、淡入 600ms、放大 105% 保持独立', async () => {
  const env = setup();
  await env.background.show(0, true); await flush();
  assert.equal(env.background.prepared.index, 1);
  assert.equal(env.background.layers[1].querySelector().decoded, true);
  await env.advance(6000);
  assert.equal(env.background.current, 1);
  assert.equal(env.background.fadeAnimation.duration, 600);
  assert.equal(env.animations.find(a => a.frames[1].transform)?.frames[1].transform, 'scale(1.05)');
  await env.advance(600);
  assert.equal(env.background.busy, false);
  assert.ok([...env.timers.values()].some(t => t.at === 12000), '淡入不会把切图周期拉长到 6.6 秒');
});

test('切图期间快速选择，最终响应最后一次请求', async () => {
  const env = setup();
  await env.background.show(0, true); await flush();
  const changing = env.background.show(1, true); await flush();
  await env.background.show(4, true);
  await env.background.show(6, true);
  await env.advance(600); await changing; await flush();
  assert.equal(env.background.current, 6);
  await env.advance(600);
  assert.equal(env.background.busy, false);
});

test('弹窗与后台暂停，关闭镜头运动不取消动画或重置构图', async () => {
  const env = setup();
  await env.background.show(0, true); await flush(); await env.advance(1000);
  const animation = env.background.zoomAnimations.get(env.background.layers[0]);
  const time = animation.currentTime;
  env.dialog.open = true; env.background.handleVisibility();
  await env.advance(2000);
  assert.equal(animation.currentTime, time);
  env.background.setMotion(false);
  env.dialog.open = false; env.background.handleVisibility();
  assert.equal(animation.state, 'paused');
  assert.equal(animation.currentTime, time);
  env.reduced.matches = true; env.background.handleVisibility();
  env.reduced.matches = false; env.background.handleVisibility();
  assert.equal(env.background.motion, false, '系统偏好变化不能覆盖用户选择');
  env.background.setMotion(true);
  assert.equal(animation.state, 'running');
  env.document.hidden = true; env.background.handleVisibility();
  assert.equal(animation.state, 'paused');
});

test('WebP 失败时使用缩小的 JPEG；单图失败跳过，全部失败可继续操作且有限重试', async () => {
  const fallback = setup(path => path.endsWith('.webp'));
  await fallback.background.show(0, true);
  assert.match(fallback.background.layers[0].querySelector().src, /fallback\.jpg$/);
  const skipped = setup(path => path.includes('jason-lucia.'));
  await skipped.background.show(0, true);
  assert.equal(skipped.background.current, 1);
  const failed = setup(() => true);
  await failed.background.show(0, true);
  assert.equal(failed.background.current, -1);
  assert.equal(failed.background.busy, false);
  assert.equal(failed.background.failed.size, 7);
  await failed.advance(15000);
  assert.equal(failed.background.retryCount, 2);
  assert.equal([...failed.timers.values()].some(t => t.at > 15000), false, '失败后不能无限轮询');
});

test('减少动态效果时无淡入；弹窗下手动选图即时更新，关闭后再恢复运动', async () => {
  const env = setup(); env.reduced.matches = true;
  await env.background.show(0, true); await env.background.show(1, true);
  assert.equal(env.background.fadeAnimation, null);
  env.reduced.matches = false; env.dialog.open = true;
  await env.background.show(5, true);
  assert.equal(env.background.current, 5);
  assert.equal(env.background.fadeAnimation, null);
  assert.equal(env.background.zoomAnimations.get(env.background.layers[env.background.activeLayer]).state, 'paused');
});

test('只剩一张可用图，缩放结束后开关弹窗不能重新播放缩放', async () => {
  const env = setup(path => !path.includes('jason-lucia'));
  await env.background.show(0, true); await flush(); await env.advance(7000);
  const animation = env.background.zoomAnimations.get(env.background.layers[0]);
  assert.equal(animation.state, 'finished');
  env.dialog.open = true; env.background.handleVisibility();
  env.dialog.open = false; env.background.handleVisibility();
  assert.equal(animation.state, 'finished');
  assert.equal(animation.currentTime, 6600);
});
