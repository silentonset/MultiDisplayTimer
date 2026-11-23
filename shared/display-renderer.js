// Shared between Controller's Preview and Display 1 so rendering is 1:1 identical
window.DisplayRenderer = (() => {
  function formatMs(ms) {
    const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function ensureSurface(container) {
    let surface = container.querySelector('.display-surface');
    if (!surface) {
      container.innerHTML = `
        <div class="display-surface" style="
          width: 100%;
          height: 100%;
          container-type: inline-size;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4%;
          text-align: center;
          user-select: none;
          overflow: hidden;
          font-family: system-ui, -apple-system, sans-serif;
        ">
          <div class="display-title" style="
            font-size: 5cqw;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 2cqw;
            opacity: 0.85;
            min-height: 1em;
          "></div>
          <div class="display-time" style="
            font-size: 18cqw;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            line-height: 1;
            letter-spacing: 0.02em;
          ">00:00:00</div>
        </div>
      `;
      surface = container.querySelector('.display-surface');
    }
    return surface;
  }

  function render(container, clockState, theme) {
    const surface = ensureSurface(container);
    const titleEl = surface.querySelector('.display-title');
    const timeEl = surface.querySelector('.display-time');

    const remainingMs = clockState.isRunning
      ? Math.max(0, clockState.targetEndTime - Date.now())
      : clockState.remainingMs;

    const isExpired = clockState.hasStarted && remainingMs === 0;
    const formatted = formatMs(remainingMs);

    surface.style.backgroundColor = theme.bgColor || '#000000';
    titleEl.textContent = theme.titleText || '';
    titleEl.style.display = theme.titleText ? 'block' : 'none';
    titleEl.style.color = theme.textColor || '#ffffff';

    timeEl.textContent = formatted;
    timeEl.style.color = isExpired ? '#ef4444' : (theme.textColor || '#ffffff');
    timeEl.style.opacity = isExpired && Math.floor(Date.now() / 500) % 2 === 1 ? '0.4' : '1';

    return { formatted, remainingMs, isExpired };
  }

  return { formatMs, render };
})();