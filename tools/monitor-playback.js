/* 仅在本地验收页采样三轮播放：检查旧图是否始终保底，以及七张图是否按顺序循环。 */
(() => {
  const output = document.createElement('output');
  output.id = 'playback-verification';
  output.hidden = true;
  document.body.append(output);
  const stats = { cycles: 0, samples: [], blankFrames: 0, frames: 0, maxFrameGapMs: 0, complete: false };
  let last = 0, lastScene = '', lastReport = 0;
  function sample(time) {
    if (document.hidden || document.querySelector('dialog').open) {
      last = 0;
      requestAnimationFrame(sample);
      return;
    }
    const layers = [...document.querySelectorAll('.background-slide')];
    const visible = layers.some(layer => {
      const image = layer.querySelector('img');
      return image?.complete && image.naturalWidth > 0 && Number(getComputedStyle(layer).opacity) >= .99;
    });
    if (visible || stats.samples.length) {
      stats.frames++;
      if (!visible) stats.blankFrames++;
      if (last) stats.maxFrameGapMs = Math.max(stats.maxFrameGapMs, Math.round((time - last) * 10) / 10);
      last = time;
      const scene = document.querySelector('#scene-index').textContent;
      if (scene !== lastScene) {
        stats.samples.push({ scene, timeMs: Math.round(time) });
        lastScene = scene;
        stats.cycles = Math.floor((stats.samples.length - 1) / 7);
      }
    }
    stats.complete = stats.cycles >= 3;
    if (stats.complete || time - lastReport > 1000) {
      output.textContent = JSON.stringify(stats);
      lastReport = time;
    }
    if (!stats.complete) requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
})();
