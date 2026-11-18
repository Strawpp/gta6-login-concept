/* GTA VI 概念页：背景控制与界面交互分离，后续可仅替换背景控制器接入视频。 */
(() => {
  'use strict';

  const scenes = [
    { name: '杰森与露西娅', file: 'assets/images/jason-lucia.jpg', focus: '50% 0%' },
    { name: '海岸假日', file: 'assets/images/beach.jpg', focus: '50% 0%' },
    { name: '屋顶之上', file: 'assets/images/rooftop.jpg', focus: '50% 0%' },
    { name: '罪恶城明信片', file: 'assets/images/vice-city.jpg', focus: '50% 50%' }
  ];
  const INTERVAL = 6000;
  const FADE = 1200;
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
    root.style.setProperty('--viewport-width', `${width}px`);
    root.style.setProperty('--viewport-height', `${height}px`);
    root.style.setProperty('--viewport-left', `${useVisualViewport ? viewport.offsetLeft : 0}px`);
    root.style.setProperty('--viewport-top', `${useVisualViewport ? viewport.offsetTop : 0}px`);
    root.style.setProperty('--stage-width', `${stageWidth}px`);
    root.style.setProperty('--stage-height', `${stageHeight}px`);
    root.style.setProperty('--stage-angle', rotated ? '90deg' : '0deg');
    root.dataset.rotated = String(rotated);
    root.dataset.compact = String(stageHeight <= 600);
    root.dataset.narrow = String(stageWidth <= 740);
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

  /** 双图层先加载再切换；失败图片只跳过，不让当前画面消失。 */
  class BackgroundController {
    constructor() {
      this.layers = [$('#slide-a'), $('#slide-b')];
      this.images = new Map();
      this.failed = new Set();
      this.current = -1;
      this.activeLayer = 1;
      this.paused = false;
      this.motion = !reducedMotion.matches;
      document.body.classList.toggle('motion-off', !this.motion);
      this.busy = false;
      this.timer = null;
      this.zoomAnimations = new Map();
      this.dots = scenes.map((scene, index) => {
        const button = document.createElement('button');
        button.className = 'scene-dot';
        button.type = 'button';
        button.setAttribute('aria-label', `切换背景：${scene.name}`);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => this.show(index, true));
        $('#scene-controls').append(button);
        return button;
      });
    }

    /** 超时也视为不可用，避免损坏或无法读取的素材阻塞整个页面。 */
    load(index) {
      if (this.images.has(index)) return this.images.get(index);
      const promise = new Promise((resolve) => {
        const image = new Image();
        let finished = false;
        const finish = (ok) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          image.onload = null;
          image.onerror = null;
          if (!ok) {
            this.failed.add(index);
            this.dots[index].disabled = true;
            this.dots[index].setAttribute('aria-label', `${scenes[index].name}：图片不可用`);
          }
          resolve(ok);
        };
        const timeout = setTimeout(() => finish(false), 12000);
        image.onload = () => finish(image.naturalWidth > 0);
        image.onerror = () => finish(false);
        image.src = scenes[index].file;
      });
      this.images.set(index, promise);
      return promise;
    }

    async start() {
      // 四张本地图片并行预加载，首图成功后即可呈现，无须等待全部图片。
      scenes.forEach((_, index) => this.load(index));
      await this.show(0);
    }

    animateZoom(layer) {
      this.zoomAnimations.get(layer)?.cancel();
      this.zoomAnimations.delete(layer);
      if (this.motion && !reducedMotion.matches && typeof layer.animate === 'function') {
        const animation = layer.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }],
          { duration: INTERVAL + FADE, easing: 'linear', fill: 'forwards' }
        );
        this.zoomAnimations.set(layer, animation);
        if (document.hidden || this.paused) animation.pause();
      }
    }

    schedule(delay = INTERVAL) {
      clearTimeout(this.timer);
      if (!this.paused && !document.hidden && this.current >= 0 && this.failed.size < scenes.length - 1) {
        this.timer = setTimeout(() => this.show((this.current + 1) % scenes.length), delay);
      }
    }

    async show(requested, manual = false) {
      if (this.busy) return;
      clearTimeout(this.timer);
      this.busy = true;
      let next = requested;
      let found = false;
      for (let attempt = 0; attempt < scenes.length; attempt++) {
        if (await this.load(next)) { found = true; break; }
        next = (next + 1) % scenes.length;
      }
      if (!found) {
        this.busy = false;
        $('#scene-index').textContent = '— / 04';
        $('#scene-name').textContent = '雷奥奈达';
        toast('背景图片暂不可用，仍可体验页面按钮。');
        this.syncSettings();
        return;
      }
      if (next === this.current) {
        this.busy = false;
        this.schedule();
        return;
      }
      const first = this.current < 0;
      const layerIndex = 1 - this.activeLayer;
      const layer = this.layers[layerIndex];
      const previous = this.layers[this.activeLayer];
      layer.style.backgroundImage = `url("${scenes[next].file}")`;
      layer.style.backgroundPosition = scenes[next].focus;
      layer.style.transformOrigin = scenes[next].focus;
      // 新图叠在不透明的旧图上淡入，防止交叉透明时露出底色造成闪黑。
      layer.style.transitionDuration = first || reducedMotion.matches ? '0ms' : `${FADE}ms`;
      previous.style.transitionDuration = '0ms';
      layer.style.zIndex = '1';
      previous.style.zIndex = '0';
      this.animateZoom(layer);
      layer.classList.add('is-active');
      this.current = next;
      this.activeLayer = layerIndex;
      this.dots.forEach((dot, index) => dot.setAttribute('aria-pressed', String(index === next)));
      $('#scene-index').textContent = `${String(next + 1).padStart(2, '0')} / 04`;
      $('#scene-name').textContent = scenes[next].name;
      this.syncSettings();
      if (manual && next !== requested) toast('该背景暂不可用，已切换到下一张。');
      setTimeout(() => {
        previous.classList.remove('is-active');
        this.busy = false;
        this.schedule(first || reducedMotion.matches ? INTERVAL : INTERVAL - FADE);
      }, first || reducedMotion.matches ? 0 : FADE);
    }

    setPaused(paused) {
      this.paused = paused;
      this.handleVisibility();
      this.syncSettings();
    }

    setMotion(enabled) {
      this.motion = enabled && !reducedMotion.matches;
      this.layers.forEach((layer) => this.animateZoom(layer));
      document.body.classList.toggle('motion-off', !this.motion);
      this.syncSettings();
    }

    handleVisibility() {
      clearTimeout(this.timer);
      for (const animation of this.zoomAnimations.values()) {
        if (document.hidden || this.paused) animation.pause();
        else animation.play();
      }
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
        button.disabled = this.failed.has(index);
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
    $('.modal-shell').scrollTop = 0;
    $('.modal-close').focus({ preventScroll: true });
  }

  const pages = {
    notice: () => openDialog('雷奥奈达来信', 'LEONIDA BULLETIN', `
      <span class="notice-tag">欢迎来到罪恶城</span>
      <p class="notice-date">CONCEPT EDITION · VOL. 01</p>
      <p>棕榈树、海风、永不熄灭的霓虹。<br>这里的每一个日落，都像一个新故事的开场。</p>
      <p>选一种方式，开启你的罪恶城之旅。也可以什么都不做，就在这里看一会儿风景。</p>
      <button class="modal-action" data-close>收到了，出发吧 <span>↗</span></button>`),
    settings: () => {
      openDialog('让风景随你而动', 'DISPLAY SETTINGS', `
        <div class="setting-row"><div><strong>自动切换背景</strong><small>每 6 秒，遇见另一面雷奥奈达</small></div><button id="autoplay-switch" class="switch" role="switch" aria-label="自动切换背景" aria-checked="true"></button></div>
        <div class="setting-row"><div><strong>镜头缓慢移动</strong><small>${reducedMotion.matches ? '系统已启用减少动态效果' : '为静止的画面，添一点呼吸感'}</small></div><button id="motion-switch" class="switch" role="switch" aria-label="镜头缓慢移动" aria-checked="true"></button></div>
        <div class="setting-scenes" aria-label="选择背景">${scenes.map((scene, index) => `<button class="scene-thumb" data-scene="${index}" aria-label="选择${scene.name}" aria-pressed="false"><img src="${scene.file}" alt="${scene.name}"></button>`).join('')}</div>`);
      $('#autoplay-switch').addEventListener('click', () => background.setPaused(!background.paused));
      $('#motion-switch').addEventListener('click', () => background.setMotion(!background.motion));
      background.syncSettings();
    },
    about: () => openDialog('一场罪恶城的白日梦', 'ABOUT THIS CONCEPT', `
      <p>这是一个非官方的 GTA VI 概念登录页，仅供娱乐与界面观赏，不代表 Rockstar Games 官方产品，也不提供游戏运行功能。</p>
      <p>美术素材来自 GTA VI 官方素材库，权利属于其各自所有者。全部登录按钮仅为本地演示。</p>
      <p>CONCEPT EDITION · BUILD 0.2.0<br>献给每一个向往罪恶城日落的人。</p>`),
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
    if (!event.target.closest('.modal-shell')) dialog.close();
  });
  dialog.addEventListener('close', () => {
    clearTimeout(loginTimer);
    dialogGeneration++;
    opener?.focus({ preventScroll: true });
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
  reducedMotion.addEventListener('change', () => background.setMotion(!reducedMotion.matches));
  background.start();
})();
