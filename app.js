/* GTA VI 概念页：背景控制与界面交互分离，后续可仅替换背景控制器接入视频。 */
(() => {
  'use strict';

  // 依据首次打开时的画布选择一档资源；旋转后不重复下载，不随设备像素比盲目加载 4K。
  const artworkWidth = Math.max(window.innerWidth, window.innerHeight);
  const artworkSize = artworkWidth <= 1000 ? 1280 : artworkWidth <= 1600 ? 1600 : 1920;
  const artwork = (key) => ({
    sources: [`assets/backgrounds/${key}.${artworkSize}.webp`, `assets/backgrounds/${key}.fallback.jpg`],
    thumbnail: `assets/backgrounds/${key}.thumb.jpg`
  });
  // 按环境与人物构图交替编排，所有背景均为不带徽标的完整横版美术图。
  const scenes = [
    { name: '杰森与露西娅', ...artwork('jason-lucia'), focus: '50% 0%' },
    { name: '海岸假日', ...artwork('beach'), focus: '65% 0%' },
    { name: '整装待发', ...artwork('lock-load'), focus: '40% 0%' },
    { name: '屋顶之上', ...artwork('rooftop'), focus: '65% 0%' },
    { name: '汽车旅馆', ...artwork('motel'), focus: '35% 15%' },
    { name: '杰森与露西娅02', ...artwork('duo-02'), focus: '45% 0%' },
    { name: '进行抢劫', ...artwork('robbery'), focus: '65% 0%' }
  ];
  const INTERVAL = 6000;
  const FADE = 600;
  const $ = (selector) => document.querySelector(selector);
  const dialog = $('#modal-content').closest('dialog');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let toastTimer;
  let opener = null;
  let dialogGeneration = 0;
  let loginTimer;

  /** 以网页实际可见区域建立横屏画布，不依赖系统自动旋转或方向锁定权限。 */
  function syncViewport() {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    // 手动捏合缩放时沿用布局视口，避免缩放操作反复触发画布旋转。
    const useVisualViewport = viewport && Math.abs(viewport.scale - 1) < 0.01;
    const width = useVisualViewport ? viewport.width : window.innerWidth;
    const height = useVisualViewport ? viewport.height : window.innerHeight;
    if (width <= 0 || height <= 0) return;
    const rotated = height > width;
    const stageWidth = Math.max(width, height);
    const stageHeight = Math.min(width, height);
    const values = {
      '--viewport-width': `${width}px`, '--viewport-height': `${height}px`,
      '--viewport-left': `${useVisualViewport ? viewport.offsetLeft : 0}px`,
      '--viewport-top': `${useVisualViewport ? viewport.offsetTop : 0}px`,
      '--stage-width': `${stageWidth}px`, '--stage-height': `${stageHeight}px`,
      '--stage-angle': rotated ? '90deg' : '0deg'
    };
    // 微信地址栏可能重复发送相同尺寸事件，仅写入变化的值以减少整页样式计算。
    Object.entries(values).forEach(([name, value]) => {
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
    });
    const flags = { rotated, compact: stageHeight <= 600, narrow: stageWidth <= 740 };
    Object.entries(flags).forEach(([name, value]) => {
      if (root.dataset[name] !== String(value)) root.dataset[name] = String(value);
    });
  }

  let viewportFrame = 0;
  function scheduleViewportSync() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(syncViewport);
  }
  syncViewport();
  window.addEventListener('resize', scheduleViewportSync);
  window.addEventListener('orientationchange', scheduleViewportSync);
  window.visualViewport?.addEventListener('resize', scheduleViewportSync);
  window.visualViewport?.addEventListener('scroll', scheduleViewportSync);
  window.addEventListener('pageshow', scheduleViewportSync);

  function toast(message) {
    const element = $('#toast');
    clearTimeout(toastTimer);
    element.textContent = message;
    element.classList.add('visible');
    toastTimer = setTimeout(() => element.classList.remove('visible'), 3200);
  }

  /** 隐藏层提前挂载已解码图片；切换时仅合成透明度，旧图保持不透明以避免闪黑。 */
  class BackgroundController {
    constructor() {
      this.layers = [$('#slide-a'), $('#slide-b')];
      this.images = new Map();
      this.failed = new Set();
      this.current = -1;
      this.activeLayer = 1;
      this.paused = false;
      this.motion = true;
      this.busy = false;
      this.timer = null;
      this.pendingManual = null;
      this.prepared = null;
      this.prepareTask = null;
      this.generation = 0;
      this.fadeAnimation = null;
      this.zoomAnimations = new Map();
      this.retryTimer = null;
      this.retryCount = 0;
    }

    get suspended() { return this.paused || document.hidden || dialog.open; }

    /** 失败保留冷却时间并允许一次自动重试；JPEG 兜底同样使用适合展示的尺寸。 */
    load(index) {
      const cached = this.images.get(index);
      if (cached && (!cached.failed || Date.now() < cached.retryAt)) return cached.promise;
      const entry = { failed: false, retryAt: 0, attempts: (cached?.attempts || 0) + 1 };
      entry.promise = (async () => {
        for (const source of scenes[index].sources) {
          const image = await this.tryLoad(source, index === 0);
          if (image) {
            this.failed.delete(index);
            return image;
          }
        }
        entry.failed = true;
        entry.retryAt = entry.attempts < 2 ? Date.now() + 15000 : Infinity;
        this.failed.add(index);
        this.syncSettings();
        return null;
      })();
      this.images.set(index, entry);
      return entry.promise;
    }

    /** 下载和解码都完成后才交付图片，保留 Image 对象并直接挂载，避免切图时再次更换背景纹理。 */
    tryLoad(source, priority = false) {
      return new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.fetchPriority = priority ? 'high' : 'low';
        image.alt = '';
        image.className = 'background-image';
        let settled = false;
        const settle = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          image.onload = null;
          image.onerror = null;
          if (!ok) image.removeAttribute('src');
          resolve(ok ? image : null);
        };
        // 延续现有 12 秒容错，避免 GitHub Pages 冷节点被过早判为失效。
        const timeout = setTimeout(() => settle(false), 12000);
        image.onload = async () => {
          try {
            if (typeof image.decode === 'function') await image.decode();
            settle(image.naturalWidth > 0);
          } catch { settle(false); }
        };
        image.onerror = () => settle(false);
        image.src = source;
      });
    }

    /** 首图优先；首图慢时只额外竞争一张备选图，避免所有素材抢占首屏带宽。 */
    async start() {
      let fallbackTimer;
      const primary = this.load(0).then(image => image ? 0 : -1);
      const fallback = new Promise(resolve => {
        fallbackTimer = setTimeout(() => this.load(1).then(image => resolve(image ? 1 : -1)), 1400);
      });
      const first = await Promise.race([primary, fallback]);
      if (first === 0) clearTimeout(fallbackTimer);
      await this.show(first >= 0 ? first : 0, true);
    }

    /** 缩放与淡入分别作用于图片和外层；暂停只冻结时间，不取消动画，避免画面缩回原大小。 */
    animateZoom(layer) {
      this.zoomAnimations.get(layer)?.cancel();
      this.zoomAnimations.delete(layer);
      const image = layer.querySelector('img');
      if (image && typeof image.animate === 'function') {
        const animation = image.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }],
          { duration: INTERVAL + FADE, easing: 'linear', fill: 'forwards' }
        );
        this.zoomAnimations.set(layer, animation);
        if (this.suspended || !this.motion || reducedMotion.matches) animation.pause();
      }
    }

    schedule(delay = INTERVAL) {
      clearTimeout(this.timer);
      if (!this.suspended && !this.busy && this.current >= 0) {
        this.timer = setTimeout(() => this.show((this.current + 1) % scenes.length), delay);
      }
    }

    /** 至少经过两个绘制帧，让隐藏层完成布局；后台 rAF 可能暂停，超时兜底避免锁住状态。 */
    painted() {
      return new Promise(resolve => {
        const timeout = setTimeout(resolve, 120);
        requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timeout); resolve(); }));
      });
    }

    mount(layerIndex, index, image) {
      const layer = this.layers[layerIndex];
      this.zoomAnimations.get(layer)?.cancel();
      this.zoomAnimations.delete(layer);
      layer.style.opacity = '0';
      layer.style.zIndex = '1';
      image.style.objectPosition = scenes[index].focus;
      image.style.transformOrigin = scenes[index].focus;
      layer.replaceChildren(image);
      layer.dataset.scene = String(index);
    }

    /** 当前图展示期间仅准备下一张，避免扩充素材后同时保留大量已解码图片。 */
    prepareNext() {
      const generation = this.generation;
      this.prepareTask = (async () => {
        for (let step = 1; step < scenes.length; step++) {
          const index = (this.current + step) % scenes.length;
          const image = await this.load(index);
          if (generation !== this.generation || this.busy) return;
          if (!image) continue;
          const layerIndex = 1 - this.activeLayer;
          this.mount(layerIndex, index, image);
          await this.painted();
          if (generation === this.generation) this.prepared = { index, layerIndex };
          return;
        }
      })();
    }

    /** 新图在旧图上以线性透明度淡入；跟随真实动画完成，后台与暂停状态可安全冻结。 */
    async fadeIn(layer, duration) {
      if (!duration || typeof layer.animate !== 'function') {
        layer.style.opacity = '1';
        return;
      }
      const animation = layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'linear', fill: 'forwards' });
      this.fadeAnimation = animation;
      if (document.hidden) animation.pause();
      // 正常以 finished 为准；超时只为异常浏览器兜底，后台不计入强制完成。
      const fallback = setTimeout(() => { if (!document.hidden) animation.finish(); }, duration + 500);
      try { await animation.finished; } catch { /* 取消动画时仍保留新图，不清空当前画面。 */ }
      clearTimeout(fallback);
      layer.style.opacity = '1';
      animation.cancel();
      this.fadeAnimation = null;
    }

    async show(requested, manual = false) {
      if (this.busy) {
        if (manual) this.pendingManual = requested;
        return;
      }
      if (!manual && this.suspended) return;
      clearTimeout(this.timer);
      clearTimeout(this.retryTimer);
      this.busy = true;
      if (manual && this.failed.has(requested)) this.images.delete(requested);
      const generation = ++this.generation;
      let next = requested;
      let image = null;
      for (let attempt = 0; attempt < scenes.length; attempt++) {
        // 提前准备好的下一张优先使用；失败时继续保留旧图并寻找其他可用图。
        image = await this.load(next);
        if (image) break;
        next = (next + 1) % scenes.length;
      }
      if (!image) {
        this.busy = false;
        $('#scene-index').textContent = `— / ${String(scenes.length).padStart(2, '0')}`;
        $('#scene-name').textContent = '雷奥奈达';
        if (this.retryCount === 0) toast('背景暂未加载，页面按钮仍可使用。');
        if (this.retryCount++ < 1) this.retryTimer = setTimeout(() => this.show(0, true), 15000);
        this.syncSettings();
        return;
      }
      // 等待下载期间用户可能打开了弹窗或切到后台，不在这时启动自动切换。
      if (!manual && this.suspended) { this.busy = false; return; }
      if (next === this.current) {
        this.busy = false;
        this.schedule();
        this.prepareNext();
        this.runPending();
        return;
      }
      const first = this.current < 0;
      const layerIndex = 1 - this.activeLayer;
      const layer = this.layers[layerIndex];
      const previous = this.layers[this.activeLayer];
      if (this.prepared?.index !== next || this.prepared.layerIndex !== layerIndex) {
        this.mount(layerIndex, next, image);
        await this.painted();
      }
      this.prepared = null;
      layer.style.zIndex = '1';
      previous.style.zIndex = '0';
      this.animateZoom(layer);
      const started = performance.now();
      this.current = next;
      this.activeLayer = layerIndex;
      $('#scene-index').textContent = `${String(next + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
      $('#scene-name').textContent = scenes[next].name;
      this.syncSettings();
      if (manual && next !== requested) toast('该背景暂不可用，已切换到下一张。');
      // 弹窗下的手动选图直接更新，避免遮罩模糊和切图动画同时运行。
      await this.fadeIn(layer, first || reducedMotion.matches || dialog.open ? 0 : FADE);
      previous.style.opacity = '0';
      this.zoomAnimations.get(previous)?.pause();
      this.busy = false;
      this.layers.forEach(item => { if (item !== layer) item.style.zIndex = '0'; });
      // 释放其他图的 Image 引用；浏览器仍可复用 HTTP 缓存，解码工作移到下一张准备阶段。
      for (const [index, entry] of this.images) {
        if (index !== next && !entry.failed) this.images.delete(index);
      }
      if (generation === this.generation) this.prepareNext();
      this.schedule(Math.max(0, INTERVAL - (performance.now() - started)));
      this.runPending();
    }

    runPending() {
      if (this.pendingManual === null) return;
      const index = this.pendingManual;
      this.pendingManual = null;
      this.show(index, true);
    }

    setPaused(paused) {
      this.paused = paused;
      this.handleVisibility();
      this.syncSettings();
    }

    setMotion(enabled) {
      this.motion = enabled;
      this.handleVisibility();
    }

    handleVisibility() {
      clearTimeout(this.timer);
      for (const animation of this.zoomAnimations.values()) {
        // 只剩一张可用图时缩放可能已结束；不暂停/重播结束的动画，避免再次打开弹窗后缩回起点。
        if (animation.playState === 'finished') continue;
        if (this.suspended || !this.motion || reducedMotion.matches) animation.pause();
        else animation.play();
      }
      if (this.fadeAnimation) {
        if (dialog.open || this.paused || reducedMotion.matches) this.fadeAnimation.finish();
        else if (document.hidden) this.fadeAnimation.pause();
        else this.fadeAnimation.play();
      }
      document.body.classList.toggle('background-paused', this.suspended);
      document.body.classList.toggle('motion-off', !this.motion || reducedMotion.matches);
      this.syncSettings();
      this.schedule();
    }

    syncSettings() {
      const autoplay = $('#autoplay-switch');
      const motion = $('#motion-switch');
      if (autoplay) autoplay.setAttribute('aria-checked', String(!this.paused));
      if (motion) {
        motion.setAttribute('aria-checked', String(this.motion && !reducedMotion.matches));
        motion.disabled = reducedMotion.matches;
      }
      document.querySelectorAll('.scene-thumb').forEach((button, index) => {
        button.setAttribute('aria-pressed', String(index === this.current));
        button.dataset.unavailable = String(this.failed.has(index));
        button.setAttribute('aria-label', `选择${scenes[index].name}${this.failed.has(index) ? '，暂不可用，可重试' : ''}`);
      });
    }
  }

  const background = new BackgroundController();

  /** 所有弹窗共用原生 dialog，保留键盘焦点、关闭后返回入口；换内容时取消旧登录任务。 */
  function openDialog(title, eyebrow, content, source = document.activeElement) {
    dialogGeneration++;
    clearTimeout(loginTimer);
    if (!dialog.open) opener = source;
    $('#modal-title').textContent = title;
    $('#modal-eyebrow').textContent = eyebrow;
    $('#modal-content').innerHTML = content;
    if (!dialog.open) dialog.showModal();
    background.handleVisibility();
    $('.modal-shell').scrollTop = 0;
    $('.modal-close').focus({ preventScroll: true });
  }

  const pages = {
    notice: () => {
      $('.notification-dot').hidden = true;
      openDialog('雷奥奈达来信', 'LEONIDA BULLETIN', `
      <span class="notice-tag">欢迎来到罪恶城</span>
      <p class="notice-date">CONCEPT EDITION · VOL. 01</p>
      <p>棕榈树、海风、永不熄灭的霓虹。<br>这里的每一个日落，都像一个新故事的开场。</p>
      <p>七幅官方美术，串起雷奥奈达的不同瞬间。你可以在设置中选择背景，或暂停画面，看一会儿风景。</p>
      <p>这是一个非官方概念界面，好友入口仅播放本地演示，不会打开真实游戏或授权页面。</p>
      <button class="modal-action" data-close>回到日落之中 <span>↗</span></button>`);
    },
    settings: () => {
      openDialog('让风景随你而动', 'DISPLAY SETTINGS', `
        <div class="setting-row"><div><strong>自动切换背景</strong><small>每 6 秒切换；关闭后同时暂停镜头</small></div><button id="autoplay-switch" class="switch" role="switch" aria-label="自动切换背景" aria-checked="true"></button></div>
        <div class="setting-row"><div><strong>镜头缓慢移动</strong><small>${reducedMotion.matches ? '系统已启用减少动态效果' : '为静止的画面，添一点呼吸感'}</small></div><button id="motion-switch" class="switch" role="switch" aria-label="镜头缓慢移动" aria-checked="true"></button></div>
        <div class="setting-scenes" aria-label="选择背景">${scenes.map((scene, index) => `<button class="scene-thumb" data-scene="${index}" aria-label="选择${scene.name}" aria-pressed="false"><img src="${scene.thumbnail}" alt="" width="320" height="180" decoding="async"><span>${scene.name}</span></button>`).join('')}</div>`);
      $('#autoplay-switch').addEventListener('click', () => background.setPaused(!background.paused));
      $('#motion-switch').addEventListener('click', () => background.setMotion(!background.motion));
      document.querySelectorAll('.scene-thumb img').forEach((image, index) => {
        // 独立 JPEG 缩略图异常时仅尝试一次展示用 JPEG，避免重复请求失效 WebP。
        image.addEventListener('error', () => { image.src = scenes[index].sources[1]; }, { once: true });
      });
      background.syncSettings();
    },
    about: () => openDialog('一场罪恶城的白日梦', 'ABOUT THIS CONCEPT', `
      <p>这是一个非官方的 GTA VI 概念登录页，仅供娱乐与界面观赏，不代表 Rockstar Games 官方产品，也不提供游戏运行功能。</p>
      <p>美术素材来自 GTA VI 官方素材库，权利属于其各自所有者。全部登录按钮仅为本地演示。</p>
      <p>页面中的“12+ 适龄提示”为参考界面的装饰，不代表 GTA VI 的实际分级或认证。</p>
      <p>CONCEPT EDITION · BUILD 0.3.0<br>献给每一个向往罪恶城日落的人。</p>`),
    terms: () => openDialog('用户协议', 'CONCEPT EXPERIENCE', `
      <p>本页面仅为非官方界面演示。点击任意登录按钮，仅会播放本地连接动画并展示欢迎弹窗，不会创建账号、登录第三方平台或进入真实游戏。</p>
      <p>你可以自由切换背景、调整动效并观赏页面。演示内容不构成真实游戏服务协议。</p>
      <button class="modal-action" data-close>我了解了</button>`),
    privacy: () => openDialog('隐私说明', 'YOUR PRIVACY', `
      <p>页面不要求输入账号或密码，不接入微信、QQ 等第三方授权，不采集登录信息，不使用统计追踪或 Cookie。</p>
      <p>背景图片和标志均保存在本地。所有设置仅在当前页面内存中保存，刷新后恢复默认。</p>
      <button class="modal-action" data-close>我了解了</button>`)
  };

  function simulateLogin(method, source) {
    if (dialog.open && document.querySelector('[data-connecting]')) return;
    openDialog('即刻，前往罪恶城', 'CONNECTING TO LEONIDA', `
      <div class="connection" data-connecting role="status"><span class="spinner" aria-hidden="true"></span><p>正在准备你的${method === '游客体验' ? '游客体验' : method.replace('登录', '') + '体验'}…</p></div>`, source);
    const generation = dialogGeneration;
    loginTimer = setTimeout(() => {
      // 用户已关闭弹窗时，旧回调不得重新弹出欢迎界面。
      if (!dialog.open || generation !== dialogGeneration) return;
      openDialog('欢迎来到罪恶城', 'THE WORLD IS YOURS', `
        <div class="welcome-mark" aria-hidden="true">VI</div>
        <p>海风已至，霓虹将亮。<br>你的故事，从这个日落开始。</p>
        <p class="notice-date">${method} · 本次为娱乐演示</p>
        <button class="modal-action" data-close>留在这里，看一会儿日落 <span>↗</span></button>`, source);
    }, 1000);
  }

  document.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-dialog]');
    const loginButton = event.target.closest('[data-login]');
    const sceneButton = event.target.closest('[data-scene]');
    if (pageButton) pages[pageButton.dataset.dialog]?.();
    if (loginButton) simulateLogin(loginButton.dataset.login, loginButton);
    if (sceneButton) background.show(Number(sceneButton.dataset.scene), true);
    if (event.target.closest('[data-close]')) dialog.close();
  });
  $('.modal-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    // 弹窗内容与背景画布一起旋转，通过 DOM 归属判断遮罩点击，不计算旋转后的坐标。
    if (!event.target.closest('.modal-frame')) dialog.close();
  });
  dialog.addEventListener('close', () => {
    clearTimeout(loginTimer);
    dialogGeneration++;
    opener?.focus({ preventScroll: true });
    background.handleVisibility();
  });

  $('#fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen && document.fullscreenEnabled) await document.documentElement.requestFullscreen();
      else toast('当前浏览器不支持全屏，已按可用区域显示。');
    } catch {
      toast('暂时无法进入全屏，仍可正常观赏页面。');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const full = Boolean(document.fullscreenElement);
    $('#fullscreen-button').setAttribute('aria-label', full ? '退出全屏' : '进入全屏');
    $('#fullscreen-button .utility-label').textContent = full ? '退出' : '全屏';
    scheduleViewportSync();
  });
  document.addEventListener('visibilitychange', () => background.handleVisibility());
  // 系统偏好仅约束当前效果，不覆盖用户主动关闭镜头运动的选择。
  reducedMotion.addEventListener('change', () => background.handleVisibility());
  window.addEventListener('online', () => {
    for (const index of background.failed) background.images.delete(index);
    background.failed.clear();
    background.retryCount = 0;
    background.show(background.current >= 0 ? background.current : 0, true);
  });
  background.handleVisibility();
  background.start();
})();
