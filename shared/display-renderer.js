// Shared between Controller's Preview and Display 1 so rendering is 1:1 identical
window.DisplayRenderer = (() => {
  const formatterCache = new Map();

  const DEFAULT_APPEARANCE = {
    fontFamily: "'Tahoma', sans-serif",
    fontSizeMode: 'auto', // 'auto' | 'custom'
    fontSizePx: 180,
    clockPosition: 'center', // 'center' | 'top' | 'bottom'
    textColor: '#ffffff',
    showMinutesSecondsOnly: false,
    showClockLabel: false,
    labelFontSizeMode: 'auto', // 'auto' | 'custom'
    labelFontSizePx: 64,
    labelPosition: 'above-center', // 'above-center' | 'below-center' | 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
    bgType: 'solid', // 'solid' | 'gradient' | 'image' | 'video'
    bgColor: '#000000',
    bgGradientStart: '#0f172a',
    bgGradientEnd: '#1d4ed8',
    bgGradientDir: '135deg',
    bgImageUrl: '',
    bgImageName: '',
    bgVideoUrl: '',
    bgVideoName: '',
    bgMediaFit: 'cover', // 'cover' | 'contain'
    alertStyle: 'border', // 'border' | 'topbar' | 'fullbg'
    alertBorderMode: 'off', // 'off' | 'always' | 'warning' | 'final' | 'expired'
    alertBorderWidth: 24, // Border thickness or Top Edge Bar height (0-500px)
    alertBorderColor: '#ef4444'
  };

  const DEFAULT_BEHAVIOR = {
    clockTimeFormat: '24h', // '24h' | '12h'
    zeroBehavior: 'blink', // 'blink' | 'solid' | 'countup'
    zeroColor: '#ef4444',
    trafficLightEnabled: false,
    warn1Color: '#f59e0b',
    warn1TimeMs: 2 * 60 * 1000,
    warn2Color: '#ef4444',
    warn2TimeMs: 30 * 1000,
    showEndText: false,
    endText: 'Your time is up',
    endTextFontSizeMode: 'auto', // 'auto' | 'custom'
    endTextFontSizePx: 72,
    resetHoldSec: 0.7 // 0 = Instant, default 0.7s
  };

  const DEFAULT_MESSAGE = {
    active: false, // Send Message toggle (off by default)
    flash: false, // Flash Message toggle
    text: '',
    behavior: 'above', // 'above' | 'below' | 'replace' | 'ticker'
    fontSizeMode: 'auto', // 'auto' | 'custom'
    fontSizePx: 72,
    position: 'center', // 'left' | 'center' | 'right'
    textColor: '#ffffff',
    tickerPositionMode: 'bottom', // 'top' | 'bottom' | 'above-timer' | 'below-timer' | 'offset-top'
    tickerYPercent: 86, // 0..100 used when tickerPositionMode === 'offset-top'
    tickerFontSizePx: 52,
    tickerScrollSpeed: 60, // 1..240 px/s (defaults to PC refresh rate)
    tickerTextColor: '#ffffff',
    tickerBgColor: '#1e293b',
    tickerStartedAt: 0
  };

  const WARNING_RANK = { normal: 0, warn1: 1, warn2: 2, expired: 3 };

  function clampSpeed(speed) {
    const n = Number(speed);
    if (!Number.isFinite(n)) return 1;
    return Math.min(1.3, Math.max(1, Math.round(n * 100) / 100));
  }

  function clampTickerSpeed(pxPerSec) {
    const n = Math.round(Number(pxPerSec));
    if (!Number.isFinite(n)) return 60;
    return Math.min(240, Math.max(1, n));
  }

  function invertHexColor(hex) {
    const clean = String(hex || '#000000').trim().replace(/^#/, '');
    let r = 0, g = 0, b = 0;
    if (clean.length === 3) {
      r = parseInt(clean[0] + clean[0], 16);
      g = parseInt(clean[1] + clean[1], 16);
      b = parseInt(clean[2] + clean[2], 16);
    } else if (clean.length >= 6) {
      r = parseInt(clean.slice(0, 2), 16);
      g = parseInt(clean.slice(2, 4), 16);
      b = parseInt(clean.slice(4, 6), 16);
    }
    if ([r, g, b].some((v) => Number.isNaN(v))) return '#ffffff';
    const inv = [255 - r, 255 - g, 255 - b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
    return `#${inv}`;
  }

  function formatMs(ms, minsSecsOnly = false) {
    const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
    if (minsSecsOnly) {
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function formatElapsedMs(ms, minsSecsOnly = false, showMs = false) {
    const clamped = Math.max(0, Number(ms) || 0);
    const totalSeconds = Math.floor(clamped / 1000);
    const msSuffix = showMs ? `.${String(Math.floor(clamped % 1000)).padStart(3, '0')}` : '';
    if (minsSecsOnly) {
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${msSuffix}`;
    }
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${[h, m, s].map((v) => String(v).padStart(2, '0')).join(':')}${msSuffix}`;
  }

  function getClockFormatter(timeZone, use12Hour) {
    const tzKey = !timeZone || timeZone === 'local' ? '__local__' : timeZone;
    const key = `${tzKey}|${use12Hour ? '12' : '24'}`;
    if (!formatterCache.has(key)) {
      const opts = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: Boolean(use12Hour)
      };
      if (tzKey !== '__local__') {
        opts.timeZone = tzKey;
      }
      try {
        formatterCache.set(key, new Intl.DateTimeFormat('en-GB', opts));
      } catch (_err) {
        delete opts.timeZone;
        formatterCache.set(key, new Intl.DateTimeFormat('en-GB', opts));
      }
    }
    return formatterCache.get(key);
  }

  function getGmtOffsetLabel(timeZone, date = new Date()) {
    try {
      const opts = { timeZoneName: 'shortOffset' };
      if (timeZone && timeZone !== 'local') {
        opts.timeZone = timeZone;
      }
      const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(date);
      const tzPart = parts.find((p) => p.type === 'timeZoneName');
      if (tzPart && tzPart.value) {
        if (tzPart.value === 'GMT' || tzPart.value === 'UTC') return 'GMT+00:00';
        const match = tzPart.value.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
        if (match) {
          const sign = match[1];
          const hh = match[2].padStart(2, '0');
          const mm = (match[3] || '00').padStart(2, '0');
          return `GMT${sign}${hh}:${mm}`;
        }
        return tzPart.value;
      }
    } catch (_err) {
      // Fallback below
    }
    const offsetMin = -date.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const abs = Math.abs(offsetMin);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `GMT${sign}${hh}:${mm}`;
  }

  function formatWallClock(timestampMs, timeZone = 'local', use12Hour = false) {
    const formatter = getClockFormatter(timeZone, use12Hour);
    return formatter.format(new Date(timestampMs)).toUpperCase();
  }

  function computeState(clockState, now = Date.now(), behaviorIn = null, appearanceIn = null) {
    if (!clockState) {
      return {
        mode: 'countdown',
        speed: 1,
        formatted: '--:--:--',
        subText: '',
        isExpired: false,
        isOvertime: false,
        warningLevel: 'normal',
        intervalFlash: false,
        remainingMs: 0,
        rawRemainingMs: 0,
        overtimeMs: 0,
        elapsedMs: 0
      };
    }

    const mode = clockState.mode || 'countdown';
    const behavior = behaviorIn ? { ...DEFAULT_BEHAVIOR, ...behaviorIn } : DEFAULT_BEHAVIOR;
    const minsSecsOnly = Boolean(appearanceIn && appearanceIn.showMinutesSecondsOnly);
    const speed = clampSpeed(clockState.speed);

    if (mode === 'clock') {
      const tz = clockState.timeZone || 'local';
      const use12Hour = behavior.clockTimeFormat === '12h';
      const formatted = formatWallClock(now, tz, use12Hour);
      const gmt = getGmtOffsetLabel(tz, new Date(now));
      const label = clockState.timeZoneLabel || (tz === 'local' ? 'Local Time' : tz);
      const subText = clockState.showZoneOnDisplay === false ? '' : `${label} · ${gmt}`;
      return {
        mode,
        speed: 1,
        formatted,
        subText,
        gmt,
        isExpired: false,
        isOvertime: false,
        warningLevel: 'normal',
        intervalFlash: false,
        remainingMs: 0,
        rawRemainingMs: 0,
        overtimeMs: 0,
        elapsedMs: 0
      };
    }

    if (mode === 'stopwatch') {
      const baseElapsed = Math.max(0, Number(clockState.elapsedMs) || 0);
      const elapsedMs = clockState.isRunning
        ? baseElapsed + Math.max(0, now - (clockState.startedAt || now)) * speed
        : baseElapsed;

      const intervalEnabled = Boolean(clockState.intervalEnabled) && (Number(clockState.intervalMs) || 0) > 0;
      const intervalMs = Math.max(0, Number(clockState.intervalMs) || 0);

      let subText = '';
      let intervalIndex = 1;
      let intervalElapsedMs = 0;
      let intervalRemainingMs = 0;
      let intervalFlash = false;

      const showMs = Boolean(clockState.showMilliseconds);
      if (intervalEnabled) {
        intervalIndex = Math.floor(elapsedMs / intervalMs) + 1;
        intervalElapsedMs = elapsedMs % intervalMs;
        intervalRemainingMs = intervalMs - intervalElapsedMs;
        intervalFlash = clockState.isRunning && elapsedMs >= intervalMs && intervalElapsedMs < 2000;
        if (clockState.showIntervalOnDisplay !== false) {
          subText = `INTERVAL ${intervalIndex}  ·  ${formatElapsedMs(intervalElapsedMs, minsSecsOnly, showMs)} / ${formatElapsedMs(intervalMs, minsSecsOnly, false)}`;
        }
      }

      return {
        mode,
        speed,
        formatted: formatElapsedMs(elapsedMs, minsSecsOnly, showMs),
        subText,
        isExpired: false,
        isOvertime: false,
        warningLevel: intervalFlash ? 'warn1' : 'normal',
        intervalFlash,
        elapsedMs,
        remainingMs: intervalEnabled ? intervalRemainingMs : 0,
        rawRemainingMs: intervalEnabled ? intervalRemainingMs : 0,
        overtimeMs: 0,
        intervalIndex,
        intervalElapsedMs,
        intervalRemainingMs
      };
    }

    // Countdown mode
    let rawRemainingMs;
    if (clockState.isRunning) {
      if (typeof clockState.anchorTime === 'number' && typeof clockState.anchorRemainingMs === 'number') {
        rawRemainingMs = clockState.anchorRemainingMs - (now - clockState.anchorTime) * speed;
      } else {
        rawRemainingMs = (clockState.targetEndTime || 0) - now;
      }
    } else {
      rawRemainingMs = Number(clockState.remainingMs) || 0;
    }

    const allowCountup = behavior.zeroBehavior === 'countup';
    const isExpired = Boolean(clockState.hasStarted) && rawRemainingMs <= 0;
    const overtimeMs = allowCountup && isExpired ? Math.max(0, -rawRemainingMs) : 0;
    const isOvertime = allowCountup && isExpired && overtimeMs >= 1000;
    const remainingMs = Math.max(0, rawRemainingMs);

    const formatted = isOvertime
      ? `-${formatElapsedMs(overtimeMs, minsSecsOnly)}`
      : formatMs(remainingMs, minsSecsOnly);

    let warningLevel = 'normal';
    if (isExpired) {
      warningLevel = 'expired';
    } else if (behavior.trafficLightEnabled && remainingMs > 0) {
      const w2 = Math.max(0, Number(behavior.warn2TimeMs) || 0);
      const w1 = Math.max(0, Number(behavior.warn1TimeMs) || 0);
      if (w2 > 0 && remainingMs <= w2) {
        warningLevel = 'warn2';
      } else if (w1 > 0 && remainingMs <= w1) {
        warningLevel = 'warn1';
      }
    }

    return {
      mode: 'countdown',
      speed,
      formatted,
      subText: '',
      isExpired,
      isOvertime,
      warningLevel,
      intervalFlash: false,
      remainingMs,
      rawRemainingMs,
      overtimeMs,
      elapsedMs: 0
    };
  }

  function ensureSurface(container) {
    let surface = container.querySelector('.display-surface');
    if (!surface) {
      container.innerHTML = `
        <div class="display-surface" style="
          position: relative;
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
          font-family: 'Tahoma', sans-serif;
          background: #000000;
        ">
          <img class="display-bg-image" alt="" style="
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: none;
            z-index: 0;
            pointer-events: none;
          " />
          <video class="display-bg-video" autoplay muted loop playsinline style="
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: none;
            z-index: 0;
            pointer-events: none;
          "></video>
          <div class="display-alert-bg" style="
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 1;
            display: none;
          "></div>
          <div class="display-alert-border" style="
            position: absolute;
            inset: 0;
            box-sizing: border-box;
            pointer-events: none;
            z-index: 4;
            display: none;
          "></div>
          <div class="display-alert-topbar" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            pointer-events: none;
            z-index: 4;
            display: none;
          "></div>
          <div class="display-pinned-label" style="
            position: absolute;
            z-index: 3;
            font-weight: 700;
            letter-spacing: 0.06em;
            line-height: 1.15;
            pointer-events: none;
            display: none;
            max-width: 92%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          "></div>
          <div class="display-content" style="
            position: relative;
            z-index: 2;
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          ">
            <!-- DUAL CLOCK TOP: OVERALL CLOCK SLOT -->
            <div class="display-overall-slot" style="
              display: none;
              width: 100%;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding-bottom: 2.2cqw;
              margin-bottom: 2.2cqw;
              border-bottom: 1px solid rgba(255, 255, 255, 0.22);
              order: 0;
            ">
              <div class="display-overall-label" style="
                font-size: 3.4cqw;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                opacity: 0.78;
                margin-bottom: 0.8cqw;
                display: none;
              "></div>
              <div class="display-overall-time" style="
                font-size: 11.5cqw;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                line-height: 1.05;
                letter-spacing: 0.02em;
                white-space: nowrap;
                transform-origin: center center;
              ">00:00:00</div>
              <div class="display-overall-sub" style="
                font-size: 2.4cqw;
                font-weight: 600;
                letter-spacing: 0.06em;
                margin-top: 0.8cqw;
                opacity: 0.78;
                display: none;
              "></div>
            </div>

            <div class="display-inline-label" style="
              font-weight: 700;
              letter-spacing: 0.06em;
              line-height: 1.15;
              opacity: 0.9;
              display: none;
            "></div>
            <div class="display-end-text" style="
              font-size: 5.5cqw;
              font-weight: 700;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              margin-bottom: 2.2cqw;
              line-height: 1.15;
              display: none;
            "></div>
            <div class="display-inline-ticker" style="
              width: 108%;
              overflow: hidden;
              white-space: nowrap;
              padding: 0.9cqw 0;
              display: none;
              pointer-events: none;
            ">
              <span class="display-inline-ticker-text" style="
                display: inline-block;
                font-weight: 700;
                line-height: 1.15;
                will-change: transform;
              "></span>
            </div>
            <div class="display-time" style="
              font-size: 18cqw;
              font-weight: 700;
              font-variant-numeric: tabular-nums;
              line-height: 1.05;
              letter-spacing: 0.02em;
              white-space: nowrap;
              transform-origin: center center;
            ">00:00:00</div>
            <div class="display-sub" style="
              font-size: 3.4cqw;
              font-weight: 600;
              letter-spacing: 0.06em;
              margin-top: 2.5cqw;
              padding: 0.6cqw 1.8cqw;
              border-radius: 999px;
              opacity: 0.85;
              font-variant-numeric: tabular-nums;
              display: none;
            "></div>
            <div class="display-message" style="
              width: 92%;
              font-weight: 700;
              line-height: 1.2;
              word-break: break-word;
              display: none;
            "></div>
          </div>
          <div class="display-ticker" style="
            position: absolute;
            left: 0;
            right: 0;
            z-index: 3;
            overflow: hidden;
            white-space: nowrap;
            padding: 0.9cqw 0;
            display: none;
            pointer-events: none;
          ">
            <span class="display-ticker-text" style="
              display: inline-block;
              font-weight: 700;
              line-height: 1.15;
              will-change: transform;
            "></span>
          </div>
        </div>
      `;
      surface = container.querySelector('.display-surface');
    }
    return surface;
  }

  function applyBackground(surface, bgImageEl, bgVideoEl, app) {
    const bgType = app.bgType || 'solid';
    const fit = app.bgMediaFit === 'contain' ? 'contain' : 'cover';

    if (bgType === 'gradient') {
      const start = app.bgGradientStart || '#0f172a';
      const end = app.bgGradientEnd || '#1d4ed8';
      const dir = app.bgGradientDir || '135deg';
      surface.style.backgroundColor = start;
      surface.style.backgroundImage = dir === 'radial'
        ? `radial-gradient(circle, ${start}, ${end})`
        : `linear-gradient(${dir}, ${start}, ${end})`;
    } else {
      surface.style.backgroundImage = 'none';
      surface.style.backgroundColor = app.bgColor || '#000000';
    }

    if (bgType === 'image' && app.bgImageUrl) {
      if (bgImageEl.dataset.src !== app.bgImageUrl) {
        bgImageEl.dataset.src = app.bgImageUrl;
        bgImageEl.src = app.bgImageUrl;
      }
      bgImageEl.style.objectFit = fit;
      bgImageEl.style.display = 'block';
    } else {
      bgImageEl.style.display = 'none';
    }

    if (bgType === 'video' && app.bgVideoUrl) {
      if (bgVideoEl.dataset.src !== app.bgVideoUrl) {
        bgVideoEl.dataset.src = app.bgVideoUrl;
        bgVideoEl.src = app.bgVideoUrl;
        bgVideoEl.muted = true;
        bgVideoEl.loop = true;
        bgVideoEl.play().catch(() => {});
      } else if (bgVideoEl.paused) {
        bgVideoEl.play().catch(() => {});
      }
      bgVideoEl.style.objectFit = fit;
      bgVideoEl.style.display = 'block';
    } else {
      if (bgVideoEl.style.display !== 'none') {
        bgVideoEl.pause();
        bgVideoEl.style.display = 'none';
      }
    }
  }

  function shouldShowAlert(alertMode, warningLevel) {
    if (alertMode === 'always') return true;
    if (alertMode === 'expired') return warningLevel === 'expired';
    if (alertMode === 'final') return warningLevel === 'warn2' || warningLevel === 'expired';
    if (alertMode === 'warning') {
      return warningLevel === 'warn1' || warningLevel === 'warn2' || warningLevel === 'expired';
    }
    return false;
  }

  function resolveClockColor(warningLevel, app, beh) {
    if (warningLevel === 'expired') return beh.zeroColor || '#ef4444';
    if (warningLevel === 'warn2') return beh.warn2Color || '#ef4444';
    if (warningLevel === 'warn1') return beh.warn1Color || '#f59e0b';
    return app.textColor || '#ffffff';
  }

  function applyAntiCropScale(el, availableWidth) {
    el.style.transform = 'none';
    const naturalWidth = el.scrollWidth;
    if (naturalWidth > availableWidth && naturalWidth > 0) {
      const fitScale = Math.max(0.1, availableWidth / naturalWidth);
      el.style.transform = `scale(${fitScale.toFixed(4)})`;
    }
  }

  function applyLabelLayout(inlineLabelEl, pinnedLabelEl, labelText, showLabel, app, activeColor, pixelScale, hideForReplace, dualClockActive) {
    if (!showLabel || !labelText || hideForReplace) {
      inlineLabelEl.style.display = 'none';
      pinnedLabelEl.style.display = 'none';
      return;
    }

    const fontSizeCss = app.labelFontSizeMode === 'custom'
      ? `${Math.min(240, Math.max(12, Number(app.labelFontSizePx) || 64)) * pixelScale}px`
      : (dualClockActive ? '3.6cqw' : '5.2cqw');

    const pos = app.labelPosition || 'above-center';
    if (pos === 'above-center' || pos === 'below-center') {
      pinnedLabelEl.style.display = 'none';
      inlineLabelEl.style.display = 'block';
      inlineLabelEl.textContent = labelText;
      inlineLabelEl.style.color = activeColor;
      inlineLabelEl.style.fontSize = fontSizeCss;
      inlineLabelEl.style.order = pos === 'below-center' ? '7' : '1';
      inlineLabelEl.style.marginTop = pos === 'below-center' ? '1.6cqw' : '0';
      inlineLabelEl.style.marginBottom = pos === 'below-center' ? '0' : '1.4cqw';
    } else {
      inlineLabelEl.style.display = 'none';
      pinnedLabelEl.style.display = 'block';
      pinnedLabelEl.textContent = labelText;
      pinnedLabelEl.style.color = activeColor;
      pinnedLabelEl.style.fontSize = fontSizeCss;

      pinnedLabelEl.style.top = 'auto';
      pinnedLabelEl.style.bottom = 'auto';
      pinnedLabelEl.style.left = 'auto';
      pinnedLabelEl.style.right = 'auto';
      pinnedLabelEl.style.transform = 'none';

      const isTop = pos.startsWith('top-');
      if (isTop) pinnedLabelEl.style.top = '4%';
      else pinnedLabelEl.style.bottom = '4%';

      if (pos.endsWith('-left')) {
        pinnedLabelEl.style.left = '4%';
      } else if (pos.endsWith('-right')) {
        pinnedLabelEl.style.right = '4%';
      } else {
        pinnedLabelEl.style.left = '50%';
        pinnedLabelEl.style.transform = 'translateX(-50%)';
      }
    }
  }

  function applyTickerStylingAndScroll(boxEl, textEl, msg, msgText, now, referenceWidth, pixelScale) {
    boxEl.style.backgroundColor = msg.tickerBgColor || '#1e293b';
    const tPx = Math.min(220, Math.max(14, Number(msg.tickerFontSizePx) || 52));
    textEl.style.fontSize = `${tPx * pixelScale}px`;
    if (textEl.textContent !== msgText) {
      textEl.textContent = msgText;
    }

    // Message / ticker text never flashes on manual flash trigger
    textEl.style.color = msg.tickerTextColor || '#ffffff';
    textEl.style.opacity = '1';

    const speedPxPerSec = clampTickerSpeed(msg.tickerScrollSpeed);
    const startedAt = Number(msg.tickerStartedAt) || now;
    const elapsedSec = Math.max(0, (now - startedAt) / 1000);
    const textWidthPx = textEl.offsetWidth || (msgText.length * tPx * pixelScale * 0.6);
    const textWidthRef = textWidthPx / Math.max(0.05, pixelScale);
    const totalTravelRef = referenceWidth + textWidthRef;
    const xRef = referenceWidth - ((elapsedSec * speedPxPerSec) % Math.max(1, totalTravelRef));
    textEl.style.transform = `translateX(${(xRef * pixelScale).toFixed(2)}px)`;
  }

  function render(container, clockState, appearanceIn, behaviorIn, options = {}) {
    const surface = ensureSurface(container);
    const bgImageEl = surface.querySelector('.display-bg-image');
    const bgVideoEl = surface.querySelector('.display-bg-video');
    const alertBgEl = surface.querySelector('.display-alert-bg');
    const borderEl = surface.querySelector('.display-alert-border');
    const topBarEl = surface.querySelector('.display-alert-topbar');
    const pinnedLabelEl = surface.querySelector('.display-pinned-label');
    const overallSlotEl = surface.querySelector('.display-overall-slot');
    const overallLabelEl = surface.querySelector('.display-overall-label');
    const overallTimeEl = surface.querySelector('.display-overall-time');
    const overallSubEl = surface.querySelector('.display-overall-sub');
    const inlineLabelEl = surface.querySelector('.display-inline-label');
    const endTextEl = surface.querySelector('.display-end-text');
    const inlineTickerEl = surface.querySelector('.display-inline-ticker');
    const inlineTickerTextEl = surface.querySelector('.display-inline-ticker-text');
    const timeEl = surface.querySelector('.display-time');
    const subEl = surface.querySelector('.display-sub');
    const messageEl = surface.querySelector('.display-message');
    const pinnedTickerEl = surface.querySelector('.display-ticker');
    const pinnedTickerTextEl = surface.querySelector('.display-ticker-text');

    const app = { ...DEFAULT_APPEARANCE, ...(appearanceIn || {}) };
    const beh = { ...DEFAULT_BEHAVIOR, ...(behaviorIn || {}) };
    const msg = { ...DEFAULT_MESSAGE, ...(options.message || {}) };

    const dualClockActive = Boolean(options.dualClockMode) && Boolean(options.overallClock);
    const now = Date.now();
    const state = computeState(clockState, now, beh, app);
    const overallState = dualClockActive ? computeState(options.overallClock, now, beh, app) : null;

    const containerWidth = container.clientWidth || 1920;
    const referenceWidth = Math.max(320, Number(options.referenceWidth) || containerWidth);
    const pixelScale = containerWidth / referenceWidth;

    const pulsePhase = Math.floor(now / 450) % 2 === 1;
    const blinkPhase = Math.floor(now / 500) % 2 === 1;

    // 1. Background
    applyBackground(surface, bgImageEl, bgVideoEl, app);

    // 2. Font family & Clock Vertical Position
    surface.style.fontFamily = app.fontFamily || DEFAULT_APPEARANCE.fontFamily;
    if (app.clockPosition === 'top') {
      surface.style.justifyContent = 'flex-start';
      surface.style.paddingTop = '7%';
      surface.style.paddingBottom = '4%';
    } else if (app.clockPosition === 'bottom') {
      surface.style.justifyContent = 'flex-end';
      surface.style.paddingTop = '4%';
      surface.style.paddingBottom = '7%';
    } else {
      surface.style.justifyContent = 'center';
      surface.style.paddingTop = '4%';
      surface.style.paddingBottom = '4%';
    }

    // 3. Message active & manual Visual Alert Flash states
    const msgText = String(msg.text || '').trim();
    const msgActive = Boolean(msg.active) && msgText.length > 0;
    const manualFlash = Boolean(msg.flash);
    const replaceTimer = msgActive && msg.behavior === 'replace';

    // 4. Visual Alert (uses highest severity warning between active session & overall clock;
    //    manual Flash button flashes ONLY the selected Visual Alert, never the text)
    const combinedWarning = (overallState && WARNING_RANK[overallState.warningLevel] > WARNING_RANK[state.warningLevel])
      ? overallState.warningLevel
      : state.warningLevel;
    const anyExpired = state.isExpired || Boolean(overallState && overallState.isExpired);

    const alertActive = shouldShowAlert(app.alertBorderMode, combinedWarning);
    const alertStyle = ['fullbg', 'topbar', 'border'].includes(app.alertStyle) ? app.alertStyle : 'border';
    const alertColor = app.alertBorderColor || '#ef4444';
    const alertShouldBlink = anyExpired && beh.zeroBehavior === 'blink';

    const showFullBg = (alertActive || manualFlash) && alertStyle === 'fullbg';
    const showTopBar = (alertActive || manualFlash) && alertStyle === 'topbar';
    const showBorder = (alertActive || manualFlash) && alertStyle === 'border';

    if (showFullBg) {
      borderEl.style.display = 'none';
      topBarEl.style.display = 'none';
      alertBgEl.style.display = 'block';
      alertBgEl.style.backgroundColor = alertColor;
      if (manualFlash) {
        alertBgEl.style.opacity = pulsePhase ? '0' : '1';
      } else {
        alertBgEl.style.opacity = alertShouldBlink && blinkPhase ? '0' : '1';
      }
    } else if (showTopBar) {
      alertBgEl.style.display = 'none';
      borderEl.style.display = 'none';
      const configuredPx = Math.min(500, Math.max(0, Number(app.alertBorderWidth) || 0));
      const rawBarPx = configuredPx > 0 ? configuredPx : (manualFlash ? 24 : 0);
      if (rawBarPx > 0) {
        const scaledBarPx = Math.max(1, rawBarPx * pixelScale);
        topBarEl.style.display = 'block';
        topBarEl.style.height = `${scaledBarPx}px`;
        topBarEl.style.backgroundColor = alertColor;
        if (manualFlash) {
          topBarEl.style.opacity = pulsePhase ? '0.15' : '1';
        } else {
          topBarEl.style.opacity = alertShouldBlink && blinkPhase ? '0.22' : '1';
        }
      } else {
        topBarEl.style.display = 'none';
      }
    } else if (showBorder) {
      alertBgEl.style.display = 'none';
      topBarEl.style.display = 'none';
      const configuredPx = Math.min(500, Math.max(0, Number(app.alertBorderWidth) || 0));
      const rawBorderPx = configuredPx > 0 ? configuredPx : (manualFlash ? 24 : 0);
      if (rawBorderPx > 0) {
        const scaledBorderPx = Math.max(1, rawBorderPx * pixelScale);
        borderEl.style.display = 'block';
        borderEl.style.border = `${scaledBorderPx}px solid ${alertColor}`;
        if (manualFlash) {
          borderEl.style.opacity = pulsePhase ? '0.15' : '1';
        } else {
          borderEl.style.opacity = alertShouldBlink && blinkPhase ? '0.22' : '1';
        }
      } else {
        borderEl.style.display = 'none';
      }
    } else {
      alertBgEl.style.display = 'none';
      borderEl.style.display = 'none';
      topBarEl.style.display = 'none';
    }

    const activeBorderPx = (borderEl.style.display !== 'none')
      ? (parseFloat(borderEl.style.borderLeftWidth) || 0)
      : 0;
    const availableWidth = Math.max(60, (surface.clientWidth || containerWidth) - activeBorderPx * 2 - 12);

    // 5. DUAL CLOCK TOP SLOT: OVERALL CLOCK
    if (dualClockActive && overallState && !replaceTimer) {
      overallSlotEl.style.display = 'flex';
      const ovColor = resolveClockColor(overallState.warningLevel, app, beh);
      const ovBlink = overallState.isExpired && beh.zeroBehavior === 'blink';

      const ovLabelText = (options.overallClock.label || '').trim();
      const showOvLabel = Boolean(options.overallClock.showLabel);
      if (showOvLabel && ovLabelText) {
        overallLabelEl.style.display = 'block';
        overallLabelEl.textContent = ovLabelText;
        overallLabelEl.style.color = app.textColor || '#ffffff';
      } else {
        overallLabelEl.style.display = 'none';
      }

      if (app.fontSizeMode === 'custom') {
        const px = Math.min(1600, Math.max(16, Number(app.fontSizePx) || 180));
        overallTimeEl.style.fontSize = `${px * 0.62 * pixelScale}px`;
      } else {
        const len = overallState.formatted.length;
        let cqw = 12;
        if (len <= 5) cqw = 16.5;
        else if (len <= 7) cqw = 14;
        else if (len <= 8) cqw = 12;
        else cqw = 10;
        overallTimeEl.style.fontSize = `${cqw}cqw`;
      }
      overallTimeEl.textContent = overallState.formatted;
      overallTimeEl.style.color = ovColor;
      overallTimeEl.style.opacity = ovBlink && blinkPhase ? '0.32' : '1';
      applyAntiCropScale(overallTimeEl, availableWidth);

      if (overallState.subText) {
        overallSubEl.style.display = 'block';
        overallSubEl.textContent = overallState.subText;
        overallSubEl.style.color = ovColor;
      } else {
        overallSubEl.style.display = 'none';
      }
    } else {
      overallSlotEl.style.display = 'none';
    }

    // 6. PRIMARY / ACTIVE SESSION CLOCK
    const activeColor = resolveClockColor(state.warningLevel, app, beh);
    if (app.fontSizeMode === 'custom') {
      const px = Math.min(1600, Math.max(16, Number(app.fontSizePx) || 180));
      const scaleFactor = dualClockActive ? 0.85 : 1;
      timeEl.style.fontSize = `${px * scaleFactor * pixelScale}px`;
    } else {
      const len = state.formatted.length;
      let cqw = dualClockActive ? 16 : 20;
      if (len <= 5) cqw = dualClockActive ? 23 : 30;
      else if (len === 6) cqw = dualClockActive ? 20 : 25;
      else if (len === 7) cqw = dualClockActive ? 17.5 : 21.5;
      else if (len === 8) cqw = dualClockActive ? 16 : 19.5;
      else if (len <= 10) cqw = dualClockActive ? 14 : 17;
      else cqw = dualClockActive ? 12 : 14.5;
      timeEl.style.fontSize = `${cqw}cqw`;
    }

    const labelText = (clockState && clockState.label ? String(clockState.label) : '').trim();
    const showLabel = typeof (clockState && clockState.showLabel) === 'boolean'
      ? clockState.showLabel
      : Boolean(app.showClockLabel);
    applyLabelLayout(inlineLabelEl, pinnedLabelEl, labelText, showLabel, app, app.textColor || '#ffffff', pixelScale, replaceTimer, dualClockActive);

    const shouldBlink = state.isExpired && beh.zeroBehavior === 'blink';
    timeEl.style.order = '4';
    timeEl.style.display = replaceTimer ? 'none' : 'block';
    timeEl.textContent = state.formatted;
    timeEl.style.color = activeColor;
    timeEl.style.opacity = shouldBlink && blinkPhase ? '0.32' : '1';
    if (!replaceTimer) {
      applyAntiCropScale(timeEl, availableWidth);
    }

    // 7. End-of-time text above active clock
    endTextEl.style.order = '2';
    if (!replaceTimer && beh.showEndText && state.isExpired && (beh.endText || '').trim()) {
      endTextEl.style.display = 'block';
      endTextEl.textContent = beh.endText;
      endTextEl.style.color = activeColor;
      endTextEl.style.fontSize = beh.endTextFontSizeMode === 'custom'
        ? `${Math.min(260, Math.max(12, Number(beh.endTextFontSizePx) || 72)) * pixelScale}px`
        : (dualClockActive ? '4.2cqw' : '5.5cqw');
      endTextEl.style.opacity = shouldBlink && blinkPhase ? '0.45' : '1';
    } else {
      endTextEl.style.display = 'none';
    }

    // 8. Sub-label (Stopwatch Interval / World Clock Timezone)
    subEl.style.order = '5';
    if (!replaceTimer && state.subText) {
      subEl.style.display = 'inline-block';
      subEl.textContent = state.subText;
      if (state.intervalFlash) {
        subEl.style.backgroundColor = '#f59e0b';
        subEl.style.color = '#0f172a';
        subEl.style.opacity = Math.floor(now / 250) % 2 === 0 ? '1' : '0.55';
      } else {
        subEl.style.backgroundColor = 'transparent';
        subEl.style.color = activeColor;
        subEl.style.opacity = '0.8';
      }
    } else {
      subEl.style.display = 'none';
    }

    // 9. Message & Ticker Tape (text never flashes on manual Flash trigger)
    if (msgActive && msg.behavior === 'ticker') {
      messageEl.style.display = 'none';
      const posMode = msg.tickerPositionMode || 'bottom';

      if (posMode === 'above-timer' || posMode === 'below-timer') {
        pinnedTickerEl.style.display = 'none';
        inlineTickerEl.style.display = 'block';
        inlineTickerEl.style.order = posMode === 'above-timer' ? '3' : '6';
        inlineTickerEl.style.marginTop = posMode === 'below-timer' ? '1.8cqw' : '0';
        inlineTickerEl.style.marginBottom = posMode === 'above-timer' ? '1.8cqw' : '0';
        applyTickerStylingAndScroll(
          inlineTickerEl, inlineTickerTextEl, msg, msgText, now,
          referenceWidth, pixelScale
        );
      } else {
        inlineTickerEl.style.display = 'none';
        pinnedTickerEl.style.display = 'block';
        pinnedTickerEl.style.top = 'auto';
        pinnedTickerEl.style.bottom = 'auto';
        pinnedTickerEl.style.transform = 'none';

        if (posMode === 'top') {
          pinnedTickerEl.style.top = '0';
        } else if (posMode === 'bottom') {
          pinnedTickerEl.style.bottom = '0';
        } else {
          // offset-top
          const yPct = Math.min(100, Math.max(0, Number(msg.tickerYPercent) || 0));
          pinnedTickerEl.style.top = `${yPct}%`;
          pinnedTickerEl.style.transform = `translateY(-${yPct}%)`;
        }

        applyTickerStylingAndScroll(
          pinnedTickerEl, pinnedTickerTextEl, msg, msgText, now,
          referenceWidth, pixelScale
        );
      }
    } else if (msgActive) {
      pinnedTickerEl.style.display = 'none';
      inlineTickerEl.style.display = 'none';
      messageEl.style.display = 'block';
      messageEl.textContent = msgText;

      const align = msg.position === 'left' || msg.position === 'right' ? msg.position : 'center';
      messageEl.style.textAlign = align;
      messageEl.style.fontSize = msg.fontSizeMode === 'custom'
        ? `${Math.min(260, Math.max(14, Number(msg.fontSizePx) || 72)) * pixelScale}px`
        : (replaceTimer ? '7.5cqw' : '5.2cqw');

      if (msg.behavior === 'above') {
        messageEl.style.order = '1';
        messageEl.style.marginTop = '0';
        messageEl.style.marginBottom = '2cqw';
      } else if (msg.behavior === 'below') {
        messageEl.style.order = '8';
        messageEl.style.marginTop = '2cqw';
        messageEl.style.marginBottom = '0';
      } else {
        messageEl.style.order = '4';
        messageEl.style.marginTop = '0';
        messageEl.style.marginBottom = '0';
      }

      messageEl.style.color = msg.textColor || '#ffffff';
      messageEl.style.opacity = '1';
    } else {
      messageEl.style.display = 'none';
      pinnedTickerEl.style.display = 'none';
      inlineTickerEl.style.display = 'none';
    }

    return state;
  }

  return {
    DEFAULT_APPEARANCE,
    DEFAULT_BEHAVIOR,
    DEFAULT_MESSAGE,
    clampSpeed,
    clampTickerSpeed,
    invertHexColor,
    formatMs,
    formatElapsedMs,
    formatWallClock,
    getGmtOffsetLabel,
    computeState,
    render
  };
})();
