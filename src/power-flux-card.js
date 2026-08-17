/*
 * HEIMDALL Flux Card
 * A power flow card adapted for dual-battery setups.
 *
 * Based on Power Flux Card (MIT License)
 *   Copyright (c) 2026 jayjojayson
 *   Upstream: https://github.com/jayjojayson/power-flux-card
 *
 * Fork modifications (MIT License)
 *   Copyright (c) 2026 Johannes (@JochenRi)
 *   Repository: https://github.com/JochenRi/heimdall-flux-card
 *
 * The upstream project provides the entire foundation of this card:
 * card architecture, SVG layout, bubble framework, pipe animation engine,
 * compact-view, visual editor, and DE/EN localization.
 *
 * Please support the original author:
 *   https://github.com/jayjojayson/power-flux-card  (star)
 *   https://www.paypal.me/quadFlyerFW                (donate)
 */

import { } from "./power-flux-card-editor.js";
import lang_en from "./lang-en.js";
import lang_de from "./lang-de.js";

console.log(
  "%c⚡ Power Flux Card v_2.4 ready",
  "background: #d19525ff; color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold;"
);

(function (lang_en, lang_de) {
  const cardTranslations = {
    "en": lang_en.card,
    "de": lang_de.card
  };

  const LitElement = customElements.get("ha-lit-element") || Object.getPrototypeOf(customElements.get("home-assistant-main"));
  const html = LitElement.prototype.html;
  const css = LitElement.prototype.css;

  class PowerFluxCard extends LitElement {
    static get properties() {
      return {
        hass: {},
        config: {},
        _cardWidth: { state: true },
        _rotationTick: { state: true },
        _panelLeftEls: { state: true },
        _panelRightEls: { state: true },
      };
    }

    _localize(key) {
      const lang = this.hass && this.hass.language ? this.hass.language : 'en';
      const dict = cardTranslations[lang] || cardTranslations['en'];
      return dict[key] || cardTranslations['en'][key] || key;
    }

    static async getConfigElement() {
      return document.createElement("power-flux-card-editor");
    }

    static getStubConfig() {
      return {
        zoom: 0.9,
        consumer_1_unit_kw: false,
        consumer_2_unit_kw: false,
        consumer_3_unit_kw: false,
        show_consumer_always: false,
        consumer_1_hide_pipe: false,
        consumer_1_pipe_threshold: 0,
        consumer_2_hide_pipe: false,
        consumer_2_pipe_threshold: 0,
        consumer_3_hide_pipe: false,
        consumer_3_pipe_threshold: 0,
        consumer_4_hide_pipe: false,
        consumer_4_pipe_threshold: 0,
        consumer_5_hide_pipe: false,
        consumer_5_pipe_threshold: 0,
        consumer_6_hide_pipe: false,
        consumer_6_pipe_threshold: 0,
        consumer_7_hide_pipe: false,
        consumer_7_pipe_threshold: 0,
        consumer_6_enabled: false,
        consumer_7_enabled: false,
        battery_enabled: true,
        venus_enabled: true,
        hide_solar_to_battery_pipe: false,
        hide_solar_to_venus_pipe: false,
        transparent_background: false,
        show_donut_border: false,
        show_neon_glow: true,
        show_comet_tail: false,
        show_dashed_line: false,
        show_tinted_background: false,
        hide_inactive_flows: true,
        show_flow_rate_solar: true,
        show_flow_rate_grid: true,
        show_flow_rate_battery: true,
        show_label_solar: false,
        show_label_grid: false,
        show_label_battery: false,
        show_label_house: false,
        use_colored_values: false,
        hide_consumer_icons: false,
        entities: {
          solar: "",
          grid: "",
          grid_export: "",
          grid_combined: "",
          battery: "",
          battery_soc: "",
          battery_charge: "",
          battery_discharge: "",
          venus: "",
          venus_soc: "",
          house: "",
          consumer_1: "",
          consumer_2: "",
          consumer_3: "",
          consumer_6: "",
          consumer_7: ""
        }
      };
    }

    _handleClick(entityId) {
      if (!entityId) return;
      const event = new Event("hass-more-info", {
        bubbles: true,
        composed: true,
      });
      event.detail = { entityId };
      this.dispatchEvent(event);
    }

    setConfig(config) {
      if (!config.entities) {
        // Init allow
      }

      // Migration (Phase 4.15): older editor versions wrote venus sensor keys
      // as top-level config.venus/venus_soc/venus_charge/venus_discharge/secondary_venus
      // instead of into config.entities. This idempotent migration moves them
      // into entities so the renderer (which only reads from config.entities) finds them.
      // Defensive policy: if both top-level and entities have a value, entities wins
      // and the top-level garbage is dropped.
      const migrationKeys = ['venus', 'venus_soc', 'venus_charge', 'venus_discharge', 'secondary_venus'];
      const hasMisplacedKey = migrationKeys.some(k => config[k] !== undefined);
      if (hasMisplacedKey) {
        const migrated = { ...config };
        migrated.entities = { ...(config.entities || {}) };
        for (const k of migrationKeys) {
          if (migrated[k] !== undefined) {
            if (migrated.entities[k] === undefined || migrated.entities[k] === '') {
              migrated.entities[k] = migrated[k];
            }
            delete migrated[k];
          }
        }
        config = migrated;
      }

      const prevInterval = this.config?.rotation_interval_sec;
      this.config = config;
      // Phase 5.19: if rotation interval changed, restart the shared timer.
      // Only restart if we already have a timer (i.e. firstUpdated has run).
      if (this._rotationTimer && prevInterval !== config.rotation_interval_sec) {
        this._startRotationTimer();
      }
      // Phase 5.67.2: when sparkline config changes (toggle on, period change,
      // entity change) trigger an immediate fetch so the user sees the
      // result without waiting up to 60s. If the timer is already running,
      // just refetch. If hass arrived during setConfig (rare but possible),
      // _ensureSparklineInit() will handle the first-time init from updated().
      if (this._sparklineTimer) {
        this._fetchAllSparklines();
      } else if (this.hass && !this._sparklineInitDone) {
        // Edge case: setConfig called after hass was set but before
        // updated() got a chance to run -- start the timer here too.
        this._ensureSparklineInit();
      }
    }

    firstUpdated() {
      // Phase A1.8: the ResizeObserver is only a TRIGGER. The width source is
      // this.offsetWidth, which was empirically stable (1564) across every
      // screenshot, whereas entry.contentRect.width intermittently reported 500
      // (the pre-layout sections-column width) during init -- and the A1.5
      // ">1px change" guard then froze that stale 500. Read offsetWidth on each
      // settled frame instead. rAF-debounce + 1px threshold still break the
      // measure->render->measure loop.
      const measure = () => {
        this._rafPending = false;
        const w = this.offsetWidth;
        if (w > 0 && Math.abs(w - (this._cardWidth || 0)) > 1) {
          this._cardWidth = w;
        }
      };
      this._resizeObserver = new ResizeObserver(() => {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(measure);
      });
      // Phase A1.4: observe the HOST (stable full width, never circular). In
      // side-panels mode the center column is given a FIXED px width derived
      // from this measurement, so the card scales into the center without any
      // measure->scale->grow feedback loop (the A1.3 mistake).
      this._resizeObserver.observe(this);
      // Seed the first measurement after initial layout settles.
      requestAnimationFrame(() => { this._cardWidth = this.offsetWidth || this._cardWidth; });
      
      // Phase 5.19: bubble value rotation -- a single shared timer ticks
      // forward; each rotating bubble uses (tick % activeSlots) to pick its
      // current slot. The interval is rebuilt on config change.
      this._rotationTick = 0;
      this._startRotationTimer();

      // Phase 5.67.2: sparkline initialisation moved to updated() so it
      // only kicks off after hass is reliably populated. firstUpdated()
      // can fire before hass arrives, which previously caused the first
      // fetch to be silently dropped (the guard `if (!this.hass) return;`
      // bailed out and the next attempt was 60s later). This is the same
      // race condition that mini-graph-card hit in HA 0.110+ -- see
      // kalkih/mini-graph-card#358. Their fix uses a `set hass()` setter
      // with a 1000ms setTimeout. We can't easily add a setter because
      // `hass` is a Lit reactive property in this card (changing that
      // would impact all 66 prior phases), so we use the equivalent Lit
      // lifecycle hook: `updated(changedProperties)`. See _ensureSparklineInit().
      this._sparklineData = {};
    }

    // Phase A2.2: config-driven side-panel embedding. Each slot is a LIST of
    // HA card configs (left_panel_cards / right_panel_cards), built via the
    // official window.loadCardHelpers() -> createCardElement() path (same as
    // stack-in-card) and stacked vertically. hass is forwarded to every child
    // on each update so they stay live. Empty/missing list -> empty slot.
    async _buildPanelCards() {
      if (this._panelCardsBuilt) return;
      this._panelCardsBuilt = true;
      try {
        const helpers = await window.loadCardHelpers();
        const buildList = (configs) => {
          if (!Array.isArray(configs)) return [];
          return configs.map((cardConfig) => {
            let el;
            try {
              el = helpers.createCardElement(cardConfig);
            } catch (e) {
              // createCardElement throws only on malformed input; fall back to
              // a warning element so one bad card never blanks the whole slot.
              el = helpers.createCardElement({ type: 'markdown', content: `⚠️ ${e && e.message ? e.message : 'card error'}` });
            }
            if (this.hass) el.hass = this.hass;
            // Honour ll-rebuild: a child may ask to be recreated (e.g. when its
            // own config becomes valid). Rebuild in place and re-render.
            el.addEventListener('ll-rebuild', () => {
              try {
                const rebuilt = helpers.createCardElement(cardConfig);
                if (this.hass) rebuilt.hass = this.hass;
                const arrL = this._panelLeftEls || [];
                const arrR = this._panelRightEls || [];
                const iL = arrL.indexOf(el);
                if (iL >= 0) { arrL[iL] = rebuilt; this._panelLeftEls = [...arrL]; }
                const iR = arrR.indexOf(el);
                if (iR >= 0) { arrR[iR] = rebuilt; this._panelRightEls = [...arrR]; }
              } catch (e) { /* leave the existing element in place */ }
            });
            return el;
          });
        };
        this._panelLeftEls = buildList(this.config.left_panel_cards);
        this._panelRightEls = buildList(this.config.right_panel_cards);
      } catch (e) {
        // loadCardHelpers failed -- leave slots empty rather than crashing.
        console.warn('heimdall-flux-card: panel card build failed', e);
      }
    }

    _ensureSparklineInit() {
      // Phase 5.67.2: idempotent initialiser. Called from updated() every
      // time hass changes; the latch flag _sparklineInitDone makes sure we
      // only set up the 60s interval and fire the first fetch once.
      if (this._sparklineInitDone) return;
      if (!this.hass) return; // updated() called with no hass yet
      this._sparklineInitDone = true;
      this._startSparklineTimer();
    }

    _startSparklineTimer() {
      if (this._sparklineTimer) {
        clearInterval(this._sparklineTimer);
        this._sparklineTimer = null;
      }
      this._fetchAllSparklines();
      this._sparklineTimer = setInterval(() => this._fetchAllSparklines(), 60000);
    }

    _fetchAllSparklines() {
      if (!this.hass || !this.config) return;
      // Phase 5.67.12: Pumpe (c7) added -- COMPLETES ALL 7 CONSUMER BUBBLES.
      // Roll-out order: 3, 1, 2, 4, 5, 6, 7. Each bubble is opt-in via its
      // own consumer_X_sparkline toggle so disabled bubbles cost nothing.
      for (const idx of [1, 2, 3, 4, 5, 6, 7]) {
        if (this.config[`consumer_${idx}_sparkline`] !== true) continue;
        // Phase 5.67.1: explicit per-sparkline entity override, falls back
        // to the bubble's main entity. Empty string counts as unset.
        const overrideEntity = this.config[`consumer_${idx}_sparkline_entity`];
        const fallbackEntity = this.config?.entities?.[`consumer_${idx}`];
        const entityId = (overrideEntity && overrideEntity !== '') ? overrideEntity : fallbackEntity;
        if (!entityId) continue;
        // Phase 5.67.2: test_mode synthesises a sine-wave time series
        // WITHOUT calling the HA history API. This isolates the render
        // pipeline from the fetch pipeline -- if the graph shows up in
        // test_mode but not in live mode, the bug is in fetching; if it
        // doesn't show even in test_mode, the bug is in rendering/CSS.
        if (this.config[`consumer_${idx}_sparkline_test_mode`] === true) {
          this._generateTestSparkline(entityId, idx);
          continue;
        }
        const period = this.config[`consumer_${idx}_sparkline_period`] || '24h';
        this._fetchSparklineHistory(entityId, period, idx);
      }

      // Phase 5.69: Source-bubble sparklines. Same fetch infrastructure as
      // consumers (reuses _fetchSparklineHistory and _generateTestSparkline)
      // but driven by source-prefix config keys instead of consumer_${idx}_*.
      // Storage key is the entity_id, so consumer and source sparklines
      // coexist without collisions.
      // Phase 5.71: Venus added alongside battery.
      // Phase 5.72: Solar added.
      // Phase 5.73: Grid added -- ALL 4 SOURCE BUBBLES now covered.
      // Phase 5.74: House added -- now ALL 11 visible bubbles have sparkline.
      // Phase BKW-8: bkw joins the source sparkline loop.
      for (const prefix of ['battery', 'venus', 'solar', 'grid', 'house', 'bkw']) {
        if (this.config[`${prefix}_sparkline`] !== true) continue;
        const overrideEntity = this.config[`${prefix}_sparkline_entity`];
        // Phase 5.73-fix: Grid is special -- its primary sensor is usually
        // entities.grid_combined (signed), with entities.grid as fallback.
        // Mirror the same precedence used by _handleClick and the bubble
        // render. Without this, users who only configured grid_combined
        // (the common case) get no fallback entity -> sparkline silently
        // skipped, even in test_mode (which still needs a storage-key entity).
        const fallbackEntity = (prefix === 'grid')
          ? (this.config?.entities?.grid_combined || this.config?.entities?.grid)
          : this.config?.entities?.[prefix];
        const entityId = (overrideEntity && overrideEntity !== '') ? overrideEntity : fallbackEntity;
        if (!entityId) continue;
        if (this.config[`${prefix}_sparkline_test_mode`] === true) {
          // Pass null idx so the consumer-specific debug check stays silent.
          this._generateTestSparkline(entityId, null);
          continue;
        }
        const period = this.config[`${prefix}_sparkline_period`] || '24h';
        this._fetchSparklineHistory(entityId, period, null);
      }

      // Phase 5.82a: temp-bubble sparklines (indoor/outdoor). Same fetch
      // infrastructure; storage key is the entity_id so no collisions.
      const tempSides = {
        indoor:  this.config?.entities?.temp_indoor  || 'sensor.haus_durchschnittstemperatur',
        outdoor: this.config?.entities?.temp_outdoor || 'sensor.sbht_003c_993b_temperature',
      };
      for (const side of ['indoor', 'outdoor']) {
        if (this.config[`temp_${side}_sparkline`] !== true) continue;
        const overrideEntity = this.config?.entities?.[`temp_${side}_sparkline_entity`] || this.config[`temp_${side}_sparkline_entity`];
        const entityId = (overrideEntity && overrideEntity !== '') ? overrideEntity : tempSides[side];
        if (!entityId) continue;
        const period = this.config[`temp_${side}_sparkline_period`] || '24h';
        this._fetchSparklineHistory(entityId, period, null);
      }
    }

    _generateTestSparkline(entityId, idx) {
      // Phase 5.67.2: deterministic synthetic data. 60 points spanning the
      // configured period, sine-wave between 100 and 900 W. This is purely
      // a diagnostic helper -- when the user enables test_mode they should
      // see a smooth sine curve immediately. If they do, the render path
      // works and any subsequent rendering failure in live mode is data-related.
      const hoursMap = { '1h': 1, '6h': 6, '12h': 12, '24h': 24 };
      const period = this.config[`consumer_${idx}_sparkline_period`] || '24h';
      const hours = hoursMap[period] || 24;
      const end = Date.now();
      const start = end - hours * 3600 * 1000;
      const N = 60;
      const series = [];
      for (let i = 0; i < N; i++) {
        const t = start + (i / (N - 1)) * (end - start);
        const phase = (i / N) * Math.PI * 4; // two full cycles
        const v = 500 + 400 * Math.sin(phase); // 100..900 W
        series.push({ t, v });
      }
      this._sparklineData[entityId] = series;
      this.requestUpdate();
    }

    async _fetchSparklineHistory(entityId, period, idx) {
      const hoursMap = { '1h': 1, '6h': 6, '12h': 12, '24h': 24 };
      const hours = hoursMap[period] || 24;
      const end = new Date();
      const start = new Date(end.getTime() - hours * 3600 * 1000);
      // Phase 5.67.1: debug toggle. Enable per-bubble via the editor to
      // dump fetch results to the browser console for troubleshooting.
      const debug = !!(idx && this.config?.[`consumer_${idx}_sparkline_debug`] === true);
      try {
        // Phase 5.67.1: dropped &minimal_response. With minimal_response,
        // HA omits last_changed/last_updated on most points which made
        // every datapoint timestamp NaN and the series got filtered to
        // nothing. Full response is larger (~tens of KB for 24h at 1-min
        // resolution) but reliably contains timestamps on every point.
        const url = `history/period/${start.toISOString()}`
          + `?filter_entity_id=${encodeURIComponent(entityId)}`
          + `&end_time=${encodeURIComponent(end.toISOString())}`;
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(`[HEIMDALL Sparkline c${idx}] fetching ${entityId} period=${period} url=${url}`);
        }
        const result = await this.hass.callApi('GET', url);
        if (!this.isConnected) return; // bail if component was removed mid-fetch
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(`[HEIMDALL Sparkline c${idx}] raw response:`, result);
        }
        if (!Array.isArray(result) || !result[0]) {
          if (debug) console.warn(`[HEIMDALL Sparkline c${idx}] empty result for ${entityId}, trying live state for flat line`);
          // Phase 5.76: empty history (e.g. brand-new sensor, or one that
          // never changed) -> draw a flat line from the current state if
          // we have one, rather than rendering nothing.
          const liveState = this.hass?.states?.[entityId]?.state;
          const parsed = parseFloat(liveState);
          if (!isNaN(parsed)) {
            this._sparklineData[entityId] = [
              { t: start.getTime(), v: parsed },
              { t: end.getTime(),   v: parsed }
            ];
            this.requestUpdate();
          }
          return;
        }
        const raw = result[0];
        const series = raw
          .map(p => {
            // Use whichever timestamp field is present. Recorder usually
            // populates last_changed; some HA versions populate last_updated
            // or last_reported instead.
            const ts = p.last_changed || p.last_updated || p.last_reported;
            return {
              t: ts ? new Date(ts).getTime() : NaN,
              v: parseFloat(p.state)
            };
          })
          .filter(p => !isNaN(p.v) && !isNaN(p.t));
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(
            `[HEIMDALL Sparkline c${idx}] parsed ${series.length} points from ${raw.length} raw entries`,
            series.length ? { first: series[0], last: series[series.length - 1] } : null
          );
        }
        // Phase 5.76: a sensor that held a CONSTANT value over the whole
        // window (e.g. a consumer at 0 W for 6h, or any flat reading)
        // produces only 0 or 1 state-change rows from the History API,
        // which previously hit 'series.length < 2 -> return' and rendered
        // NOTHING. But a constant value is perfectly valid data and should
        // show as a FLAT LINE, exactly like Waschen's near-constant trace.
        //
        // Fix: synthesize a flat 2-point series spanning the window from
        // whatever value we can find -- the single history point if present,
        // otherwise the sensor's current state. Only give up if there is no
        // usable numeric value anywhere.
        if (series.length < 2) {
          let flatVal = NaN;
          if (series.length === 1) {
            flatVal = series[0].v;
          } else {
            // No history rows at all -> fall back to the live state value.
            const liveState = this.hass?.states?.[entityId]?.state;
            const parsed = parseFloat(liveState);
            if (!isNaN(parsed)) flatVal = parsed;
          }
          if (isNaN(flatVal)) {
            if (debug) console.warn(`[HEIMDALL Sparkline c${idx}] no usable value for ${entityId}, skipping`);
            return;
          }
          const flatSeries = [
            { t: start.getTime(), v: flatVal },
            { t: end.getTime(),   v: flatVal }
          ];
          if (debug) {
            // eslint-disable-next-line no-console
            console.log(`[HEIMDALL Sparkline c${idx}] constant value ${flatVal} over window -> flat line`);
          }
          this._sparklineData[entityId] = flatSeries;
          this.requestUpdate();
          return;
        }
        this._sparklineData[entityId] = series;
        this.requestUpdate();
      } catch (e) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.error(`[HEIMDALL Sparkline c${idx}] fetch failed for ${entityId}:`, e);
        }
        // Silent fail outside debug: sparkline simply won't update this
        // cycle. History API can intermittently 503 under load; next 60s
        // tick will retry.
      }
    }

    _downsampleSparkline(data, maxPoints) {
      if (!Array.isArray(data) || data.length <= maxPoints) return data;
      const step = data.length / maxPoints;
      const out = [];
      for (let i = 0; i < maxPoints; i++) {
        out.push(data[Math.floor(i * step)]);
      }
      out.push(data[data.length - 1]);
      return out;
    }
    
    _startRotationTimer() {
      if (this._rotationTimer) {
        clearInterval(this._rotationTimer);
        this._rotationTimer = null;
      }
      const intervalSec = Math.max(1, this.config?.rotation_interval_sec || 10);
      this._rotationTimer = setInterval(() => {
        this._rotationTick = (this._rotationTick || 0) + 1;
      }, intervalSec * 1000);
    }
    
    disconnectedCallback() {
      super.disconnectedCallback();
      if (this._rotationTimer) {
        clearInterval(this._rotationTimer);
        this._rotationTimer = null;
      }
      // Phase 5.67: stop sparkline refresh polling on detach to avoid
      // leaking timers when the dashboard tab is switched or the card
      // is removed.
      if (this._sparklineTimer) {
        clearInterval(this._sparklineTimer);
        this._sparklineTimer = null;
      }
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      }
    }

    updated(changedProps) {
      super.updated(changedProps);
      // Phase A1.8: re-measure when config changes (e.g. toggling side panels)
      // so _cardWidth reflects the new layout instead of a stale value. The
      // observer may not fire on a pure config change, so seed it here.
      if (changedProps.has('config')) {
        requestAnimationFrame(() => {
          const w = this.offsetWidth;
          if (w > 0 && Math.abs(w - (this._cardWidth || 0)) > 1) this._cardWidth = w;
        });
        // Phase A2.1: build embedded panel cards once side panels are enabled.
        if (this.config && this.config.side_panels_enabled === true) {
          this._buildPanelCards();
        }
      }
      if (changedProps.has('hass') && this.hass) {
        const isDark = this.hass.themes?.darkMode !== false;
        if (isDark) {
          this.removeAttribute('data-theme-light');
        } else {
          this.setAttribute('data-theme-light', '');
        }
        // Phase A2.2: forward hass to every embedded panel card on each hass
        // update so they stay live (the common failure mode is setting hass
        // once and leaving sub-cards frozen).
        if (this._panelLeftEls) this._panelLeftEls.forEach((el) => { if (el) el.hass = this.hass; });
        if (this._panelRightEls) this._panelRightEls.forEach((el) => { if (el) el.hass = this.hass; });
        // Phase 5.67.2: kick off the sparkline timer once we have hass.
        // This is the bulletproof trigger -- updated() with changedProps.has('hass')
        // is guaranteed to fire whenever hass becomes available, regardless of
        // whether that happens before or after firstUpdated(). Latched so the
        // 60s interval is only set up once. Reference: lit.dev/docs/components/lifecycle.
        this._ensureSparklineInit();
      }
      // Apply custom colors from config
      if (this.config) {
        const colorMap = {
          'color_solar': '--neon-yellow',
          'color_grid': '--neon-blue',
          'color_battery': '--neon-green',
          'color_venus': '--venus-color',
          'color_export': '--export-color',
          'color_consumer_1': '--consumer-1-color',
          'color_consumer_2': '--consumer-2-color',
          'color_consumer_3': '--consumer-3-color',
          'color_consumer_4': '--consumer-4-color',
          'color_consumer_5': '--consumer-5-color',
          'color_consumer_6': '--consumer-6-color',
          'color_consumer_7': '--consumer-7-color',
          'color_bkw': '--bkw-color',
          'color_pipe_bkw': '--pipe-bkw-color',
          'color_pipe_solar': '--pipe-solar-color',
          'color_pipe_grid': '--pipe-grid-color',
          'color_pipe_battery': '--pipe-battery-color',
          'color_pipe_venus': '--pipe-venus-color',
          'color_pipe_consumer_1': '--pipe-consumer-1-color',
          'color_pipe_consumer_2': '--pipe-consumer-2-color',
          'color_pipe_consumer_3': '--pipe-consumer-3-color',
          'color_pipe_consumer_4': '--pipe-consumer-4-color',
          'color_pipe_consumer_5': '--pipe-consumer-5-color',
          'color_pipe_consumer_6': '--pipe-consumer-6-color',
          'color_pipe_consumer_7': '--pipe-consumer-7-color',
          'color_house': '--neon-pink',
          'color_icon_bkw': '--icon-bkw-color',
          'color_icon_solar': '--icon-solar-color',
          'color_icon_grid': '--icon-grid-color',
          'color_icon_battery': '--icon-battery-color',
          'color_icon_venus': '--icon-venus-color',
          'color_icon_house': '--icon-house-color',
          'color_icon_consumer_1': '--icon-consumer-1-color',
          'color_icon_consumer_2': '--icon-consumer-2-color',
          'color_icon_consumer_3': '--icon-consumer-3-color',
          'color_icon_consumer_4': '--icon-consumer-4-color',
          'color_icon_consumer_5': '--icon-consumer-5-color',
          'color_icon_consumer_6': '--icon-consumer-6-color',
          'color_icon_consumer_7': '--icon-consumer-7-color',
          'color_text_bkw': '--text-bkw-color',
          'color_text_solar': '--text-solar-color',
          'color_text_grid': '--text-grid-color',
          'color_text_battery': '--text-battery-color',
          'color_text_venus': '--text-venus-color',
          'color_text_house': '--text-house-color',
          'color_text_consumer_1': '--text-consumer-1-color',
          'color_text_consumer_2': '--text-consumer-2-color',
          'color_text_consumer_3': '--text-consumer-3-color',
          'color_text_consumer_4': '--text-consumer-4-color',
          'color_text_consumer_5': '--text-consumer-5-color',
          'color_text_consumer_6': '--text-consumer-6-color',
          'color_text_consumer_7': '--text-consumer-7-color',
          'color_secondary_solar': '--secondary-solar-color',
          'color_secondary_grid': '--secondary-grid-color',
          'color_secondary_battery': '--secondary-battery-color',
          'color_secondary_venus': '--secondary-venus-color',
          'color_secondary_house': '--secondary-house-color',
          'color_secondary_consumer_1': '--secondary-consumer-1-color',
          'color_secondary_consumer_2': '--secondary-consumer-2-color',
          'color_secondary_consumer_3': '--secondary-consumer-3-color',
          'color_secondary_consumer_4': '--secondary-consumer-4-color',
          'color_secondary_consumer_5': '--secondary-consumer-5-color',
          'color_secondary_consumer_6': '--secondary-consumer-6-color',
          'color_secondary_consumer_7': '--secondary-consumer-7-color',
        };
        for (const [configKey, cssVar] of Object.entries(colorMap)) {
          if (this.config[configKey]) {
            this.style.setProperty(cssVar, this.config[configKey]);
          } else {
            this.style.removeProperty(cssVar);
          }
        }
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      }
    }

    static get styles() {
      return css`
      :host {
        display: block;
        --neon-yellow: #ffdd00;
        --neon-blue: #3b82f6;
        --neon-green: #00ff88;
        --neon-cyan: #06b6d4;
        --venus-color: var(--neon-cyan);
        /* Phase BKW-9: the garden bubble tracks the solar bubble by default,
           so a colour change on the PV side carries over. Each var can still
           be overridden individually via color_bkw / color_pipe_bkw / ... */
        --bkw-color: var(--pipe-solar-color);
        --pipe-bkw-color: var(--pipe-solar-color);
        --icon-bkw-color: var(--icon-solar-color);
        --text-bkw-color: var(--text-solar-color);
        --neon-pink: #ff0080;
        --neon-red: #ff3333;
        --export-purple: #a855f7;
        --export-color: #ff3333;
        --consumer-1-color: #a855f7;
        --consumer-2-color: #f97316;
        --consumer-3-color: #06b6d4;
        --consumer-4-color: #eab308;
        --consumer-5-color: #6366f1;
        --consumer-6-color: #14b8a6;
        --consumer-7-color: #ec4899;
        --pipe-solar-color: var(--neon-yellow);
        --pipe-grid-color: var(--neon-blue);
        --pipe-battery-color: var(--neon-green);
        --pipe-venus-color: var(--venus-color);
        --pipe-consumer-1-color: var(--consumer-1-color);
        --pipe-consumer-2-color: var(--consumer-2-color);
        --pipe-consumer-3-color: var(--consumer-3-color);
        --pipe-consumer-4-color: var(--consumer-4-color);
        --pipe-consumer-5-color: var(--consumer-5-color);
        --pipe-consumer-6-color: var(--consumer-6-color);
        --pipe-consumer-7-color: var(--consumer-7-color);
        --icon-solar-color: var(--neon-yellow);
        --icon-grid-color: var(--neon-blue);
        --icon-battery-color: var(--neon-green);
        --icon-venus-color: var(--venus-color);
        --icon-house-color: var(--neon-pink);
        --icon-consumer-1-color: var(--consumer-1-color);
        --icon-consumer-2-color: var(--consumer-2-color);
        --icon-consumer-3-color: var(--consumer-3-color);
        --icon-consumer-4-color: var(--consumer-4-color);
        --icon-consumer-5-color: var(--consumer-5-color);
        --icon-consumer-6-color: var(--consumer-6-color);
        --icon-consumer-7-color: var(--consumer-7-color);
        --text-solar-color: var(--neon-yellow);
        --text-grid-color: var(--neon-blue);
        --text-battery-color: var(--neon-green);
        --text-venus-color: var(--venus-color);
        --text-house-color: var(--neon-pink);
        --text-consumer-1-color: var(--consumer-1-color);
        --text-consumer-2-color: var(--consumer-2-color);
        --text-consumer-3-color: var(--consumer-3-color);
        --text-consumer-4-color: var(--consumer-4-color);
        --text-consumer-5-color: var(--consumer-5-color);
        --text-consumer-6-color: var(--consumer-6-color);
        --text-consumer-7-color: var(--consumer-7-color);
        --secondary-solar-color: #888888;
        --secondary-grid-color: #888888;
        --secondary-battery-color: #888888;
        --secondary-venus-color: #888888;
        --secondary-house-color: #888888;
        --secondary-consumer-1-color: #888888;
        --secondary-consumer-2-color: #888888;
        --secondary-consumer-3-color: #888888;
        --secondary-consumer-4-color: #888888;
        --secondary-consumer-5-color: #888888;
        --secondary-consumer-6-color: #888888;
        --secondary-consumer-7-color: #888888;
        --flow-dasharray: 0 380; 
      }
      :host([data-theme-light]) {
        --neon-yellow: #c8a800;
        --neon-blue: #2563eb;
        --neon-green: #059669;
        --neon-cyan: #0891b2;
        --venus-color: var(--neon-cyan);
        /* Phase BKW-9: the garden bubble tracks the solar bubble by default,
           so a colour change on the PV side carries over. Each var can still
           be overridden individually via color_bkw / color_pipe_bkw / ... */
        --bkw-color: var(--pipe-solar-color);
        --pipe-bkw-color: var(--pipe-solar-color);
        --icon-bkw-color: var(--icon-solar-color);
        --text-bkw-color: var(--text-solar-color);
        --neon-pink: #db2777;
        --neon-red: #dc2626;
        --export-purple: #7c3aed;
        --export-color: #dc2626;
        --consumer-1-color: #7c3aed;
        --consumer-2-color: #ea580c;
        --consumer-3-color: #0891b2;
        --consumer-4-color: #ca8a04;
        --consumer-5-color: #4f46e5;
      }
      ha-card {
        padding: 0; 
        position: relative;
        overflow: visible; /* Phase 5.17: allow content (especially zoomed bubbles) to extend beyond card bounds */
        transition: height 0.3s ease;
      }
      
      /* Phase 5.18: optional transparent card background -- removes the grey
         ha-card frame so the flow diagram floats on the dashboard background. */
      ha-card.transparent-bg {
        background: transparent !important;
        box-shadow: none !important;
        border: none !important;
      }
      
      /* Phase 5.41: animated background effects.
       * Three styles wrapped in a single ::before pseudo-element on ha-card.
       * The active style is selected by the .bg-anim-{aurora|flow|pulse} class.
       * All effects use GPU-accelerated properties only (transform, opacity,
       * background-position). The whole layer is muted via opacity from the
       * Intensity slider and saturate() from the Saturation slider.
       *
       * Layer is positioned absolutely behind content (z-index: 0, while
       * scale-wrapper sits at z-index: 1+). overflow: hidden on ha-card keeps
       * the moving colours contained within the visible card area.
       *
       * Defaults (from CSS vars set inline):
       *   --bg-anim-duration : 30s
       *   --bg-anim-opacity  : 0.1
       *   --bg-anim-saturate : 1
       *   --bg-color-1..4    : the four user-picked colours
       */
      ha-card.bg-anim-aurora,
      ha-card.bg-anim-flow {
        overflow: hidden;
        position: relative;
      }
      ha-card.bg-anim-aurora::before,
      ha-card.bg-anim-flow::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        border-radius: inherit;
        opacity: var(--bg-anim-opacity, 0.1);
        filter: saturate(var(--bg-anim-saturate, 1));
        will-change: transform, background-position, opacity;
      }
      
      /* Aurora style: four large radial-gradient blobs drifting slowly */
      ha-card.bg-anim-aurora::before {
        background:
          radial-gradient(circle at 20% 30%, var(--bg-color-1, #ffdd00) 0%, transparent 45%),
          radial-gradient(circle at 80% 20%, var(--bg-color-2, #ff0040) 0%, transparent 45%),
          radial-gradient(circle at 70% 80%, var(--bg-color-3, #e100ff) 0%, transparent 45%),
          radial-gradient(circle at 30% 70%, var(--bg-color-4, #8d07d5) 0%, transparent 45%);
        background-size: 200% 200%;
        animation: hflux-aurora-drift var(--bg-anim-duration, 30s) ease-in-out infinite alternate;
      }
      @keyframes hflux-aurora-drift {
        0%   { background-position: 0% 0%, 100% 0%, 100% 100%, 0% 100%; }
        50%  { background-position: 100% 50%, 0% 50%, 50% 0%, 50% 100%; }
        100% { background-position: 50% 100%, 50% 0%, 0% 50%, 100% 50%; }
      }
      
      /* Slow Flow style: diagonal linear gradient sliding across */
      ha-card.bg-anim-flow::before {
        background: linear-gradient(
          135deg,
          var(--bg-color-1, #ffdd00) 0%,
          var(--bg-color-2, #ff0040) 33%,
          var(--bg-color-3, #e100ff) 66%,
          var(--bg-color-4, #8d07d5) 100%
        );
        background-size: 400% 400%;
        animation: hflux-flow-slide var(--bg-anim-duration, 30s) ease infinite;
      }
      @keyframes hflux-flow-slide {
        0%   { background-position: 0% 50%; }
        50%  { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      
      /* Respect user's motion-reduction preference: disable all keyframe
       * animations on the background layer. The colour layer itself stays
       * visible as a static blend, which is still better than blank. */
      @media (prefers-reduced-motion: reduce) {
        ha-card.bg-anim-aurora::before,
        ha-card.bg-anim-flow::before {
          animation: none !important;
        }
      }
      
      /* Make sure the actual card content sits above the animation layer.
       * scale-wrapper is the immediate child holding the SVG flow diagram. */
      ha-card.bg-anim-aurora > .scale-wrapper,
      ha-card.bg-anim-flow > .scale-wrapper {
        position: relative;
        z-index: 1;
      }
      
      /* --- STANDARD VIEW STYLES --- */
      .scale-wrapper {
        width: 800px; /* must match SVG viewBox width (phase 5.5 / 5.6) */
        transform-origin: top left; 
        transition: transform 0.1s linear;
      }

      /* Phase A1.3: the flow visualization wrapper. The resize observer measures
         THIS element, so the card scales to whatever width it gets -- full width
         in normal mode, the center track in side-panels mode. */
      .hf-flow-host {
        width: 100%;
        min-width: 0;
      }
      /* Phase A1: optional side panels. 3-column grid wraps the flow card in
         the center; left/right tracks hold embedded HA cards (added in A2).
         Disabled by default -- existing cards render unchanged. */
      .hf-side-panels-grid {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr) 320px;
        gap: 12px;
        align-items: start;
        width: 100%;
        box-sizing: border-box;
      }
      /* Phase A2.2: panel slots are vertical stacks of embedded HA cards.
         No placeholder border anymore; gap spaces multiple cards. Empty slots
         simply take no space. */
      .hf-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
        box-sizing: border-box;
      }

      .absolute-container {
        position: relative;
        width: 100%;
        transition: top 0.3s ease; 
      }

      .bubble {
        width: var(--bubble-size, 90px);
        height: var(--bubble-size, 90px);
        /* Phase 5.31: re-center bubble around its original anchor point so that
         * pipes keep meeting the bubble's visual center as size scales. The
         * delta is half the difference between the configured size and the
         * original 90px default. Negative margins shift the bubble's top-left
         * corner outward, keeping the center anchored. */
        margin-top: calc((90px - var(--bubble-size, 90px)) / 2);
        margin-left: calc((90px - var(--bubble-size, 90px)) / 2);
        border-radius: 50%;
        background: transparent;
        border: 2px solid var(--divider-color, #333);
        display: block; 
        position: absolute;
        z-index: 2;
        transition: all 0.3s ease;
        box-sizing: border-box;
        cursor: pointer;
      }
      
      .bubble.tinted { background: rgba(255, 255, 255, 0.05); }
      .bubble.tinted.solar { background: color-mix(in srgb, var(--neon-yellow), transparent 85%); }
      .bubble.tinted.grid { background: color-mix(in srgb, var(--neon-blue), transparent 85%); }
      .bubble.tinted.grid.exporting { background: color-mix(in srgb, var(--export-color), transparent 85%); }
      .bubble.grid.exporting { border-color: var(--export-color); }
      .bubble.tinted.battery { background: color-mix(in srgb, var(--neon-green), transparent 85%); }
      .bubble.tinted.venus { background: color-mix(in srgb, var(--venus-color), transparent 85%); }
      .bubble.tinted.c1 { background: color-mix(in srgb, var(--consumer-1-color), transparent 85%); }
      .bubble.tinted.c2 { background: color-mix(in srgb, var(--consumer-2-color), transparent 85%); }
      .bubble.tinted.c3 { background: color-mix(in srgb, var(--consumer-3-color), transparent 85%); }
      .bubble.tinted.c4 { background: color-mix(in srgb, var(--consumer-4-color), transparent 85%); }
      .bubble.tinted.c5 { background: color-mix(in srgb, var(--consumer-5-color), transparent 85%); }
      .bubble.tinted.c6 { background: color-mix(in srgb, var(--consumer-6-color), transparent 85%); }
      .bubble.tinted.c7 { background: color-mix(in srgb, var(--consumer-7-color), transparent 85%); }

      .bubble.house { border-color: var(--neon-pink); }
      .bubble.house.tinted { background: color-mix(in srgb, var(--neon-pink), transparent 85%); }
      /* phase 5.78: split climate (temp) bubble. Ice-cyan glow, follows the
         same border/tinted convention as the other bubbles. Inner ring
         geometry (split halves, double rings) lands in phase 5.79. */
      .bubble.temp { border-color: var(--temp-glow, #19c6e6); }
      .bubble.temp.tinted { background: color-mix(in srgb, var(--temp-glow, #19c6e6), transparent 85%); }
      /* phase 5.79a: temp bubble is a rectangular thermometer panel, not a
         round bubble. Override size (130x130), square corners, and neutralise
         the round-bubble re-center margins so it anchors at its node position.
         Inner thermometer geometry (split columns, levels, marker) is 5.79b. */
      .bubble.temp {
        width: 130px;
        height: 130px;
        border-radius: 14px;
        margin-top: 0;
        margin-left: 0;
      }
      .bubble.house.donut { border: none !important; --house-gradient: var(--neon-pink); background: transparent; }
      .bubble.house.donut.tinted { background: color-mix(in srgb, var(--neon-pink), transparent 85%); }
      .bubble.house.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px; 
          background: var(--house-gradient);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }

      /* Phase 5.74: House self-sufficiency (Autarkie) mix-ring. SECOND outer
         ring around the existing 4-segment consumption-origin donut. The donut
         already shows WHERE the consumed energy came from (PV/LG/Venus/Grid);
         this ring shows the simpler self-sufficiency split: how much of the
         house consumption was self-supplied (PV+battery) vs drawn from grid.
         2 segments: self (solar/green) + grid (red). */
      .bubble.house.mix-ring { overflow: visible; }
      .bubble.house.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--house-mix-gap, 8px) + var(--house-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--house-mix-thickness, 4px);
          background: var(--house-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }

      .bubble.grid.donut { border: none !important; background: transparent; }
      .bubble.grid.donut.tinted { background: color-mix(in srgb, var(--neon-blue), transparent 85%); }
      .bubble.grid.donut.tinted.exporting { background: color-mix(in srgb, var(--export-color), transparent 85%); }
      .bubble.grid.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--grid-gradient, var(--neon-blue));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.73: Grid Import/Export balance mix-ring -- a SECOND outer ring
         around the existing Grid Tages-Mix donut. Semantics: 2 segments
         (Import-Anteil in Grid-Pipe-Farbe rot, Export-Anteil in Export-/PV-
         Farbe). Answers "wie ist meine Netz-Bilanz?". Mirror of LG/Venus
         mix-ring CSS but on .grid. */
      .bubble.grid.mix-ring { overflow: visible; }
      .bubble.grid.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--grid-mix-gap, 8px) + var(--grid-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--grid-mix-thickness, 4px);
          background: var(--grid-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.23: PV solar donut -- forecast progress ring */
      .bubble.solar.donut { border: none !important; background: transparent; }
      .bubble.solar.donut.tinted { background: color-mix(in srgb, var(--neon-yellow), transparent 85%); }
      .bubble.solar.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--solar-gradient, var(--neon-yellow));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.72: Solar PV-distribution mix-ring -- 4-segment outer ring
         around the PV-forecast donut. Semantics differ from LG/Venus (which
         answer "where did my energy come from"): for SOLAR the question is
         "where did my PV energy go?" -- house direct-consumption / LG /
         Venus / grid export. 4 segments because all four destinations are
         real for a PV system with batteries and grid export. Mirror of
         consumer mix-ring CSS (phase 5.48) but on .solar instead of .c1. */
      .bubble.solar.mix-ring { overflow: visible; }
      .bubble.solar.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--solar-mix-gap, 8px) + var(--solar-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--solar-mix-thickness, 4px);
          background: var(--solar-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.36: battery SoC donut ring */
      .bubble.battery.donut { border: none !important; background: transparent; }
      .bubble.battery.donut.tinted { background: color-mix(in srgb, var(--pipe-battery-color, var(--neon-green)), transparent 85%); }
      .bubble.battery.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--battery-gradient, var(--pipe-battery-color, var(--neon-green)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.68: LG (battery) charge-source mix-ring -- a SECOND outer ring around
         the SoC donut. Uses --battery-mix-gradient (conic, 2 segments PV/Grid weighted
         by user-chosen period). Semantics differ from consumer mix-rings: for a
         source bubble like LG, "mix" means "where did the energy I store come from"
         -- and LG can only be charged from PV or Grid (never from Venus or itself).
         Hence only 2 segments. Mirror of c1/c5 mix-ring CSS (phase 5.48/5.51). */
      .bubble.battery.mix-ring { overflow: visible; }
      .bubble.battery.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--battery-mix-gap, 8px) + var(--battery-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--battery-mix-thickness, 4px);
          background: var(--battery-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.37: Venus SoC donut ring */
      .bubble.venus.donut { border: none !important; background: transparent; }
      .bubble.venus.donut.tinted { background: color-mix(in srgb, var(--pipe-venus-color, var(--venus-color)), transparent 85%); }
      .bubble.venus.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--venus-gradient, var(--pipe-venus-color, var(--venus-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.70: Venus (Marstek) charge-source mix-ring. Mirror of the LG
         mix-ring from phase 5.68 -- same 2-segment semantics (PV + Grid only),
         same source-bubble logic. Sits outside the SoC donut by a configurable
         gap, with its own configurable thickness. */
      .bubble.venus.mix-ring { overflow: visible; }
      .bubble.venus.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--venus-mix-gap, 8px) + var(--venus-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--venus-mix-thickness, 4px);
          background: var(--venus-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.47: Tesla (Consumer 1) SoC donut ring.
         Uses --c1-gradient (conic) computed from secondary_consumer_1 / consumer_1_soc_max.
         Same masking trick as battery/venus -- transparent body, donut renders in ::before. */
      .bubble.c1.donut { border: none !important; background: transparent; }
      .bubble.c1.donut.tinted { background: color-mix(in srgb, var(--pipe-consumer-1-color, var(--consumer-1-color)), transparent 85%); }
      .bubble.c1.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--c1-gradient, var(--pipe-consumer-1-color, var(--consumer-1-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.48: Tesla charge-mix ring -- a SECOND outer ring around the SoC donut.
         Uses --c1-mix-gradient (conic, 4 segments PV/LG/Venus/Grid weighted by user-
         chosen period). Sits outside the SoC ring by a configurable gap, with its own
         configurable thickness. Implemented as a pseudo via .bubble.c1.mix-ring::after
         so it can coexist with the SoC donut on ::before. inset is negative so the
         ring extends past the bubble's edge into the surrounding card area. */
      .bubble.c1.mix-ring { overflow: visible; }
      .bubble.c1.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--c1-mix-gap, 8px) + var(--c1-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--c1-mix-thickness, 4px);
          background: var(--c1-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.49: BWWP (Consumer 5) SoC/temperature donut ring.
         Same masking trick as battery/venus/c1 -- transparent body, donut renders
         in ::before. Uses --c5-gradient (conic) computed from
         secondary_consumer_5 / consumer_5_soc_max. */
      .bubble.c5.donut { border: none !important; background: transparent; }
      .bubble.c5.donut.tinted { background: color-mix(in srgb, var(--pipe-consumer-5-color, var(--consumer-5-color)), transparent 85%); }
      .bubble.c5.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--c5-gradient, var(--pipe-consumer-5-color, var(--consumer-5-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.51: BWWP charge-mix ring -- a SECOND outer ring around the temp donut.
         Uses --c5-mix-gradient (conic, 4 segments PV/LG/Venus/Grid weighted by user-
         chosen period). Mirror of Tesla mix-ring (phase 5.48). */
      .bubble.c5.mix-ring { overflow: visible; }
      .bubble.c5.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--c5-mix-gap, 8px) + var(--c5-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--c5-mix-thickness, 4px);
          background: var(--c5-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.52: Pumpe (Consumer 7) water-level donut ring.
         Mirror of BWWP donut. Uses --c7-gradient (conic) computed from
         secondary_consumer_7 / consumer_7_soc_max (default 165 cm). */
      .bubble.c7.donut { border: none !important; background: transparent; }
      .bubble.c7.donut.tinted { background: color-mix(in srgb, var(--pipe-consumer-7-color, var(--consumer-7-color)), transparent 85%); }
      .bubble.c7.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--c7-gradient, var(--pipe-consumer-7-color, var(--consumer-7-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.54: Pumpe charge-mix ring -- outer ring around the water-level donut.
         Uses --c7-mix-gradient (conic, 4 segments PV/LG/Venus/Grid weighted by user-
         chosen period). Mirror of BWWP mix-ring (phase 5.51). */
      .bubble.c7.mix-ring { overflow: visible; }
      .bubble.c7.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--c7-mix-gap, 8px) + var(--c7-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--c7-mix-thickness, 4px);
          background: var(--c7-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.55: Waschen (Consumer 2) configurable donut ring.
         Generic ratio donut: secondary_consumer_2 / consumer_2_soc_max
         (default 5, suited to a daily energy budget in kWh). */
      .bubble.c2.donut { border: none !important; background: transparent; }
      .bubble.c2.donut.tinted { background: color-mix(in srgb, var(--pipe-consumer-2-color, var(--consumer-2-color)), transparent 85%); }
      .bubble.c2.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--c2-gradient, var(--pipe-consumer-2-color, var(--consumer-2-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.57: Waschen charge-mix ring -- outer ring around the configurable donut.
         Uses --c2-mix-gradient (conic, 4 segments PV/LG/Venus/Grid weighted by user-
         chosen period). Mirror of Pumpe mix-ring (phase 5.54). */
      .bubble.c2.mix-ring { overflow: visible; }
      .bubble.c2.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--c2-mix-gap, 8px) + var(--c2-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--c2-mix-thickness, 4px);
          background: var(--c2-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.58: Trockner (Consumer 3) configurable donut ring.
         Generic ratio donut: secondary_consumer_3 / consumer_3_soc_max
         (default 5, suited to a daily energy budget in kWh on a dryer). */
      .bubble.c3.donut { border: none !important; background: transparent; }
      .bubble.c3.donut.tinted { background: color-mix(in srgb, var(--pipe-consumer-3-color, var(--consumer-3-color)), transparent 85%); }
      .bubble.c3.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--c3-gradient, var(--pipe-consumer-3-color, var(--consumer-3-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.60: Trockner charge-mix ring -- outer ring around the configurable donut.
         Uses --c3-mix-gradient (conic, 4 segments PV/LG/Venus/Grid). Mirror of c2. */
      .bubble.c3.mix-ring { overflow: visible; }
      .bubble.c3.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--c3-mix-gap, 8px) + var(--c3-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--c3-mix-thickness, 4px);
          background: var(--c3-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.61: Spüler (Consumer 4) configurable donut ring.
         Generic ratio donut: secondary_consumer_4 / consumer_4_soc_max
         (default 5, suited to a daily energy budget in kWh on a dishwasher). */
      .bubble.c4.donut { border: none !important; background: transparent; }
      .bubble.c4.donut.tinted { background: color-mix(in srgb, var(--pipe-consumer-4-color, var(--consumer-4-color)), transparent 85%); }
      .bubble.c4.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--c4-gradient, var(--pipe-consumer-4-color, var(--consumer-4-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.63: Spüler charge-mix ring -- outer ring around the configurable donut.
         Uses --c4-mix-gradient (conic, 4 segments PV/LG/Venus/Grid). Mirror of c3. */
      .bubble.c4.mix-ring { overflow: visible; }
      .bubble.c4.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--c4-mix-gap, 8px) + var(--c4-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--c4-mix-thickness, 4px);
          background: var(--c4-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.64: Klima (Consumer 6) configurable donut ring.
         Generic ratio donut: secondary_consumer_6 / consumer_6_soc_max
         (default 30, suited to indoor temperature in °C). */
      .bubble.c6.donut { border: none !important; background: transparent; }
      .bubble.c6.donut.tinted { background: color-mix(in srgb, var(--pipe-consumer-6-color, var(--consumer-6-color)), transparent 85%); }
      .bubble.c6.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--c6-gradient, var(--pipe-consumer-6-color, var(--consumer-6-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
      }
      
      /* Phase 5.66: Klima charge-mix ring -- final mix-ring of the series. */
      .bubble.c6.mix-ring { overflow: visible; }
      .bubble.c6.mix-ring::after {
          content: ""; position: absolute;
          inset: calc(-1 * (var(--c6-mix-gap, 8px) + var(--c6-mix-thickness, 4px)));
          border-radius: 50%;
          padding: var(--c6-mix-thickness, 4px);
          background: var(--c6-mix-gradient, transparent);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude;
          z-index: -1; pointer-events: none;
      }
      
      .icon-svg, .icon-custom {
          width: 33px; height: 33px; position: absolute; top: 10px; left: 50%; margin-left: -17px; z-index: 2; display: block;
      }
      .icon-custom { --mdc-icon-size: 34px; }
      
      .sub { 
        font-size: 9px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.5px;
        line-height: 1.1; z-index: 2; position: absolute; top: 46px; left: 0; width: 100%; text-align: center; margin: 0; pointer-events: none;
      }
      .sub.secondary-val {
        text-transform: none; letter-spacing: 0; font-weight: 500; font-size: 10px;
      }

      .value { 
        font-weight: bold; font-size: 15px; white-space: nowrap; z-index: 2; transition: color 0.3s ease;
        /* Phase 5.32: anchor the value to the original 90px bubble height, not
         * the new variable height. With 'bottom: 11px' the text would float
         * downward as the bubble grows (because "11px from the bottom edge"
         * moves further away from the centre). Instead we compute the top
         * offset that the value would have had in a 90px bubble (90 - 11 - 15
         * line-height = 64px) so the text sits at the same Y position
         * regardless of bubble size. */
        line-height: 1.2; position: absolute; top: 64px; left: 0; width: 100%; text-align: center; margin: 0;
      }
      .bubble.grid .value, .bubble.house .value { top: 60px; }
      .direction-arrow { font-size: 12px; margin-right: 0px; vertical-align: top; }
      
      @keyframes spin { 100% { transform: rotate(360deg); } }
      .spin-slow { animation: spin 12s linear infinite; transform-origin: center; }
      
      @keyframes pulse-opacity { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      .pulse { animation: pulse-opacity 2s ease-in-out infinite; }

      @keyframes float-y { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
      .float { animation: float-y 3s ease-in-out infinite; }

      .solar { border-color: var(--neon-yellow); }
      .battery { border-color: var(--neon-green); }
      .venus { border-color: var(--venus-color); }
      .grid { border-color: var(--neon-blue); }
      .c1 { border-color: var(--consumer-1-color); }
      .c2 { border-color: var(--consumer-2-color); }
      .c3 { border-color: var(--consumer-3-color); }
      .c4 { border-color: var(--consumer-4-color); }
      .c5 { border-color: var(--consumer-5-color); }
      .c6 { border-color: var(--consumer-6-color); }
      .c7 { border-color: var(--consumer-7-color); }
      .inactive { border-color: var(--secondary-text-color); }

      .glow.solar { box-shadow: 0 0 15px color-mix(in srgb, var(--neon-yellow), transparent 60%); }
      .glow.battery { box-shadow: 0 0 15px color-mix(in srgb, var(--neon-green), transparent 60%); }
      .glow.venus { box-shadow: 0 0 15px color-mix(in srgb, var(--venus-color), transparent 60%); }
      .glow.grid { box-shadow: 0 0 15px color-mix(in srgb, var(--neon-blue), transparent 60%); }
      .glow.grid.exporting { box-shadow: 0 0 15px color-mix(in srgb, var(--export-color), transparent 60%); }
      .glow.c1 { box-shadow: 0 0 15px color-mix(in srgb, var(--consumer-1-color), transparent 60%); }
      .glow.c2 { box-shadow: 0 0 15px color-mix(in srgb, var(--consumer-2-color), transparent 60%); }
      .glow.c3 { box-shadow: 0 0 15px color-mix(in srgb, var(--consumer-3-color), transparent 60%); }
      .glow.c4 { box-shadow: 0 0 15px color-mix(in srgb, var(--consumer-4-color), transparent 60%); }
      .glow.c5 { box-shadow: 0 0 15px color-mix(in srgb, var(--consumer-5-color), transparent 60%); }
      .glow.c6 { box-shadow: 0 0 15px color-mix(in srgb, var(--consumer-6-color), transparent 60%); }
      .glow.c7 { box-shadow: 0 0 15px color-mix(in srgb, var(--consumer-7-color), transparent 60%); }

      .node-solar { top: 80px; left: 75px; }     
      .node-grid { top: 80px; left: 215px; }     
      .node-battery { top: 80px; left: 355px; }  
      .node-venus { top: 80px; left: 495px; }   
      .node-bkw { top: 80px; left: 635px; }   /* phase BKW-1: garden plant, feeds the venus */
      .node-house { top: 245px; left: 355px; }   
      .node-temp { top: calc(220px + var(--temp-offset-y, 0px)); left: calc(655px + var(--temp-offset-x, 0px)); }   /* phase 5.84: movable via editor */
      .node-c1 { top: 400px; left: 130px; }
      .node-c2 { top: 400px; left: 355px; }
      .node-c3 { top: 400px; left: 580px; }
      .node-c4 { top: 510px; left: 240px; }
      .node-c5 { top: 510px; left: 470px; }
      .node-c6 { top: 510px; left: 0px; }
      .node-c7 { top: 510px; left: 680px; }

      svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
      
      .bg-path { fill: none; stroke-width: 6; transition: opacity 0.3s ease; }
      .bg-solar { stroke: var(--pipe-solar-color); opacity: var(--pipe-solar-opacity, 1); }
      .bg-grid { stroke: var(--pipe-grid-color); opacity: var(--pipe-grid-opacity, 1); }
      .bg-battery { stroke: var(--pipe-battery-color); opacity: var(--pipe-battery-opacity, 1); }
      .bg-venus { stroke: var(--pipe-venus-color); opacity: var(--pipe-venus-opacity, 1); }
      .bg-export { stroke: var(--export-color); }
      .bg-c1 { stroke: var(--pipe-consumer-1-color); opacity: var(--pipe-consumer-1-opacity, 1); }
      .bg-c2 { stroke: var(--pipe-consumer-2-color); opacity: var(--pipe-consumer-2-opacity, 1); }
      .bg-c3 { stroke: var(--pipe-consumer-3-color); opacity: var(--pipe-consumer-3-opacity, 1); }
      .bg-c4 { stroke: var(--pipe-consumer-4-color); opacity: var(--pipe-consumer-4-opacity, 1); }
      .bg-c5 { stroke: var(--pipe-consumer-5-color); opacity: var(--pipe-consumer-5-opacity, 1); }
      
      .flow-line { 
        fill: none; stroke-width: var(--flow-stroke-width, 8px); stroke-linecap: round; stroke-dasharray: var(--flow-dasharray);   
        animation: dash linear infinite; opacity: 0; transition: opacity 0.5s;
      }
      .flow-solar { stroke: var(--pipe-solar-color); opacity: var(--pipe-solar-opacity, 1); }
      .flow-grid { stroke: var(--pipe-grid-color); opacity: var(--pipe-grid-opacity, 1); }
      .flow-battery { stroke: var(--pipe-battery-color); opacity: var(--pipe-battery-opacity, 1); }
      .flow-venus { stroke: var(--pipe-venus-color); opacity: var(--pipe-venus-opacity, 1); }
      .flow-export { stroke: var(--export-color); }

      @keyframes dash { to { stroke-dashoffset: -1500; } }

      .flow-text {
        font-size: var(--pipe-label-size, 10px); font-weight: bold; text-anchor: middle; fill: #fff; transition: opacity 0.3s ease;
      }
      .flow-text.no-shadow { filter: none; }
      .text-solar { fill: var(--pipe-solar-color); }
      .text-grid { fill: var(--pipe-grid-color); }
      .text-export { fill: var(--export-color); }
      .text-battery { fill: var(--pipe-battery-color); }
      .text-venus { fill: var(--pipe-venus-color); }
      .text-consumer-1 { fill: var(--pipe-consumer-1-color); }
      .text-consumer-2 { fill: var(--pipe-consumer-2-color); }
      .text-consumer-3 { fill: var(--pipe-consumer-3-color); }
      .text-consumer-4 { fill: var(--pipe-consumer-4-color); }
      .text-consumer-5 { fill: var(--pipe-consumer-5-color); }
      .text-consumer-6 { fill: var(--pipe-consumer-6-color); }
      .text-consumer-7 { fill: var(--pipe-consumer-7-color); }
    `;
    }

    // --- SPARKLINE RENDERER (Phase 5.67) ---
    // Returns an SVG with an area/line chart of the recent history of the
    // entity tied to consumer index `idx`. Sits inside the .bubble div as
    // an absolutely positioned child, clipped to a circle via CSS clip-path.
    //
    // Implementation notes (hard-won during 5.67.0 through 5.67.5):
    //   - CSS `clip-path: circle(50%)` on the wrapper div, NOT an SVG-internal
    //     <clipPath> with url(#id). Internal references can fail to resolve
    //     inside Shadow DOM. Reference: MDN clip-path, Baseline since 2017.
    //   - Explicit pixel width/height on the <svg>, NOT 100%. SVG sizing
    //     inside an absolute-positioned container is unreliable with %.
    //   - The entire <svg>...</svg> block is one flat inline expression in
    //     the html`` template. Conditional <path> elements via
    //     ${cond ? html`<path/>` : ''} create nested TemplateResults that
    //     fail to mount as SVG-namespace nodes (lit-html limitation in this
    //     stripped-down HA-internal lit environment). Instead we ALWAYS
    //     render both <path> elements and conditionally blank their d=""
    //     attribute when the style toggle disables them.
    //   - No xmlns attribute on <svg>. The working _renderIcon helpers in
    //     this same file don't set xmlns either; HA's lit-html handles SVG
    //     namespace automatically for the <svg> opening tag.
    _renderSparkline(idx) {
      if (!this.config) return html``;
      if (this.config[`consumer_${idx}_sparkline`] !== true) return html``;
      // Sensor: explicit per-sparkline entity override, falls back to the
      // bubble's main entity. Empty string counts as unset.
      const overrideEntity = this.config[`consumer_${idx}_sparkline_entity`];
      const fallbackEntity = this.config?.entities?.[`consumer_${idx}`];
      const entityId = (overrideEntity && overrideEntity !== '') ? overrideEntity : fallbackEntity;
      if (!entityId) return html``;
      const data = this._sparklineData?.[entityId];
      if (!Array.isArray(data) || data.length < 2) return html``;

      const opacityRaw = this.config[`consumer_${idx}_sparkline_opacity`];
      const opacity = (opacityRaw === undefined || opacityRaw === null)
        ? 0.35 : Math.max(0.05, Math.min(1, parseFloat(opacityRaw)));
      const style = this.config[`consumer_${idx}_sparkline_style`] || 'area-line';
      const layer = this.config[`consumer_${idx}_sparkline_layer`] || 'back';
      const color = this.config[`consumer_${idx}_sparkline_color`]
        || this._getConsumerColor?.(idx) || `var(--consumer-${idx}-color)`;

      // Layer z-index. Bubble itself is z-index:2 (see .bubble CSS).
      // Donut ::before sits at z-index:-1. 'back' = 1 (above donut, below
      // text+icon), 'mid' = 2 (alongside icon), 'front' = 3 (above text).
      const zIndex = layer === 'front' ? 3 : layer === 'mid' ? 2 : 1;

      // Downsample to keep path simple. 60 points is plenty visually.
      const downsampled = this._downsampleSparkline(data, 60);

      // Use actual bubble size in pixels, not viewBox units. The bubble is
      // square with side = bubble_size (default 90px). Drawing in real
      // pixels removes the viewBox->CSS coordinate translation that can
      // fail silently inside absolute-positioned parents.
      const size = parseInt(this.config.bubble_size || 90, 10);
      const W = size, H = size;
      const tMin = downsampled[0].t;
      const tMax = downsampled[downsampled.length - 1].t;
      const tSpan = (tMax - tMin) || 1;
      // Phase 5.75: dynamic min->max Y-axis scaling (mini-graph-card default
      // behaviour), NOT 0->max. This is the fix for "constant value fills the
      // whole bubble". With 0->max a flat 1100W line sits at 91% height; with
      // min->max a flat line has vMin==vMax so it sits mid-bubble as a flat
      // line -- matching user expectation.
      //
      // min_bound_range guard (also from mini-graph-card): if the real spread
      // (vMax-vMin) is tiny (pure sensor noise), don't blow it up to fill the
      // bubble. We enforce a minimum range so flat data stays visually flat.
      // The minimum range is the larger of an absolute floor (avoids div-by-
      // near-zero) and a fraction of the mean (scales with the data's
      // magnitude so a 5kW signal and a 50W signal both look sensibly flat).
      const vals = downsampled.map(p => Math.max(0, p.v));
      const vDataMin = Math.min(...vals);
      const vDataMax = Math.max(...vals);
      const vMean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const rawRange = vDataMax - vDataMin;
      // minRange: at least 8% of the mean, but never below an absolute 1 unit.
      const minRange = Math.max(vMean * 0.08, 1);
      let lo, hi;
      if (rawRange < minRange) {
        // Flat/near-flat: center the data band inside an artificially widened
        // range so the line renders as a flat line mid-bubble, not at an edge.
        const mid = (vDataMax + vDataMin) / 2;
        lo = mid - minRange / 2;
        hi = mid + minRange / 2;
      } else {
        // Real variation: a little headroom top and bottom so peaks/troughs
        // don't touch the bubble edges.
        const pad = rawRange * 0.1;
        lo = vDataMin - pad;
        hi = vDataMax + pad;
      }
      const vSpan = (hi - lo) || 1;
      const xy = downsampled.map(p => [
        ((p.t - tMin) / tSpan) * W,
        H - ((Math.max(0, p.v) - lo) / vSpan) * H
      ]);
      const linePath = xy.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

      // Style toggle: blank out the d attribute when a part is disabled
      // rather than conditionally omitting the <path> element. Omitting
      // re-introduces the lit-html SVG-namespace bug from Phase 5.67.3.
      const effectiveAreaPath = (style === 'area' || style === 'area-line') ? areaPath : '';
      const effectiveLinePath = (style === 'line' || style === 'area-line') ? linePath : '';

      // Per-instance unique gradient ID. Avoids cross-bubble collisions
      // inside the Shadow DOM. Includes the latest timestamp so it changes
      // on every refetch.
      const gradId = `sparkline-grad-c${idx}-${Math.floor(tMax)}`;

      const wrapperStyle = [
        `position:absolute`,
        `left:0`,
        `top:0`,
        `width:${W}px`,
        `height:${H}px`,
        `clip-path:circle(50%)`,
        `-webkit-clip-path:circle(50%)`,
        `z-index:${zIndex}`,
        `pointer-events:none`,
        `opacity:${opacity}`,
        `overflow:hidden`,
        `border-radius:50%`,
      ].join(';');

      return html`<div class="sparkline-wrap" style="${wrapperStyle}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.85"></stop><stop offset="100%" stop-color="${color}" stop-opacity="0"></stop></linearGradient></defs><path d="${effectiveAreaPath}" fill="url(#${gradId})" stroke="none"></path><path d="${effectiveLinePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path></svg></div>`;
    }

    // Phase 5.69: Source-bubble sparkline renderer. Near-clone of
    // _renderSparkline above, but driven by a string prefix
    // ('battery', 'venus', 'solar', 'grid') instead of a numeric idx.
    //
    // Option B from the design discussion: separate function rather
    // than parametrising the consumer one. Trade-off accepted: ~80
    // lines of code duplication, but ZERO risk to the 7 working
    // consumer sparklines. Any future change to sparkline behaviour
    // that should apply to BOTH paths needs to be made in both places.
    //
    // Config keys read: ${prefix}_sparkline, ${prefix}_sparkline_entity,
    // ${prefix}_sparkline_opacity, ${prefix}_sparkline_style,
    // ${prefix}_sparkline_layer, ${prefix}_sparkline_color.
    // Storage key in this._sparklineData is the entity_id, identical
    // to the consumer path -- they share one data store.
    _renderSparklineForSource(prefix) {
      if (!this.config) return html``;
      if (this.config[`${prefix}_sparkline`] !== true) return html``;
      const overrideEntity = this.config[`${prefix}_sparkline_entity`];
      // Phase 5.73-fix: Grid primary sensor is grid_combined (signed) with
      // grid as fallback -- same precedence as the fetch loop and _handleClick.
      const fallbackEntity = (prefix === 'grid')
        ? (this.config?.entities?.grid_combined || this.config?.entities?.grid)
        : this.config?.entities?.[prefix];
      const entityId = (overrideEntity && overrideEntity !== '') ? overrideEntity : fallbackEntity;
      if (!entityId) return html``;
      const data = this._sparklineData?.[entityId];
      if (!Array.isArray(data) || data.length < 2) return html``;

      const opacityRaw = this.config[`${prefix}_sparkline_opacity`];
      const opacity = (opacityRaw === undefined || opacityRaw === null)
        ? 0.35 : Math.max(0.05, Math.min(1, parseFloat(opacityRaw)));
      const style = this.config[`${prefix}_sparkline_style`] || 'area-line';
      const layer = this.config[`${prefix}_sparkline_layer`] || 'back';
      // Default colour falls through to the bubble's pipe colour CSS var,
      // so a freshly enabled sparkline looks reasonable without picking
      // a colour. Battery -> --pipe-battery-color, venus -> --pipe-venus-color, etc.
      const color = this.config[`${prefix}_sparkline_color`]
        || `var(--pipe-${prefix}-color)`;

      const zIndex = layer === 'front' ? 3 : layer === 'mid' ? 2 : 1;
      const downsampled = this._downsampleSparkline(data, 60);

      const size = parseInt(this.config.bubble_size || 90, 10);
      const W = size, H = size;
      const tMin = downsampled[0].t;
      const tMax = downsampled[downsampled.length - 1].t;
      const tSpan = (tMax - tMin) || 1;
      // Phase 5.75: dynamic min->max Y-axis scaling with min_bound_range guard.
      // Identical to the consumer _renderSparkline path -- keep both in sync.
      // See that function for the full rationale (mini-graph-card default).
      const vals = downsampled.map(p => Math.max(0, p.v));
      const vDataMin = Math.min(...vals);
      const vDataMax = Math.max(...vals);
      const vMean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const rawRange = vDataMax - vDataMin;
      const minRange = Math.max(vMean * 0.08, 1);
      let lo, hi;
      if (rawRange < minRange) {
        const mid = (vDataMax + vDataMin) / 2;
        lo = mid - minRange / 2;
        hi = mid + minRange / 2;
      } else {
        const pad = rawRange * 0.1;
        lo = vDataMin - pad;
        hi = vDataMax + pad;
      }
      const vSpan = (hi - lo) || 1;
      const xy = downsampled.map(p => [
        ((p.t - tMin) / tSpan) * W,
        H - ((Math.max(0, p.v) - lo) / vSpan) * H
      ]);
      const linePath = xy.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
      const effectiveAreaPath = (style === 'area' || style === 'area-line') ? areaPath : '';
      const effectiveLinePath = (style === 'line' || style === 'area-line') ? linePath : '';

      // Source-prefixed gradient ID to keep it unique across source/consumer.
      const gradId = `sparkline-grad-${prefix}-${Math.floor(tMax)}`;

      const wrapperStyle = [
        `position:absolute`,
        `left:0`,
        `top:0`,
        `width:${W}px`,
        `height:${H}px`,
        `clip-path:circle(50%)`,
        `-webkit-clip-path:circle(50%)`,
        `z-index:${zIndex}`,
        `pointer-events:none`,
        `opacity:${opacity}`,
        `overflow:hidden`,
        `border-radius:50%`,
      ].join(';');

      return html`<div class="sparkline-wrap" style="${wrapperStyle}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.85"></stop><stop offset="100%" stop-color="${color}" stop-opacity="0"></stop></linearGradient></defs><path d="${effectiveAreaPath}" fill="url(#${gradId})" stroke="none"></path><path d="${effectiveLinePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path></svg></div>`;
    }

    // --- SVG ICON RENDERER ---
    _renderIcon(type, val = 0, colorOverride = null) {
      if (type === 'solar') {
        const animate = Math.round(val) > 0 ? 'spin-slow' : '';
        const color = colorOverride || 'var(--icon-solar-color)';
        return html`<svg class="icon-svg ${animate}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
      }
      if (type === 'grid') {
        const animate = Math.round(val) > 0 ? 'pulse' : '';
        const color = colorOverride || 'var(--icon-grid-color)';
        return html`<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L12 22"></path><path d="M5 8L19 8"></path><path d="M4 14L20 14"></path><path d="M2 22L22 22"></path><circle class="${animate}" cx="12" cy="4" r="4" fill="${color}" stroke="none"></circle></svg>`;
      }
      if (type === 'battery') {
        const soc = Math.min(Math.max(val, 0), 100) / 100;
        const rectHeight = 14 * soc;
        const rectY = 18 - rectHeight;
        const strokeColor = colorOverride || 'var(--icon-battery-color)';
        const rectColor = soc > 0.2 ? strokeColor : 'var(--neon-red)';
        return html`<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="2" ry="2"></rect><line x1="10" y1="2" x2="14" y2="2"></line><rect x="7" y="${rectY}" width="10" height="${rectHeight}" fill="${rectColor}" stroke="none"></rect></svg>`;
      }
      if (type === 'venus') {
        const soc = Math.min(Math.max(val, 0), 100) / 100;
        const rectHeight = 14 * soc;
        const rectY = 18 - rectHeight;
        const strokeColor = colorOverride || 'var(--icon-venus-color)';
        const rectColor = soc > 0.2 ? strokeColor : 'var(--neon-red)';
        return html`<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="2" ry="2"></rect><line x1="10" y1="2" x2="14" y2="2"></line><rect x="7" y="${rectY}" width="10" height="${rectHeight}" fill="${rectColor}" stroke="none"></rect></svg>`;
      }
      if (type === 'house') {
        const strokeColor = colorOverride || 'var(--icon-house-color)';
        return html`<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
      }
      if (type === 'car') {
        const c = colorOverride || 'var(--icon-consumer-1-color)';
        return html`<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"></path><circle cx="7" cy="17" r="2"></circle><circle cx="17" cy="17" r="2"></circle><path d="M14 17h-5"></path></svg>`;
      }
      if (type === 'heater') {
        const c = colorOverride || 'var(--icon-consumer-2-color)';
        return html`<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a4 4 0 0 0 4-4V8a4 4 0 0 0-8 0v8a4 4 0 0 0 4 4z"></path><path class="float" style="animation-delay: 0s;" d="M8 4c0-1.5 1-2 2-2s2 .5 2 2"></path><path class="float" style="animation-delay: 0.5s;" d="M14 4c0-1.5 1-2 2-2s2 .5 2 2"></path></svg>`;
      }
      if (type === 'pool') {
        const c = colorOverride || 'var(--icon-consumer-3-color)';
        return html`<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"></path><path class="float" d="M2 16c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"></path><path d="M12 2v6"></path><path d="M9 5h6"></path></svg>`;
      }
      return html``;
    }

    _formatPower(val) {
      if (val === 0) return "0";
      if (Math.abs(val) >= 1000) {
        return (val / 1000).toFixed(1) + " kW";
      }
      return Math.round(val) + " W";
    }
    
    // Phase 5.19: Rotating bubble display.
    // Given a bubble prefix (e.g. "grid"), returns the current display
    // {text, color} based on enabled slots and the global rotation tick.
    // Slots: live (current power), daily1, daily2, daily3 (each can be on/off).
    // If only one slot is enabled, no rotation -- always show that one.
    // If zero slots enabled, falls back to live.
    // Phase 5.19-fix: defaults for daily-slot colors so the visual works
    // out-of-the-box without the user having to interact with each color
    // picker. User picks override the default.
    _getBubbleRotationDisplay(prefix, liveText, liveColor) {
      const cfg = this.config;
      const ent = cfg.entities || {};
      
      // Per-slot fallback colors. Picked to be distinguishable on dark and
      // light backgrounds: red (consumption), green (export), blue (cost/total).
      const DAILY_DEFAULT_COLORS = {
        1: '#ff3333', // red
        2: '#33ff77', // green
        3: '#3377ff', // blue
      };
      
      // Collect enabled slots in order: live, daily1, daily2, daily3.
      // Each slot is {kind, text, color}. A daily slot is only counted if its
      // sensor is configured and resolves to a number.
      const slots = [];
      
      if (cfg[`${prefix}_rotate_show_live`] !== false) {
        // live is the default "always on" slot -- explicit false disables it.
        slots.push({ kind: 'live', text: liveText, color: liveColor });
      }
      
      for (const slotNum of [1, 2, 3]) {
        if (cfg[`${prefix}_rotate_show_daily_${slotNum}`] === true) {
          const sensorKey = `${prefix}_rotate_daily_${slotNum}`;
          const sensorEnt = ent[sensorKey];
          if (sensorEnt && this.hass && this.hass.states[sensorEnt]) {
            const rawVal = this.hass.states[sensorEnt].state;
            const numVal = parseFloat(rawVal);
            if (!isNaN(numVal)) {
              const unit = this.hass.states[sensorEnt].attributes?.unit_of_measurement || 'kWh';
              const text = numVal.toFixed(1) + ' ' + unit;
              // Use user color if set, otherwise per-slot default
              const color = cfg[`${prefix}_rotate_color_daily_${slotNum}`] || DAILY_DEFAULT_COLORS[slotNum];
              slots.push({ kind: 'daily', text, color });
            }
          }
        }
      }
      
      if (slots.length === 0) {
        // Fallback: nothing configured -> show live as before
        return { kind: 'live', text: liveText, color: liveColor };
      }
      
      const idx = (this._rotationTick || 0) % slots.length;
      return slots[idx];
    }

    _getConsumerColor(index) {
      const style = getComputedStyle(this);
      return style.getPropertyValue(`--consumer-${index}-color`).trim() || ['#a855f7', '#f97316', '#06b6d4', '#eab308', '#6366f1', '#14b8a6', '#ec4899'][index - 1];
    }

    _getConsumerPipeColor(index) {
      const style = getComputedStyle(this);
      return style.getPropertyValue(`--pipe-consumer-${index}-color`).trim() || this._getConsumerColor(index);
    }

    // --- DOM NODE SVG GENERATOR ---
    _renderSVGPath(d, color) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "bracket-line");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("fill", "none");
      path.style.stroke = color;
      path.style.fill = "none";
      return path;
    }

    // --- SQUARE BRACKET GENERATOR ---
    _createBracketPath(startPx, widthPx, direction) {
      if (widthPx < 5) return "";

      const r = 5;
      const startX = startPx;
      const endX = startPx + widthPx;

      let yBase, yLine;

      if (direction === 'down') {
        yBase = 24;
        yLine = 4;
      } else {
        yBase = 0;
        yLine = 20;
      }

      const height = Math.abs(yBase - yLine);
      const rEff = Math.min(r, height / 2, widthPx / 2);

      const yCorner = direction === 'down' ? yLine + rEff : yLine - rEff;

      return `
        M ${startX} ${yBase} 
        L ${startX} ${yCorner} 
        Q ${startX} ${yLine} ${startX + rEff} ${yLine} 
        L ${endX - rEff} ${yLine} 
        Q ${endX} ${yLine} ${endX} ${yCorner} 
        L ${endX} ${yBase}
      `;
    }

    // --- RENDER STANDARD VIEW ---
    _renderTempSparkline(side) {
      // Phase 5.82a: one history sparkline per thermometer half. side is
      // 'indoor' (left half) or 'outdoor' (right half). Mirrors the
      // _renderSparklineForSource logic but clips to a 65x130 rectangle
      // instead of a circle, so the two graphs sit behind their columns.
      if (!this.config) return html``;
      if (this.config[`temp_${side}_sparkline`] !== true) return html``;

      const e = this.config.entities || {};
      const defaults = {
        indoor:  e.temp_indoor  || 'sensor.haus_durchschnittstemperatur',
        outdoor: e.temp_outdoor || 'sensor.sbht_003c_993b_temperature',
      };
      const overrideEntity = e[`temp_${side}_sparkline_entity`] || this.config[`temp_${side}_sparkline_entity`];
      const entityId = (overrideEntity && overrideEntity !== '') ? overrideEntity : defaults[side];
      if (!entityId) return html``;

      const data = this._sparklineData?.[entityId];
      if (!Array.isArray(data) || data.length < 2) return html``;

      const opacityRaw = this.config[`temp_${side}_sparkline_opacity`];
      const opacity = (opacityRaw === undefined || opacityRaw === null)
        ? 0.35 : Math.max(0.05, Math.min(1, parseFloat(opacityRaw)));
      const style = this.config[`temp_${side}_sparkline_style`] || 'area-line';
      const defaultColor = side === 'indoor'
        ? (this.config.temp_indoor_color || '#1D9E75')
        : (this.config.temp_outdoor_color || '#378ADD');
      const color = this.config[`temp_${side}_sparkline_color`] || defaultColor;

      const downsampled = this._downsampleSparkline(data, 60);

      // Half-panel geometry: each half is 65px wide, 130px tall.
      const W = 65, H = 130;
      const leftPx = side === 'indoor' ? 0 : 65;
      const tMin = downsampled[0].t;
      const tMax = downsampled[downsampled.length - 1].t;
      const tSpan = (tMax - tMin) || 1;
      // Temperature can be negative, so unlike the power sparklines we do
      // NOT clamp to >=0 here. Dynamic min->max scaling with a guard band.
      const vals = downsampled.map(p => p.v);
      const vDataMin = Math.min(...vals);
      const vDataMax = Math.max(...vals);
      const rawRange = vDataMax - vDataMin;
      const minRange = 2; // at least 2 degrees of visual span
      let lo, hi;
      if (rawRange < minRange) {
        const mid = (vDataMax + vDataMin) / 2;
        lo = mid - minRange / 2;
        hi = mid + minRange / 2;
      } else {
        const pad = rawRange * 0.1;
        lo = vDataMin - pad;
        hi = vDataMax + pad;
      }
      const vSpan = (hi - lo) || 1;
      const xy = downsampled.map(p => [
        ((p.t - tMin) / tSpan) * W,
        H - ((p.v - lo) / vSpan) * H
      ]);
      const linePath = xy.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
      const effectiveAreaPath = (style === 'area' || style === 'area-line') ? areaPath : '';
      const effectiveLinePath = (style === 'line' || style === 'area-line') ? linePath : '';

      const gradId = `temp-spark-${side}-${Math.floor(tMax)}`;
      const wrapperStyle = [
        `position:absolute`,
        `left:${leftPx}px`,
        `top:0`,
        `width:${W}px`,
        `height:${H}px`,
        `z-index:0`,
        `pointer-events:none`,
        `opacity:${opacity}`,
        `overflow:hidden`,
      ].join(';');

      return html`<div class="temp-sparkline-wrap" style="${wrapperStyle}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.85"></stop><stop offset="100%" stop-color="${color}" stop-opacity="0"></stop></linearGradient></defs><path d="${effectiveAreaPath}" fill="url(#${gradId})" stroke="none"></path><path d="${effectiveLinePath}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></path></svg></div>`;
    }

    _renderTempPanel() {
      // Phase 5.79b: split thermometer panel. Two vertical columns:
      // left = outdoor (current temp as fill level + forecast-high marker),
      // right = indoor (current temp as fill level). Values + scales come
      // from config; sensors are read synchronously from hass.states (no
      // async/history -- this is a live snapshot, same as every other bubble).
      const e = this.config.entities || {};
      const readNum = (entId) => {
        if (!entId || !this.hass || !this.hass.states[entId]) return null;
        const v = parseFloat(this.hass.states[entId].state);
        return isNaN(v) ? null : v;
      };

      const outId      = e.temp_outdoor || this.config.temp_outdoor_entity || 'sensor.sbht_003c_993b_temperature';
      const inId       = e.temp_indoor  || this.config.temp_indoor_entity  || 'sensor.haus_durchschnittstemperatur';
      const fcHighId   = e.temp_forecast_high || this.config.temp_forecast_high_entity || 'input_number.aussen_forecast_high_today';
      const fcLowId    = e.temp_forecast_low  || this.config.temp_forecast_low_entity  || 'input_number.aussen_forecast_low_today';

      const outVal  = readNum(outId);
      const inVal   = readNum(inId);
      const fcHigh  = readNum(fcHighId);

      // Editable scales (defaults: outdoor -10..40, indoor 10..30).
      const outMin = this.config.temp_outdoor_min !== undefined ? parseFloat(this.config.temp_outdoor_min) : -10;
      const outMax = this.config.temp_outdoor_max !== undefined ? parseFloat(this.config.temp_outdoor_max) : 40;
      const inMin  = this.config.temp_indoor_min  !== undefined ? parseFloat(this.config.temp_indoor_min)  : 10;
      const inMax  = this.config.temp_indoor_max  !== undefined ? parseFloat(this.config.temp_indoor_max)  : 30;

      // Map a temperature to a fill fraction (0..1), clamped.
      const frac = (val, lo, hi) => {
        if (val === null || hi === lo) return 0;
        return Math.max(0, Math.min(1, (val - lo) / (hi - lo)));
      };

      // Column geometry inside the 130px panel. SVG viewBox 130x130.
      // Tube runs y=24 (top) to y=104 (bottom of stem); bulb at y=112.
      const TUBE_TOP = 22, TUBE_BOT = 92, TUBE_H = TUBE_BOT - TUBE_TOP;
      const colY = (fr) => TUBE_BOT - fr * TUBE_H; // higher fraction => higher up

      const outFr = frac(outVal, outMin, outMax);
      const inFr  = frac(inVal,  inMin,  inMax);
      const fcFr  = frac(fcHigh, outMin, outMax);

      const outColor = this.config.temp_outdoor_color || '#378ADD';
      const inColor  = this.config.temp_indoor_color  || '#1D9E75';
      const markColor = this.config.temp_marker_color || '#D85A30';

      const fmt = (v) => (v === null ? '--' : v.toFixed(1) + '°');

      // Precompute per-column geometry. Everything must live INLINE in one
      // html`<svg>` template -- nested html`` fragments interpolated into an
      // SVG render in the HTML namespace and stay invisible (5.79b bug).
      const outFillY = colY(outFr);
      const inFillY  = colY(inFr);
      const outFillH = TUBE_BOT - outFillY;
      const inFillH  = TUBE_BOT - inFillY;
      const fcY = colY(fcFr);

      return html`
        <svg viewBox="0 0 130 130" width="100%" height="100%" style="position:absolute;top:0;left:0;">
          <line x1="65" y1="14" x2="65" y2="108" stroke="#333" stroke-width="1" stroke-dasharray="3 3"></line>
          <text x="32" y="13" text-anchor="middle" fill="#9aa" style="font-size:8px;letter-spacing:1px;">INNEN</text>
          <text x="98" y="13" text-anchor="middle" fill="#9aa" style="font-size:8px;letter-spacing:1px;">AUSSEN</text>

          <rect x="25" y="${TUBE_TOP}" width="14" height="${TUBE_H}" rx="7" fill="#1a2530"></rect>
          <rect x="25" y="${inFillY}" width="14" height="${inFillH}" rx="7" fill="${inColor}"></rect>
          <circle cx="32" cy="100" r="10" fill="${inColor}"></circle>

          <rect x="91" y="${TUBE_TOP}" width="14" height="${TUBE_H}" rx="7" fill="#1a2530"></rect>
          <rect x="91" y="${outFillY}" width="14" height="${outFillH}" rx="7" fill="${outColor}"></rect>
          <circle cx="98" cy="100" r="10" fill="${outColor}"></circle>
          <line x1="84" y1="${fcY}" x2="89" y2="${fcY}" stroke="${markColor}" stroke-width="2.5" opacity="${fcHigh !== null ? 1 : 0}"></line>

          <text x="32" y="123" text-anchor="middle" fill="#fff" style="font-size:13px;font-weight:500;">${fmt(inVal)}</text>
          <text x="98" y="123" text-anchor="middle" fill="#fff" style="font-size:13px;font-weight:500;">${fmt(outVal)}</text>
        </svg>
      `;
    }

    _renderStandardView(entities) {
      // FIX: Default to hidden unless explicitly set to false
      const hideInactive = this.config.hide_inactive_flows !== false;

      const globalFlowRate = this.config.show_flow_rates !== false;

      // FLOW RATE TOGGLES
      const showFlowSolar = this.config.show_flow_rate_solar !== undefined ? this.config.show_flow_rate_solar : globalFlowRate;
      const showFlowGrid = this.config.show_flow_rate_grid !== undefined ? this.config.show_flow_rate_grid : globalFlowRate;
      const showFlowBattery = this.config.show_flow_rate_battery !== undefined ? this.config.show_flow_rate_battery : globalFlowRate;
      const showFlowVenus = this.config.show_flow_rate_venus !== undefined ? this.config.show_flow_rate_venus : globalFlowRate;
      const showFlowConsumer1 = this.config.show_flow_rate_consumer_1 === true;
      const showFlowConsumer2 = this.config.show_flow_rate_consumer_2 === true;
      const showFlowConsumer3 = this.config.show_flow_rate_consumer_3 === true;
      const showFlowConsumer4 = this.config.show_flow_rate_consumer_4 === true;
      const showFlowConsumer5 = this.config.show_flow_rate_consumer_5 === true;
      const showFlowConsumer6 = this.config.show_flow_rate_consumer_6 === true;
      const showFlowConsumer7 = this.config.show_flow_rate_consumer_7 === true;

      // LABEL TOGGLES
      const showLabelSolar = this.config.show_label_solar === true;
      const showLabelGrid = this.config.show_label_grid === true;
      const showLabelBattery = this.config.show_label_battery === true;
      const showLabelVenus = this.config.show_label_venus === true;
      const showLabelHouse = this.config.show_label_house === true;

      const useColoredValues = this.config.use_colored_values === true;
      const showDonut = this.config.show_donut_border === true;
      const showTail = this.config.show_comet_tail === true;
      const showDashedLine = this.config.show_dashed_line === true;
      const showTint = this.config.show_tinted_background === true;
      const hideConsumerIcons = this.config.hide_consumer_icons === true;
      const showNeonGlow = this.config.show_neon_glow !== false;

      // CUSTOM LABELS
      const labelSolarText = this.config.solar_label || this._localize('card.label_solar');
      const labelGridText = this.config.grid_label || this._localize('card.label_grid');
      const labelBatteryText = this.config.battery_label || (entities.battery && this.hass.states[entities.battery] && this.hass.states[entities.battery].state > 0 ? '+' : '-') + " " + this._localize('card.label_battery');
      const labelVenusText = this.config.venus_label || (entities.venus && this.hass.states[entities.venus] && this.hass.states[entities.venus].state > 0 ? '+' : '-') + " " + this._localize('card.label_venus');
      const labelHouseText = this.config.house_label || this._localize('card.label_house');
      // Secondary Sensor für Haus
      const hasSecondaryHouse = !!(entities.secondary_house && entities.secondary_house !== "");
      const getSecondaryVal = (entity) => {
        if (!entity) return '';
        const state = this.hass.states[entity];
        if (!state) return '';
        const val = parseFloat(state.state);
        if (isNaN(val)) return state.state + (state.attributes.unit_of_measurement ? ' ' + state.attributes.unit_of_measurement : '');
        const unit = state.attributes.unit_of_measurement || '';
        if (unit === 'W' || unit === 'Wh') {
          return this._formatPower(val);
        }
        if (unit === 'kWh' || unit === 'kW') {
          return val.toFixed(1) + ' ' + unit;
        }
        return val.toFixed(1) + (unit ? ' ' + unit : '');
      };

      // Resolve secondary sensor color based on entity key
      const getSecondaryColor = (entityKey) => {
        const colorMap = {
          'secondary_solar': '--secondary-solar-color',
          'secondary_grid': '--secondary-grid-color',
          'secondary_battery': '--secondary-battery-color',
          'secondary_venus': '--secondary-venus-color',
          'secondary_house': '--secondary-house-color',
          'secondary_consumer_1': '--secondary-consumer-1-color',
          'secondary_consumer_2': '--secondary-consumer-2-color',
          'secondary_consumer_3': '--secondary-consumer-3-color',
          'secondary_consumer_4': '--secondary-consumer-4-color',
          'secondary_consumer_5': '--secondary-consumer-5-color'
        };
        const cssVar = colorMap[entityKey];
        if (cssVar) {
          const style = getComputedStyle(this);
          return style.getPropertyValue(cssVar).trim() || '#888888';
        }
        return '#888888';
      };

      // CUSTOM ICONS
      const iconSolar = this.config.solar_icon;
      const iconGrid = this.config.grid_icon;
      const iconBattery = this.config.battery_icon;
      const iconVenus = this.config.venus_icon;

      // SECONDARY SENSORS (display only)
      const hasSecondarySolar = !!(entities.secondary_solar && entities.secondary_solar !== "");
      const hasSecondaryGrid = !!(entities.secondary_grid && entities.secondary_grid !== "");
      const hasSecondaryBattery = !!(entities.secondary_battery && entities.secondary_battery !== "");
      const hasSecondaryVenus = !!(entities.secondary_venus && entities.secondary_venus !== "");
      
      // Determine existence of main entities
      const hasSolar = !!(entities.solar && entities.solar !== "");
      const hasGridCombined = !!(entities.grid_combined && entities.grid_combined !== "");
      const hasGrid = !!(entities.grid && entities.grid !== "") || hasGridCombined;
      const hasBattery = !!(entities.battery && entities.battery !== "") && this.config.battery_enabled !== false;
      const hasVenus = !!(entities.venus && entities.venus !== "") && this.config.venus_enabled !== false;

      const styleSolar = hasSolar ? '' : 'display: none;';
      const styleGrid = hasGrid ? '' : 'display: none;';
      const styleBattery = hasBattery ? '' : 'display: none;';

      const textClass = showNeonGlow ? 'flow-text' : 'flow-text no-shadow';

      // Custom Labels for Consumers
      const labelC1 = this.config.consumer_1_label || this._localize('card.label_car');
      const labelC2 = this.config.consumer_2_label || this._localize('card.label_heater');
      const labelC3 = this.config.consumer_3_label || this._localize('card.label_pool');

      const getVal = (entity) => {
        const state = this.hass.states[entity];
        return state ? parseFloat(state.state) || 0 : 0;
      };
      const getValKw = (entity, isKw) => {
        return getVal(entity) * (isKw ? 1000 : 1);
      };
      // Consumer 4 & 5
      let c4Val = entities.consumer_4 ? getValKw(entities.consumer_4, this.config.consumer_4_unit_kw === true) : 0;
      if (this.config.invert_consumer_4) { c4Val *= -1; }
      let c5Val = entities.consumer_5 ? getValKw(entities.consumer_5, this.config.consumer_5_unit_kw === true) : 0;
      if (this.config.invert_consumer_5) { c5Val *= -1; }
      c4Val = Math.abs(c4Val);
      c5Val = Math.abs(c5Val);

      let c1Val = entities.consumer_1 ? getValKw(entities.consumer_1, this.config.consumer_1_unit_kw === true) : 0;
      if (this.config.invert_consumer_1) { c1Val *= -1; }
      c1Val = Math.abs(c1Val);
      let c2Val = entities.consumer_2 ? getValKw(entities.consumer_2, this.config.consumer_2_unit_kw === true) : 0;
      if (this.config.invert_consumer_2) { c2Val *= -1; }
      c2Val = Math.abs(c2Val);
      let c3Val = entities.consumer_3 ? getValKw(entities.consumer_3, this.config.consumer_3_unit_kw === true) : 0;
      if (this.config.invert_consumer_3) { c3Val *= -1; }
      c3Val = Math.abs(c3Val);

      // Consumer 6 & 7 (Phase 5.4 — additional row-2 slots, outer left + right)
      let c6Val = entities.consumer_6 ? getValKw(entities.consumer_6, this.config.consumer_6_unit_kw === true) : 0;
      if (this.config.invert_consumer_6) { c6Val *= -1; }
      let c7Val = entities.consumer_7 ? getValKw(entities.consumer_7, this.config.consumer_7_unit_kw === true) : 0;
      if (this.config.invert_consumer_7) { c7Val *= -1; }
      c6Val = Math.abs(c6Val);
      c7Val = Math.abs(c7Val);

      const alwaysShowConsumer = this.config.show_consumer_always === true;
      // Per-consumer enabled toggle (Phase 5.2+): false disables bubble + pipe entirely,
      // independent of whether an entity is configured. Default true for backward-compat,
      // except c6/c7 which default false (new optional slots, Phase 5.4).
      const c1Enabled = this.config.consumer_1_enabled !== false;
      const c2Enabled = this.config.consumer_2_enabled !== false;
      const c3Enabled = this.config.consumer_3_enabled !== false;
      const c4Enabled = this.config.consumer_4_enabled !== false;
      const c5Enabled = this.config.consumer_5_enabled !== false;
      const c6Enabled = this.config.consumer_6_enabled === true;
      const c7Enabled = this.config.consumer_7_enabled === true;
      const showC1 = c1Enabled && (entities.consumer_1 && (alwaysShowConsumer || Math.round(c1Val) > 0));
      const showC2 = c2Enabled && (entities.consumer_2 && (alwaysShowConsumer || Math.round(c2Val) > 0));
      const showC3 = c3Enabled && (entities.consumer_3 && (alwaysShowConsumer || Math.round(c3Val) > 0));
      const showC4 = c4Enabled && (entities.consumer_4 && (alwaysShowConsumer || Math.round(c4Val) > 0));
      const showC5 = c5Enabled && (entities.consumer_5 && (alwaysShowConsumer || Math.round(c5Val) > 0));
      const showC6 = c6Enabled && (entities.consumer_6 && (alwaysShowConsumer || Math.round(c6Val) > 0));
      const showC7 = c7Enabled && (entities.consumer_7 && (alwaysShowConsumer || Math.round(c7Val) > 0));
      const anyBottomVisible = showC1 || showC2 || showC3 || showC4 || showC5 || showC6 || showC7;

      // Per-consumer pipe-threshold logic (Phase 5.10: previously only c1)
      const hideC1Pipe = this.config.consumer_1_hide_pipe === true;
      const c1PipeThreshold = this.config.consumer_1_pipe_threshold || 0;
      const c1PipeActive = showC1 && (!hideC1Pipe || c1Val >= c1PipeThreshold);
      const hideC2Pipe = this.config.consumer_2_hide_pipe === true;
      const c2PipeThreshold = this.config.consumer_2_pipe_threshold || 0;
      const c2PipeActive = showC2 && (!hideC2Pipe || c2Val >= c2PipeThreshold);
      const hideC3Pipe = this.config.consumer_3_hide_pipe === true;
      const c3PipeThreshold = this.config.consumer_3_pipe_threshold || 0;
      const c3PipeActive = showC3 && (!hideC3Pipe || c3Val >= c3PipeThreshold);
      const hideC4Pipe = this.config.consumer_4_hide_pipe === true;
      const c4PipeThreshold = this.config.consumer_4_pipe_threshold || 0;
      const c4PipeActive = showC4 && (!hideC4Pipe || c4Val >= c4PipeThreshold);
      const hideC5Pipe = this.config.consumer_5_hide_pipe === true;
      const c5PipeThreshold = this.config.consumer_5_pipe_threshold || 0;
      const c5PipeActive = showC5 && (!hideC5Pipe || c5Val >= c5PipeThreshold);
      const hideC6Pipe = this.config.consumer_6_hide_pipe === true;
      const c6PipeThreshold = this.config.consumer_6_pipe_threshold || 0;
      const c6PipeActive = showC6 && (!hideC6Pipe || c6Val >= c6PipeThreshold);
      const hideC7Pipe = this.config.consumer_7_hide_pipe === true;
      const c7PipeThreshold = this.config.consumer_7_pipe_threshold || 0;
      const c7PipeActive = showC7 && (!hideC7Pipe || c7Val >= c7PipeThreshold);

      const solar = hasSolar ? getValKw(entities.solar, this.config.solar_unit_kw === true) : 0;
      const gridCombinedVal = hasGridCombined ? getValKw(entities.grid_combined, this.config.grid_unit_kw === true) : 0;
      const gridMain = hasGridCombined ? gridCombinedVal : (hasGrid ? getValKw(entities.grid, this.config.grid_unit_kw === true) : 0);
      const gridExpSensor = (hasGrid && entities.grid_export) ? getValKw(entities.grid_export, this.config.grid_unit_kw === true) : 0;
      let battery = hasBattery ? getValKw(entities.battery, this.config.battery_unit_kw === true) : 0;
      if (this.config.invert_battery) {
        battery *= -1;
      }
      const battSoc = (hasBattery && entities.battery_soc) ? getVal(entities.battery_soc) : 0;

      let venus = hasVenus ? getValKw(entities.venus, this.config.venus_unit_kw === true) : 0;
      if (this.config.invert_venus) {
        venus *= -1;
      }
      const venusSoc = (hasVenus && entities.venus_soc) ? getVal(entities.venus_soc) : 0;

      // Phase BKW-1: balcony plant (garden PV) as an INDEPENDENT source.
      // The panels feed DC straight into the Venus MPPT inputs, so this energy
      // never passes through entities.solar (which reads the roof-side Shelly).
      // It is therefore deliberately NOT subtracted from solarVal -- unlike the
      // venus_pv_charge path above, which assumes the PV is part of the solar
      // reading and would double-count it here.
      const hasBkw = !!(entities.bkw && entities.bkw !== "") && this.config.bkw_enabled !== false;
      const bkwVal = hasBkw ? Math.max(0, getValKw(entities.bkw, this.config.bkw_unit_kw === true)) : 0;

      const solarVal = Math.max(0, solar);

      let gridImport = 0;
      let gridExport = 0;

      if (hasGrid) {
        if (hasGridCombined) {
          // COMBINED SENSOR: positive = import, negative = export
          gridImport = gridCombinedVal > 0 ? gridCombinedVal : 0;
          gridExport = gridCombinedVal < 0 ? Math.abs(gridCombinedVal) : 0;
        } else if (entities.grid_export && entities.grid_export !== "") {
          gridImport = gridMain > 0 ? gridMain : 0;
          gridExport = Math.abs(gridExpSensor);
        } else {
          gridImport = gridMain > 0 ? gridMain : 0;
          gridExport = gridMain < 0 ? Math.abs(gridMain) : 0;
        }
      }

      // Check for separate battery charge/discharge sensors
      const hasBattChargeSensor = !!(entities.battery_charge && entities.battery_charge !== "");
      const hasBattDischargeSensor = !!(entities.battery_discharge && entities.battery_discharge !== "");

      let batteryCharge = hasBattChargeSensor ? Math.abs(getVal(entities.battery_charge)) : (battery > 0 ? battery : 0);
      let batteryDischarge = hasBattDischargeSensor ? Math.abs(getVal(entities.battery_discharge)) : (battery < 0 ? Math.abs(battery) : 0);

      let solarToBatt = 0;
      let gridToBatt = 0;

      // Battery charge via house toggle
      const batteryChargeViaHouse = this.config.battery_charge_via_house === true;

      if (hasBattery && batteryCharge > 0) {
        const hasGridToBattSensor = !!(entities.grid_to_battery && entities.grid_to_battery !== "");
        if (batteryChargeViaHouse) {
          // Battery charges via house: no direct solar→batt or grid→batt pipes
          solarToBatt = 0;
          gridToBatt = 0;
        } else if (hasGridToBattSensor) {
          // Use dedicated grid-to-battery sensor
          gridToBatt = Math.abs(getVal(entities.grid_to_battery));
          solarToBatt = Math.max(0, batteryCharge - gridToBatt);
        } else {
          // Calculate: solar prioritized
          if (solarVal >= batteryCharge) {
            solarToBatt = batteryCharge;
            gridToBatt = 0;
          } else {
            solarToBatt = solarVal;
            gridToBatt = batteryCharge - solarVal;
          }
        }
      }

      // VENUS charge/discharge (mirrors battery pattern)
      let venusCharge = venus > 0 ? venus : 0;
      let venusDischarge = venus < 0 ? Math.abs(venus) : 0;

      let solarToVenus = 0;
      let gridToVenus = 0;

      // Venus charge via house toggle (mirrors battery_charge_via_house)
      const venusChargeViaHouse = this.config.venus_charge_via_house === true;

      // Venus D topology: dedicated PV-charge sensor (MPPT inputs sit BEHIND the
      // storage, so PV charge is invisible in the AC-side venus register).
      // Takes precedence over the register-based calculation below.
      const hasVenusPvSensor = !!(entities.venus_pv_charge && entities.venus_pv_charge !== "");
      if (hasVenusPvSensor) {
        solarToVenus = Math.min(solarVal, Math.max(0, getVal(entities.venus_pv_charge)));
        gridToVenus = 0;
      } else if (hasVenus && venusCharge > 0) {
        if (venusChargeViaHouse) {
          // Venus charges via house: no direct solar→venus or grid→venus pipes
          solarToVenus = 0;
          gridToVenus = 0;
        } else {
          // Calculate: solar prioritized (PV surplus AFTER batteryCharge goes to venus)
          const solarAfterBatt = Math.max(0, solarVal - solarToBatt);
          if (solarAfterBatt >= venusCharge) {
            solarToVenus = venusCharge;
            gridToVenus = 0;
          } else {
            solarToVenus = solarAfterBatt;
            gridToVenus = venusCharge - solarAfterBatt;
          }
        }
      }

      // Phase BKW-14: split the garden output BEFORE the solar figures, because
      // the export share depends on it.
      //
      // The original line subtracted the whole measured gridExport from
      // solarVal, which silently assumes the roof is the only thing that can
      // export. Once the venus pushes garden energy onto the same AC bus that
      // breaks: at 17:00 the roof made 5269 W, the garden 909 W, the house drew
      // 548 W and 5630 W went to the grid -- yet the card drew 0 W from the
      // roof and 909 W from the garden into a house needing 548 W.
      //
      // Apportion the measured export across both producers by their share of
      // local generation. Neither is "the" exporter; electricity carries no
      // label. Without export this is a no-op and every figure stays as before.
      let bkwPassThrough = Math.min(bkwVal, venusDischarge);
      let bkwToVenus = Math.max(0, bkwVal - bkwPassThrough);
      venusDischarge = Math.max(0, venusDischarge - bkwPassThrough);

      // Phase BKW-16: the venus-side feed covers the house FIRST.
      //
      // bkw-14 apportioned the measured export across both producers by their
      // share of generation. That balanced correctly but assigned the wrong
      // roles: at 17:08 it claimed the roof supplied 507 W to a house drawing
      // 594 W while the garden sent 745 W to the grid.
      //
      // The topology says otherwise. The venus feeds in on the house side,
      // behind the meter, so its energy reaches the loads before anything
      // else; the roof inverter feeds centrally and exports the surplus.
      // SolarEdge confirms it from its own vantage point -- with the house
      // drawing 594 W it reports "load 0.00 kW", because the venus has already
      // covered that draw before it reaches the meter.
      //
      // So: pass-through covers the house up to what the house actually draws,
      // the remainder goes to the grid, and the roof carries what is left of
      // the export. Falls back to the previous proportional split when no
      // house sensor is configured.
      let bkwToGrid = 0;
      let bkwToHouse = bkwPassThrough;
      if (bkwPassThrough > 0 && gridExport > 0) {
        // Phase BKW-17: derive the house demand from the balance, NOT from
        // entities.house.
        //
        // bkw-16 read the configured house sensor. On this system that is a
        // template which drops out roughly every few seconds -- measured over
        // 90s it jumped 2377 / 879 / 0 / 1279 / 0 / 290 / 2539 / 0 / 1301.
        // Feeding that into the split propagated every dropout into all the
        // pipes at once, and the whole card flickered. As a display value the
        // instability was tolerable; as an input it is not.
        //
        // Generation minus export is the same quantity, assembled purely from
        // the shelly and modbus readings, all sampled per second. Verified
        // against the sensor at three points in time: identical to the watt.
        // Phase BKW-18: subtract the generation that is diverted into storage.
        //
        // bkw-17 read solarVal raw. That is correct only while entities.solar
        // reports the inverter's AC OUTPUT -- there the battery charge is
        // already netted out by the meter. As soon as entities.solar reports
        // the actual roof PRODUCTION, the charge is still contained in it and
        // houseNeed comes out too high by exactly the charging power.
        //
        // Simulated against the extracted block: roof 5269 W, LG charging
        // 1000 W, garden 909 W, export 4630 W, house 548 W. Raw solarVal gave
        // houseNeed 1548 W, so bkwToHouse became 909 W instead of 548 W and
        // the pipe sum claimed 909 W against a 548 W house bubble -- a 361 W
        // contradiction inside one card. With the two terms subtracted the
        // figure is 548 W and the split is 548 W house / 361 W grid.
        //
        // Verified as a no-op for the AC-output configuration across seven
        // operating states, so this can ship ahead of any entity change.
        const houseNeed = Math.max(0, solarVal - solarToBatt - solarToVenus + bkwPassThrough + venusDischarge + gridImport - gridExport);
        bkwToHouse = Math.min(bkwPassThrough, houseNeed);
        bkwToGrid = Math.max(0, bkwPassThrough - bkwToHouse);
      }
      const solarExportShare = Math.max(0, gridExport - bkwToGrid);

      let solarToHouse = Math.max(0, solarVal - solarToBatt - solarToVenus - solarExportShare);
      let gridToHouse = Math.max(0, gridImport - gridToBatt);

      const house = solarToHouse + gridToHouse + batteryDischarge + venusDischarge + bkwToHouse;

      // Demo mode: override all pipe flow values to 1000W for testing/positioning labels.
      // Bubble main values (solar/grid/battery/venus/SoC) remain real - only pipe flows are faked.
      if (this.config.demo_mode === true) {
        solarToHouse = 1000;
        gridToHouse = 1000;
        batteryDischarge = 1000;
        batteryCharge = 1000;
        venusDischarge = 1000;
        venusCharge = 1000;
        solarToBatt = 1000;
        solarToVenus = 1000;
        gridExport = 1000;
        c1Val = 1000;
        c2Val = 1000;
        c3Val = 1000;
        c4Val = 1000;
        c5Val = 1000;
        c6Val = 1000;
        c7Val = 1000;
      }

      // Use house entity for display if defined, otherwise use calculated value
      const houseDisplay = (entities.house && entities.house !== "") ? getVal(entities.house) : house;

      // Solar→Batt arc visibility — consistent with other pipes (only check entity config)
      const styleSolarBatt = (hasSolar && hasBattery && !this.config.hide_solar_to_battery_pipe) ? '' : 'display: none;';

      // Venus pipe visibility (mirrors battery pattern)
      const styleVenus = hasVenus ? '' : 'display: none;';
      const styleSolarVenus = (hasSolar && hasVenus && !this.config.hide_solar_to_venus_pipe) ? '' : 'display: none;';

      const hasTopRow = hasSolar || hasGrid || hasBattery;
      const topShift = !hasTopRow ? 190 : 0;
      const anyRow2Visible = showC4 || showC5 || showC6 || showC7;
      let baseHeight = anyRow2Visible ? 620 : (anyBottomVisible ? 520 : 340);
      const contentHeight = baseHeight - topShift;

      const designWidth = 800;
      // Phase A1.4: in side-panels mode the center column has a FIXED width =
      // host - 2*panelW - 2*gap. Subtract the same reserve here so the card
      // scales to fit the center. _cardWidth is the HOST width (stable, never
      // circular), so this is a closed calculation: panels + center == host.
      const measuredWidth = this._cardWidth || designWidth;
      const sidePanelsOn = this.config.side_panels_enabled === true;
      const sidePanelWidth = this.config.side_panel_width !== undefined ? this.config.side_panel_width : 320;
      const sidePanelGap = this.config.side_panel_gap !== undefined ? this.config.side_panel_gap : 40;
      // Responsive collapse: when the two panels + a usable center (>= half the
      // design width) no longer fit the host, stack panels full-width instead of
      // forcing a 3-column grid that overflows on mobile. Same threshold as the
      // render() grid so layout and scale always agree. Stacked -> no reserve,
      // the flow fills the full width.
      const sidePanelsStacked = sidePanelsOn && ((this._cardWidth || 1200) - (2 * sidePanelWidth + 2 * sidePanelGap) < designWidth * 0.5);
      const sidePanelReserve = (sidePanelsOn && !sidePanelsStacked) ? (2 * sidePanelWidth + 2 * sidePanelGap) : 0;
      // Stacked: the flow owns the full width, so fit it exactly (no 0.5-floor,
      // which would otherwise force 400px and overflow a ~380px phone by 20px).
      const availableWidth = sidePanelsStacked
        ? measuredWidth
        : Math.max(designWidth * 0.5, measuredWidth - sidePanelReserve);
      const userZoom = this.config.zoom !== undefined ? this.config.zoom : 0.9;
      // Phase A1.9: zoom is now a DIRECT scale factor with one stable meaning in
      // BOTH modes: zoom 1.0 == design surface 1:1 (the 800px layout renders at
      // 800px on screen). Previously scale = baseScale * zoom, where baseScale
      // (availableWidth/800) auto-inflated the layout to fill the container and
      // zoom only corrected afterwards -- so the same visual size needed
      // different zoom values with vs. without panels (verified: 0.5 vs 1.0 for
      // this user). Decoupling baseScale makes zoom predictable and portable.
      // NOTE: full-bleed dashboards tuned to the old behaviour need a one-time
      // zoom adjustment (old 0.5 ~= new 1.0).
      let scale = userZoom;

      // Lower bound kept at 0.5 to prevent unreadably small layouts.
      if (scale < 0.5) scale = 0.5;

      if (sidePanelsOn) {
        // Phase A1.5/A1.9: in side-panels mode the visual MUST fit inside the
        // center column. Cap scale so visualWidth <= availableWidth.
        const centerFitScale = availableWidth / designWidth;
        if (scale > centerFitScale) scale = centerFitScale;
      } else {
        // No-panels: fit the visual to the real host width so a wide 800px
        // layout never overflows a narrow cell (mobile). Shrink below the zoom
        // floor only as far as needed to fit; never inflate above the user's
        // zoom on wide screens (so zoom>1 vertical overflow is preserved). No
        // horizontal scroll is introduced, so ha-card overflow:visible (used by
        // the mix-rings extending beyond bubbles) stays intact.
        const fitScale = measuredWidth / designWidth;
        if (fitScale < scale) scale = fitScale;
      }

      const finalCardHeightPx = contentHeight * scale;
      const visualWidth = 800 * scale;
      const centerMarginLeft = Math.max(0, (availableWidth - visualWidth) / 2);
      
      // Phase 5.40: card background padding is now fully manual via 4 sliders.
      // The previous auto-calculation tried to derive padding from card_offset
      // and bubble_size, but the result was visually unsatisfying because the
      // scale transform, the centerMarginLeft already in place, and the
      // dashboard column width all interact in ways the formula couldn't fully
      // anticipate. Letting the user set the padding directly is more honest
      // and predictable. Default 0 on all four = upstream behaviour preserved.
      const padTop    = this.config.background_padding_top    !== undefined ? this.config.background_padding_top    : 0;
      const padBottom = this.config.background_padding_bottom !== undefined ? this.config.background_padding_bottom : 0;
      const padLeft   = this.config.background_padding_left   !== undefined ? this.config.background_padding_left   : 0;
      const padRight  = this.config.background_padding_right  !== undefined ? this.config.background_padding_right  : 0;
      const finalCardBackgroundHeightPx = finalCardHeightPx + padTop + padBottom;

      let houseGradientVal = '';
      let houseTextCol = useColoredValues ? 'var(--neon-pink)' : '';
      const tintClass = showTint ? 'tinted' : '';
      const glowClass = showNeonGlow ? 'glow' : '';

      let houseDominantColor = 'var(--neon-pink)';
      if (house > 0) {
        if (solarToHouse >= gridToHouse && solarToHouse >= batteryDischarge) {
          houseDominantColor = 'var(--neon-yellow)';
        } else if (gridToHouse >= solarToHouse && gridToHouse >= batteryDischarge) {
          houseDominantColor = 'var(--neon-blue)';
        } else if (batteryDischarge >= solarToHouse && batteryDischarge >= gridToHouse) {
          houseDominantColor = 'var(--neon-green)';
        }
      }

      if (showDonut) {
        // Tages-Mix-Modus: aktiv wenn donut_today_mode==true UND mindestens ein Tages-Sensor konfiguriert
        const donutTodayMode = this.config.donut_today_mode === true;
        const todaySolarEnt = entities.donut_today_solar;
        const todayBatteryEnt = entities.donut_today_battery;
        const todayVenusEnt = entities.donut_today_venus;
        const todayGridEnt = entities.donut_today_grid;
        const hasAnyTodaySensor = !!(todaySolarEnt || todayBatteryEnt || todayVenusEnt || todayGridEnt);
        const useTodayMode = donutTodayMode && hasAnyTodaySensor;

        if (useTodayMode) {
          // 4-Segment Tages-Mix mit Bubble-Farben
          const safeRead = (ent) => {
            if (!ent || ent === "") return 0;
            const v = parseFloat(getVal(ent));
            return isNaN(v) || v < 0 ? 0 : v;
          };
          const todaySolar = safeRead(todaySolarEnt);
          const todayBattery = safeRead(todayBatteryEnt);
          const todayVenus = safeRead(todayVenusEnt);
          const todayGrid = safeRead(todayGridEnt);
          const todayTotal = todaySolar + todayBattery + todayVenus + todayGrid;

          if (todayTotal > 0) {
            const pctSolar = (todaySolar / todayTotal) * 100;
            const pctBatt = (todayBattery / todayTotal) * 100;
            const pctVenus = (todayVenus / todayTotal) * 100;
            const pctGrid = (todayGrid / todayTotal) * 100;

            let stops = [];
            let current = 0;
            if (pctSolar > 0) { stops.push(`var(--pipe-solar-color) ${current}% ${current + pctSolar}%`); current += pctSolar; }
            if (pctBatt > 0) { stops.push(`var(--pipe-battery-color) ${current}% ${current + pctBatt}%`); current += pctBatt; }
            if (pctVenus > 0) { stops.push(`var(--pipe-venus-color) ${current}% ${current + pctVenus}%`); current += pctVenus; }
            if (pctGrid > 0) { stops.push(`var(--pipe-grid-color) ${current}% 100%`); }

            houseGradientVal = `conic-gradient(from 330deg, ${stops.join(', ')})`;

            if (useColoredValues) {
              const maxVal = Math.max(todaySolar, todayBattery, todayVenus, todayGrid);
              if (maxVal === todaySolar) houseTextCol = 'var(--pipe-solar-color)';
              else if (maxVal === todayBattery) houseTextCol = 'var(--pipe-battery-color)';
              else if (maxVal === todayVenus) houseTextCol = 'var(--pipe-venus-color)';
              else if (maxVal === todayGrid) houseTextCol = 'var(--pipe-grid-color)';
            }
          } else {
            // Tages-Total = 0 (z.B. nach Mitternacht-Reset): neutraler Donut
            houseGradientVal = `var(--neon-pink)`;
            houseTextCol = useColoredValues ? 'var(--neon-pink)' : '';
          }
        } else if (house > 0) {
          // Live-Modus: 4 Segmente (PV/LG/Venus/Netz) mit Bubble-Farben.
          // Konsistent zum Tages-Mix-Modus, nur basierend auf momentanen Leistungswerten
          // statt Tages-kWh. Vor Phase 4.16 fehlte hier das Venus-Segment komplett.
          const pctSolar = (solarToHouse / house) * 100;
          const pctBatt = (batteryDischarge / house) * 100;
          const pctVenus = (venusDischarge / house) * 100;
          const pctGrid = (gridToHouse / house) * 100;

          let stops = [];
          let current = 0;
          if (pctSolar > 0) { stops.push(`var(--pipe-solar-color) ${current}% ${current + pctSolar}%`); current += pctSolar; }
          if (pctBatt > 0) { stops.push(`var(--pipe-battery-color) ${current}% ${current + pctBatt}%`); current += pctBatt; }
          if (pctVenus > 0) { stops.push(`var(--pipe-venus-color) ${current}% ${current + pctVenus}%`); current += pctVenus; }
          if (pctGrid > 0) { stops.push(`var(--pipe-grid-color) ${current}% 100%`); }

          houseGradientVal = `conic-gradient(from 330deg, ${stops.join(', ')})`;

          if (useColoredValues) {
            const maxVal = Math.max(solarToHouse, batteryDischarge, venusDischarge, gridToHouse);
            if (maxVal > 0) {
              if (maxVal === solarToHouse) houseTextCol = 'var(--pipe-solar-color)';
              else if (maxVal === batteryDischarge) houseTextCol = 'var(--pipe-battery-color)';
              else if (maxVal === venusDischarge) houseTextCol = 'var(--pipe-venus-color)';
              else if (maxVal === gridToHouse) houseTextCol = 'var(--pipe-grid-color)';
            } else {
              houseTextCol = 'var(--neon-pink)';
            }
          }
        } else {
          houseGradientVal = `var(--neon-pink)`;
          houseTextCol = useColoredValues ? 'var(--neon-pink)' : '';
        }
      } else {
        houseTextCol = useColoredValues ? 'var(--neon-pink)' : '';
      }

      // --- House Self-Sufficiency (Autarkie) Mix Ring (Phase 5.74) ---
      // SECOND ring around the existing consumption-origin donut. Whereas the
      // donut answers "where did the consumed energy come from" (4 segments),
      // this answers the higher-level "how autark am I" question: self-supply
      // (PV direct + LG + Venus) vs grid import. 2 segments.
      //
      // Activated by:
      //   house_mix_donut_mode (editor toggle, off by default)
      //   house_mix_period ('day' | 'month' | 'year', default 'day')
      // Reads:
      //   house_mix_self_{day,month,year}  -- self-supplied kWh
      //   house_mix_grid_{day,month,year}  -- grid-imported kWh
      // Renders only if total > 0.
      let houseMixGradientVal = '';
      let houseMixActive = false;
      
      if (this.config.house_mix_donut_mode === true) {
        const period = (this.config.house_mix_period === 'month' || this.config.house_mix_period === 'year')
          ? this.config.house_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const self_ = readVal(`house_mix_self_${period}`);
        const grid  = readVal(`house_mix_grid_${period}`);
        const total = self_ + grid;
        if (total > 0) {
          const pctSelf = (self_ / total) * 100;
          const pctGrid = (grid  / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.84: per-segment colors editor-configurable.
          // Defaults match the original look (solar-color for self-supply,
          // grid-color for grid-import).
          const colSelf = this.config.house_mix_color_self || 'var(--pipe-solar-color)';
          const colGrid = this.config.house_mix_color_grid || 'var(--pipe-grid-color)';
          if (pctSelf > 0) { stops.push(`${colSelf} ${cursor}% ${cursor + pctSelf}%`); cursor += pctSelf; }
          if (pctGrid > 0) { stops.push(`${colGrid} ${cursor}% 100%`); }
          houseMixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          houseMixActive = true;
        }
      }

      const houseTintStyle = showTint
        ? `background: color-mix(in srgb, ${houseDominantColor}, transparent 85%);`
        : '';

      const houseGlowStyle = showNeonGlow
        ? `box-shadow: 0 0 15px color-mix(in srgb, ${houseDominantColor}, transparent 60%);`
        : `box-shadow: none;`;

      // Phase 5.74: optional autarky mix-ring style vars, independent of the
      // origin donut -- either can be on/off solo or together.
      const houseMixGap = parseInt(this.config.house_mix_gap !== undefined ? this.config.house_mix_gap : 8, 10);
      const houseMixThk = parseInt(this.config.house_mix_thickness !== undefined ? this.config.house_mix_thickness : 4, 10);
      const houseMixStyle = houseMixActive
        ? `--house-mix-gradient: ${houseMixGradientVal}; --house-mix-gap: ${houseMixGap}px; --house-mix-thickness: ${houseMixThk}px;`
        : '';
      const houseBubbleStyle = `${showDonut ? `--house-gradient: ${houseGradientVal};` : ''} ${houseMixStyle} ${houseTintStyle} ${houseGlowStyle}`;

      const isSolarActive = Math.round(solarVal) > 0;
      const isGridActive = Math.round(gridImport) > 0 || Math.round(gridExport) > 0;
      const isGridExporting = Math.round(gridExport) > 0 && Math.round(gridImport) === 0;

      // --- Grid Donut Gradient ---
      // Two modes:
      //   1. Tages-Mix (Phase 5.21): if grid_donut_today_mode=true AND
      //      at least one of import/export sensors is set, build a 2-segment
      //      donut showing today's import vs export ratio. This is the
      //      Sunsynk-inspired "how did the grid balance look today" view.
      //   2. Live-Modus (legacy): if showDonut (= global show_donut_border)
      //      is true and grid is currently active, build the existing
      //      live-flow donut (grid->house / grid->battery / export).
      // Tages-Mix is independent of show_donut_border so users can have
      // the grid donut without the house donut.
      let gridGradientVal = '';
      let gridDonutActive = false;
      
      const gridDonutTodayMode = this.config.grid_donut_today_mode === true;
      const gridImportTodayEnt = entities.grid_donut_import_today;
      const gridExportTodayEnt = entities.grid_donut_export_today;
      const hasGridDonutTodaySensor = !!((gridImportTodayEnt && gridImportTodayEnt !== "") || (gridExportTodayEnt && gridExportTodayEnt !== ""));
      
      if (hasGrid && gridDonutTodayMode && hasGridDonutTodaySensor) {
        // Phase 5.21: Tages-Mix mode -- 2 segments (import / export)
        const safeRead = (ent) => {
          if (!ent || ent === "") return 0;
          const v = parseFloat(getVal(ent));
          return isNaN(v) || v < 0 ? 0 : v;
        };
        const importToday = safeRead(gridImportTodayEnt);
        const exportToday = safeRead(gridExportTodayEnt);
        const totalToday = importToday + exportToday;
        
        if (totalToday > 0) {
          const pctImport = (importToday / totalToday) * 100;
          const pctExport = (exportToday / totalToday) * 100;
          let stops = [];
          let current = 0;
          if (pctImport > 0) { stops.push(`var(--pipe-grid-color) ${current}% ${current + pctImport}%`); current += pctImport; }
          if (pctExport > 0) { stops.push(`var(--export-color) ${current}% 100%`); }
          gridGradientVal = `conic-gradient(from 330deg, ${stops.join(', ')})`;
        } else {
          // Mitternachts-Schutz: beide Sensoren 0 -> neutraler Ring in Grid-Farbe
          gridGradientVal = 'var(--pipe-grid-color)';
        }
        gridDonutActive = true;
      } else if (showDonut && hasGrid && isGridActive) {
        // Legacy Live-Modus -- only active when global show_donut_border is on
        const gridTotal = gridToHouse + gridToBatt + gridExport;
        if (gridTotal > 0) {
          const gPctToHouse = (gridToHouse / gridTotal) * 100;
          const gPctToBatt = (gridToBatt / gridTotal) * 100;
          const gPctExport = (gridExport / gridTotal) * 100;
          let gStops = [];
          let gCurrent = 0;
          if (gPctToHouse > 0) { gStops.push(`var(--neon-blue) ${gCurrent}% ${gCurrent + gPctToHouse}%`); gCurrent += gPctToHouse; }
          if (gPctToBatt > 0) { gStops.push(`var(--neon-green) ${gCurrent}% ${gCurrent + gPctToBatt}%`); gCurrent += gPctToBatt; }
          if (gPctExport > 0) { gStops.push(`var(--export-color) ${gCurrent}% ${gCurrent + gPctExport}%`); gCurrent += gPctExport; }
          if (gCurrent < 99.9) { gStops.push(`var(--neon-blue) ${gCurrent}% 100%`); }
          gridGradientVal = `conic-gradient(from 330deg, ${gStops.join(', ')})`;
        } else {
          gridGradientVal = isGridExporting ? 'var(--export-color)' : 'var(--neon-blue)';
        }
        gridDonutActive = true;
      }

      // --- Grid Import/Export Balance Mix Ring (Phase 5.73) ---
      // SECOND ring around the existing Grid Tages-Mix donut. Semantics
      // differ from LG/Venus (which answer "where did charge come from",
      // 2 segments PV+Grid) and from Solar (which answers "where did PV
      // go", 4 segments): for Grid the question is "wie ist meine
      // Netz-Bilanz?" -- 2 segments Import vs Export.
      //
      // Activated by:
      //   grid_mix_donut_mode (editor toggle, off by default)
      //   grid_mix_period ('day' | 'month' | 'year', default 'day')
      // Reads:
      //   grid_mix_{import,export}_{day,month,year}
      // Renders only if total > 0 (no division by zero, no inert ring).
      let gridMixGradientVal = '';
      let gridMixActive = false;
      
      if (this.config.grid_mix_donut_mode === true) {
        const period = (this.config.grid_mix_period === 'month' || this.config.grid_mix_period === 'year')
          ? this.config.grid_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const importVal = readVal(`grid_mix_import_${period}`);
        const exportVal = readVal(`grid_mix_export_${period}`);
        const total = importVal + exportVal;
        if (total > 0) {
          const pctImport = (importVal / total) * 100;
          const pctExport = (exportVal / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.84: per-segment colors editor-configurable.
          // Defaults: grid-color for import (red), export-color/solar for export.
          const colImport = this.config.grid_mix_color_import || 'var(--pipe-grid-color)';
          const colExport = this.config.grid_mix_color_export || 'var(--export-color, var(--pipe-solar-color))';
          if (pctImport > 0) { stops.push(`${colImport} ${cursor}% ${cursor + pctImport}%`); cursor += pctImport; }
          if (pctExport > 0) { stops.push(`${colExport} ${cursor}% 100%`); }
          gridMixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          gridMixActive = true;
        }
      }

      // --- PV Donut Gradient (Phase 5.23) ---
      // Visualizes today's forecast progress: how much of the day's expected
      // production has already been generated.
      //   Yellow segment: produced / forecast * 100 (capped at 100)
      //   Grey rest:      remainder up to 100%
      // Morning: ring nearly all yellow (= "lots of sun coming")
      // Midday:  ring half yellow / half grey (= "halfway through forecast")
      // Evening: ring almost all grey or full yellow (= "almost done" / "fully done")
      let solarGradientVal = '';
      let solarDonutActive = false;
      
      const pvDonutMode = this.config.pv_donut_today_mode === true;
      const pvProducedEnt = entities.pv_donut_produced_today;
      const pvForecastEnt = entities.pv_donut_forecast_today;
      const hasPvDonutSensors = !!((pvProducedEnt && pvProducedEnt !== "") && (pvForecastEnt && pvForecastEnt !== ""));
      
      if (hasSolar && pvDonutMode && hasPvDonutSensors) {
        const safeRead = (ent) => {
          if (!ent || ent === "") return 0;
          const v = parseFloat(getVal(ent));
          return isNaN(v) || v < 0 ? 0 : v;
        };
        const produced = safeRead(pvProducedEnt);
        const remaining = safeRead(pvForecastEnt);
        const total = produced + remaining;
        
        // Phase 5.30: forecast sensor is interpreted as "remaining forecast for
        // today" (what's still expected), not as "total expected for today".
        // This matches the semantics of evcc's `today.energy` field, which is
        // continuously refined throughout the day to mean "remaining from now
        // until end-of-day" -- i.e. it shrinks as production happens.
        //
        // Donut shows: yellow = remaining, grey = already harvested.
        //   remaining_pct = remaining / (produced + remaining)
        //   harvested_pct = produced  / (produced + remaining)
        //
        // Morning:  produced=0, remaining=60 -> 100% yellow ("60 kWh ahead")
        // Midday:   produced=30, remaining=30 -> 50% yellow ("30 still to come")
        // Evening:  produced=60, remaining=0.5 -> ~1% yellow ("nearly done")
        // Done:     produced=60, remaining=0 -> donut off (see below)
        //
        // This formulation is self-stabilizing: if evcc revises its forecast
        // downward when the day turns out worse than expected, the visualization
        // adjusts smoothly because we always compare against the LIVE total.
        const PRODUCED_MIN_KWH = 0.1;
        const REMAINING_MIN_KWH = 0.05;
        
        if (total >= PRODUCED_MIN_KWH) {
          if (remaining < REMAINING_MIN_KWH) {
            // Day is essentially done -- nothing meaningful left to forecast.
            // Disable donut, fall back to plain yellow border.
            // (No conic-gradient needed.)
          } else {
            const remainingPct = (remaining / total) * 100;
            const harvestedPct = 100 - remainingPct;
            
            let stops = [];
            let current = 0;
            if (remainingPct > 0) { stops.push(`var(--pipe-solar-color) ${current}% ${current + remainingPct}%`); current += remainingPct; }
            if (harvestedPct > 0) { stops.push(`var(--solar-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
            solarGradientVal = `conic-gradient(from 330deg, ${stops.join(', ')})`;
            solarDonutActive = true;
          }
        } else if (remaining >= REMAINING_MIN_KWH) {
          // Pre-sunrise / midnight reset: produced ~0, but a remaining forecast
          // exists. Show 100% yellow ring (whole day's forecast still ahead).
          solarGradientVal = 'var(--pipe-solar-color)';
          solarDonutActive = true;
        }
        // else: both essentially zero -> donut off, normal yellow border.
      }

      // Phase BKW-6: production ring for the garden plant. Deliberately mirrors
      // the solar donut above, INCLUDING its semantics: the forecast entity
      // carries what is STILL expected today, not the daily total. Feeding a
      // daily total in here would show ~50% remaining at dusk on a finished
      // day. Use a "*_remaining"-style sensor.
      let bkwGradientVal = '';
      let bkwDonutActive = false;

      const bkwDonutMode = this.config.bkw_donut_today_mode === true;
      const bkwProducedEnt = entities.bkw_donut_produced_today;
      const bkwForecastEnt = entities.bkw_donut_forecast_today;
      const hasBkwDonutSensors = !!((bkwProducedEnt && bkwProducedEnt !== "") && (bkwForecastEnt && bkwForecastEnt !== ""));

      if (hasBkw && bkwDonutMode && hasBkwDonutSensors) {
        const safeReadBkw = (ent) => {
          if (!ent || ent === "") return 0;
          const v = parseFloat(getVal(ent));
          return isNaN(v) || v < 0 ? 0 : v;
        };
        const bkwProduced = safeReadBkw(bkwProducedEnt);
        const bkwRemaining = safeReadBkw(bkwForecastEnt);
        const bkwTotal = bkwProduced + bkwRemaining;

        const BKW_PRODUCED_MIN_KWH = 0.1;
        const BKW_REMAINING_MIN_KWH = 0.05;

        if (bkwTotal >= BKW_PRODUCED_MIN_KWH) {
          if (bkwRemaining >= BKW_REMAINING_MIN_KWH) {
            const bkwRemainingPct = (bkwRemaining / bkwTotal) * 100;
            const bkwHarvestedPct = 100 - bkwRemainingPct;
            let bkwStops = [];
            let bkwCurrent = 0;
            if (bkwRemainingPct > 0) { bkwStops.push(`var(--pipe-solar-color) ${bkwCurrent}% ${bkwCurrent + bkwRemainingPct}%`); bkwCurrent += bkwRemainingPct; }
            if (bkwHarvestedPct > 0) { bkwStops.push(`var(--solar-donut-rest-color, rgba(160, 160, 160, 0.7)) ${bkwCurrent}% 100%`); }
            bkwGradientVal = `conic-gradient(from 330deg, ${bkwStops.join(', ')})`;
            bkwDonutActive = true;
          }
          // else: day essentially done -> ring off, plain border.
        } else if (bkwRemaining >= BKW_REMAINING_MIN_KWH) {
          // Pre-sunrise: nothing harvested yet, whole day still ahead.
          bkwGradientVal = 'var(--pipe-solar-color)';
          bkwDonutActive = true;
        }
      }

      // --- Solar PV-Distribution Mix Ring (Phase 5.72) ---
      // SECOND ring around the PV-forecast donut. Unlike LG/Venus mix-rings
      // (which answer "where did my stored energy come from?", 2 segments
      // PV+Grid), this answers "where did my PV energy go?": 4 segments
      // House (direct consumption), LG, Venus, Grid (export). All four are
      // real destinations for a PV system with two batteries and grid feed-in.
      //
      // Activated by:
      //   solar_mix_donut_mode (editor toggle, off by default)
      //   solar_mix_period ('day' | 'month' | 'year', default 'day')
      // Reads:
      //   solar_mix_{house,lg,venus,grid}_{day,month,year}
      // Renders only if total > 0.
      let solarMixGradientVal = '';
      let solarMixActive = false;
      
      if (this.config.solar_mix_donut_mode === true) {
        const period = (this.config.solar_mix_period === 'month' || this.config.solar_mix_period === 'year')
          ? this.config.solar_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const house = readVal(`solar_mix_house_${period}`);
        const lg    = readVal(`solar_mix_lg_${period}`);
        const venus = readVal(`solar_mix_venus_${period}`);
        const grid  = readVal(`solar_mix_grid_${period}`);
        const total = house + lg + venus + grid;
        if (total > 0) {
          const pctHouse = (house / total) * 100;
          const pctLg    = (lg    / total) * 100;
          const pctVenus = (venus / total) * 100;
          const pctGrid  = (grid  / total) * 100;
          
          // Phase 5.84: per-segment colors editor-configurable.
          // Defaults match the destination's bubble colour. House uses
          // --pipe-house-color (falls back to neon-pink). LG = battery,
          // Venus = venus, Grid = grid.
          const colHouse = this.config.solar_mix_color_house || 'var(--pipe-house-color, var(--neon-pink))';
          const colLg    = this.config.solar_mix_color_lg    || 'var(--pipe-battery-color)';
          const colVenus = this.config.solar_mix_color_venus || 'var(--pipe-venus-color)';
          const colGrid  = this.config.solar_mix_color_grid  || 'var(--pipe-grid-color)';
          let stops = [];
          let cursor = 0;
          if (pctHouse > 0) { stops.push(`${colHouse} ${cursor}% ${cursor + pctHouse}%`); cursor += pctHouse; }
          if (pctLg > 0)    { stops.push(`${colLg} ${cursor}% ${cursor + pctLg}%`); cursor += pctLg; }
          if (pctVenus > 0) { stops.push(`${colVenus} ${cursor}% ${cursor + pctVenus}%`); cursor += pctVenus; }
          if (pctGrid > 0)  { stops.push(`${colGrid} ${cursor}% 100%`); }
          solarMixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          solarMixActive = true;
        }
      }

      // --- Battery SoC Donut Gradient (Phase 5.36) ---
      // Visualizes the LG battery's State of Charge as a coloured ring.
      //   Filled segment   = battery pipe colour (default: --pipe-battery-color)
      //   Remaining segment = neutral grey
      // 75% SoC -> 75% coloured / 25% grey, like a smartphone battery indicator.
      //
      // Activated by:
      //   battery_soc_donut_mode (editor toggle, off by default)
      // Reads:
      //   entities.battery_soc (already configured for the SoC live display)
      //
      // If SoC sensor missing/unavailable, the donut stays off and the bubble
      // keeps its plain border.
      let batteryGradientVal = '';
      let batteryDonutActive = false;
      
      if (hasBattery && this.config.battery_soc_donut_mode === true && entities.battery_soc) {
        const socRaw = parseFloat(getVal(entities.battery_soc));
        if (!isNaN(socRaw) && socRaw >= 0) {
          const socClamped = Math.max(0, Math.min(100, socRaw));
          const restPct = 100 - socClamped;
          
          let stops = [];
          let current = 0;
          if (socClamped > 0) { stops.push(`var(--pipe-battery-color) ${current}% ${current + socClamped}%`); current += socClamped; }
          if (restPct > 0) { stops.push(`var(--battery-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          batteryGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          batteryDonutActive = true;
        }
      }

      // --- LG / Battery Charge-Source Mix Ring (Phase 5.68) ---
      // SECOND ring around the LG SoC donut. Shows where LG's stored energy
      // came from over the chosen period. Unlike consumer mix-rings (4 segments
      // PV/LG/Venus/Grid), this is a SOURCE bubble so the answer is simpler:
      // LG can be charged only from PV or from Grid -- never from itself or
      // from Venus. So only 2 segments and 2 input sensors per period.
      //
      // Activated by:
      //   battery_mix_donut_mode (editor toggle, off by default)
      //   battery_mix_period ('day' | 'month' | 'year', default 'day')
      // Reads:
      //   battery_mix_{pv,grid}_{day,month,year}
      // Renders only if total > 0 (no division by zero, no inert ring).
      let batteryMixGradientVal = '';
      let batteryMixActive = false;
      
      if (this.config.battery_mix_donut_mode === true) {
        const period = (this.config.battery_mix_period === 'month' || this.config.battery_mix_period === 'year')
          ? this.config.battery_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv   = readVal(`battery_mix_pv_${period}`);
        const grid = readVal(`battery_mix_grid_${period}`);
        const total = pv + grid;
        if (total > 0) {
          const pctPv   = (pv   / total) * 100;
          const pctGrid = (grid / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.84: per-segment colors editor-configurable.
          // Defaults: solar-color for PV charging, grid-color for grid charging.
          const colPv   = this.config.battery_mix_color_pv   || 'var(--pipe-solar-color)';
          const colGrid = this.config.battery_mix_color_grid || 'var(--pipe-grid-color)';
          if (pctPv > 0)   { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`); cursor += pctPv; }
          if (pctGrid > 0) { stops.push(`${colGrid} ${cursor}% 100%`); }
          batteryMixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          batteryMixActive = true;
        }
      }

      // --- Venus SoC Donut Gradient (Phase 5.37) ---
      // Identical pattern to the battery donut. Activated by venus_soc_donut_mode.
      let venusGradientVal = '';
      let venusDonutActive = false;
      
      if (hasVenus && this.config.venus_soc_donut_mode === true && entities.venus_soc) {
        const socRaw = parseFloat(getVal(entities.venus_soc));
        if (!isNaN(socRaw) && socRaw >= 0) {
          const socClamped = Math.max(0, Math.min(100, socRaw));
          const restPct = 100 - socClamped;
          
          let stops = [];
          let current = 0;
          if (socClamped > 0) { stops.push(`var(--pipe-venus-color) ${current}% ${current + socClamped}%`); current += socClamped; }
          if (restPct > 0) { stops.push(`var(--venus-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          venusGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          venusDonutActive = true;
        }
      }

      // --- Venus Charge-Source Mix Ring (Phase 5.70) ---
      // SECOND ring around the Venus SoC donut. Mirror of LG mix-ring
      // (Phase 5.68) -- identical semantics: 2 segments (PV + Grid)
      // because Venus is also a SOURCE bubble that can only be charged
      // from PV or Grid. User confirmed: identical to LG.
      //
      // Activated by:
      //   venus_mix_donut_mode (editor toggle, off by default)
      //   venus_mix_period ('day' | 'month' | 'year', default 'day')
      // Reads:
      //   venus_mix_{pv,grid}_{day,month,year}
      // Renders only if total > 0 (no division by zero, no inert ring).
      let venusMixGradientVal = '';
      let venusMixActive = false;
      
      if (this.config.venus_mix_donut_mode === true) {
        const period = (this.config.venus_mix_period === 'month' || this.config.venus_mix_period === 'year')
          ? this.config.venus_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv   = readVal(`venus_mix_pv_${period}`);
        const grid = readVal(`venus_mix_grid_${period}`);
        const total = pv + grid;
        if (total > 0) {
          const pctPv   = (pv   / total) * 100;
          const pctGrid = (grid / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.84: per-segment colors editor-configurable.
          // Defaults: solar-color for PV charging, grid-color for grid charging.
          const colPv   = this.config.venus_mix_color_pv   || 'var(--pipe-solar-color)';
          const colGrid = this.config.venus_mix_color_grid || 'var(--pipe-grid-color)';
          if (pctPv > 0)   { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`); cursor += pctPv; }
          if (pctGrid > 0) { stops.push(`${colGrid} ${cursor}% 100%`); }
          venusMixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          venusMixActive = true;
        }
      }

      // --- Tesla / Consumer 1 SoC Donut Gradient (Phase 5.47) ---
      // Same conic-gradient pattern as Battery/Venus, but with a configurable
      // maximum (consumer_1_soc_max, default 100). This makes the donut
      // universal: tesla owners use the default 100% scale for SoC, but
      // someone using consumer 1 for a boiler can set max=65 (°C) and the
      // ring fills proportionally (22°C / 65°C = 33.8% filled).
      //
      // Activated by:
      //   consumer_1_soc_donut_mode (editor toggle, off by default)
      // Reads:
      //   entities.secondary_consumer_1 (the SoC / temp / level sensor)
      //   consumer_1_soc_max (the value that represents 100%, default 100)
      let c1GradientVal = '';
      let c1DonutActive = false;
      
      if (this.config.consumer_1_soc_donut_mode === true && entities.secondary_consumer_1) {
        const rawVal = parseFloat(getVal(entities.secondary_consumer_1));
        const socMax = parseFloat(this.config.consumer_1_soc_max);
        const maxVal = (!isNaN(socMax) && socMax > 0) ? socMax : 100;
        if (!isNaN(rawVal) && rawVal >= 0) {
          // Scale rawVal/maxVal to a 0..100 percentage, then clamp.
          const pct = Math.max(0, Math.min(100, (rawVal / maxVal) * 100));
          const restPct = 100 - pct;
          
          let stops = [];
          let current = 0;
          if (pct > 0) { stops.push(`var(--pipe-consumer-1-color) ${current}% ${current + pct}%`); current += pct; }
          if (restPct > 0) { stops.push(`var(--c1-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          c1GradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c1DonutActive = true;
        }
      }

      // --- Tesla / Consumer 1 Charge-Mix Ring (Phase 5.48) ---
      // A SECOND ring sitting OUTSIDE the SoC donut, showing where this bubble's
      // energy came from over a user-chosen period (day / month / year). Reads
      // four daily-energy sensors per period (PV / LG / Venus / Grid), weights
      // them proportionally, and builds a 4-segment conic-gradient using the
      // matching pipe colours. The user provides the sensors -- HEIMDALL needs
      // to expose them as utility_meter-style daily/monthly/yearly statistics.
      //
      // Activated by:
      //   consumer_1_mix_donut_mode (editor toggle, off by default)
      //   consumer_1_mix_period ('day' | 'month' | 'year', default 'day')
      // Reads:
      //   consumer_1_mix_{pv,lg,venus,grid}_{day,month,year}
      // Renders only if at least one source has a positive value for the chosen
      // period; otherwise stays inert (nothing to weight on a zero base).
      let c1MixGradientVal = '';
      let c1MixActive = false;
      
      if (this.config.consumer_1_mix_donut_mode === true) {
        const period = (this.config.consumer_1_mix_period === 'month' || this.config.consumer_1_mix_period === 'year')
          ? this.config.consumer_1_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv    = readVal(`consumer_1_mix_pv_${period}`);
        const lg    = readVal(`consumer_1_mix_lg_${period}`);
        const venus = readVal(`consumer_1_mix_venus_${period}`);
        const grid  = readVal(`consumer_1_mix_grid_${period}`);
        const total = pv + lg + venus + grid;
        if (total > 0) {
          const pctPv    = (pv    / total) * 100;
          const pctLg    = (lg    / total) * 100;
          const pctVenus = (venus / total) * 100;
          const pctGrid  = (grid  / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.80: per-segment colors are editor-configurable. Each
          // falls back to the matching pipe color when unset, so existing
          // configs look identical until the user picks a custom color.
          const colPv    = this.config.consumer_1_mix_color_pv    || 'var(--pipe-solar-color)';
          const colLg    = this.config.consumer_1_mix_color_lg    || 'var(--pipe-battery-color)';
          const colVenus = this.config.consumer_1_mix_color_venus || 'var(--pipe-venus-color)';
          const colGrid  = this.config.consumer_1_mix_color_grid  || 'var(--pipe-grid-color)';
          if (pctPv > 0)    { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`);    cursor += pctPv; }
          if (pctLg > 0)    { stops.push(`${colLg} ${cursor}% ${cursor + pctLg}%`);   cursor += pctLg; }
          if (pctVenus > 0) { stops.push(`${colVenus} ${cursor}% ${cursor + pctVenus}%`); cursor += pctVenus; }
          if (pctGrid > 0)  { stops.push(`${colGrid} ${cursor}% 100%`); }
          c1MixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c1MixActive = true;
        }
      }

      // --- BWWP / Consumer 5 SoC Donut Gradient (Phase 5.49) ---
      // Same pattern as Tesla SoC donut, but with default max=65 °C suitable
      // for a typical boiler. User can override consumer_5_soc_max for other
      // sensor ranges. Reads entities.secondary_consumer_5 (the temperature
      // sensor already used as the visible BWWP value).
      let c5GradientVal = '';
      let c5DonutActive = false;
      
      if (this.config.consumer_5_soc_donut_mode === true && entities.secondary_consumer_5) {
        const rawVal = parseFloat(getVal(entities.secondary_consumer_5));
        const socMax = parseFloat(this.config.consumer_5_soc_max);
        const maxVal = (!isNaN(socMax) && socMax > 0) ? socMax : 65;
        if (!isNaN(rawVal) && rawVal >= 0) {
          const pct = Math.max(0, Math.min(100, (rawVal / maxVal) * 100));
          const restPct = 100 - pct;
          
          let stops = [];
          let current = 0;
          if (pct > 0) { stops.push(`var(--pipe-consumer-5-color) ${current}% ${current + pct}%`); current += pct; }
          if (restPct > 0) { stops.push(`var(--c5-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          c5GradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c5DonutActive = true;
        }
      }

      // --- BWWP / Consumer 5 Charge-Mix Ring (Phase 5.51) ---
      // Same shape as Tesla mix-ring -- 4-segment conic from per-period kWh
      // sensors (PV / LG / Venus / Grid). Period selectable: day / month / year.
      // Renders only when total > 0. Mirror of phase 5.48.
      let c5MixGradientVal = '';
      let c5MixActive = false;
      
      if (this.config.consumer_5_mix_donut_mode === true) {
        const period = (this.config.consumer_5_mix_period === 'month' || this.config.consumer_5_mix_period === 'year')
          ? this.config.consumer_5_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv    = readVal(`consumer_5_mix_pv_${period}`);
        const lg    = readVal(`consumer_5_mix_lg_${period}`);
        const venus = readVal(`consumer_5_mix_venus_${period}`);
        const grid  = readVal(`consumer_5_mix_grid_${period}`);
        const total = pv + lg + venus + grid;
        if (total > 0) {
          const pctPv    = (pv    / total) * 100;
          const pctLg    = (lg    / total) * 100;
          const pctVenus = (venus / total) * 100;
          const pctGrid  = (grid  / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.81: per-segment colors editor-configurable (like Tesla 5.80).
          // Each falls back to its matching pipe color when unset.
          const colPv    = this.config.consumer_5_mix_color_pv    || 'var(--pipe-solar-color)';
          const colLg    = this.config.consumer_5_mix_color_lg    || 'var(--pipe-battery-color)';
          const colVenus = this.config.consumer_5_mix_color_venus || 'var(--pipe-venus-color)';
          const colGrid  = this.config.consumer_5_mix_color_grid  || 'var(--pipe-grid-color)';
          if (pctPv > 0)    { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`);    cursor += pctPv; }
          if (pctLg > 0)    { stops.push(`${colLg} ${cursor}% ${cursor + pctLg}%`);   cursor += pctLg; }
          if (pctVenus > 0) { stops.push(`${colVenus} ${cursor}% ${cursor + pctVenus}%`); cursor += pctVenus; }
          if (pctGrid > 0)  { stops.push(`${colGrid} ${cursor}% 100%`); }
          c5MixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c5MixActive = true;
        }
      }

      // --- Pumpe / Consumer 7 Water-Level Donut Gradient (Phase 5.52) ---
      // Same shape as the BWWP donut (phase 5.49), with default max=165 cm
      // suitable for a Regenschacht. User can override consumer_7_soc_max for
      // deeper/shallower cisterns or other use cases. Reads
      // entities.secondary_consumer_7 (typically a water level sensor).
      let c7GradientVal = '';
      let c7DonutActive = false;
      
      if (this.config.consumer_7_soc_donut_mode === true && entities.secondary_consumer_7) {
        const rawVal = parseFloat(getVal(entities.secondary_consumer_7));
        const socMax = parseFloat(this.config.consumer_7_soc_max);
        const maxVal = (!isNaN(socMax) && socMax > 0) ? socMax : 165;
        if (!isNaN(rawVal) && rawVal >= 0) {
          const pct = Math.max(0, Math.min(100, (rawVal / maxVal) * 100));
          const restPct = 100 - pct;
          
          let stops = [];
          let current = 0;
          if (pct > 0) { stops.push(`var(--pipe-consumer-7-color) ${current}% ${current + pct}%`); current += pct; }
          if (restPct > 0) { stops.push(`var(--c7-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          c7GradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c7DonutActive = true;
        }
      }

      // --- Pumpe / Consumer 7 Charge-Mix Ring (Phase 5.54) ---
      // Same shape as BWWP mix-ring -- 4-segment conic from per-period kWh
      // sensors (PV / LG / Venus / Grid). Period selectable: day / month / year.
      // Renders only when total > 0. Mirror of phase 5.51.
      let c7MixGradientVal = '';
      let c7MixActive = false;
      
      if (this.config.consumer_7_mix_donut_mode === true) {
        const period = (this.config.consumer_7_mix_period === 'month' || this.config.consumer_7_mix_period === 'year')
          ? this.config.consumer_7_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv    = readVal(`consumer_7_mix_pv_${period}`);
        const lg    = readVal(`consumer_7_mix_lg_${period}`);
        const venus = readVal(`consumer_7_mix_venus_${period}`);
        const grid  = readVal(`consumer_7_mix_grid_${period}`);
        const total = pv + lg + venus + grid;
        if (total > 0) {
          const pctPv    = (pv    / total) * 100;
          const pctLg    = (lg    / total) * 100;
          const pctVenus = (venus / total) * 100;
          const pctGrid  = (grid  / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.83: per-segment colors editor-configurable (like Tesla 5.80/BWWP 5.81).
          // Each falls back to its matching pipe color when unset.
          const colPv    = this.config.consumer_7_mix_color_pv    || 'var(--pipe-solar-color)';
          const colLg    = this.config.consumer_7_mix_color_lg    || 'var(--pipe-battery-color)';
          const colVenus = this.config.consumer_7_mix_color_venus || 'var(--pipe-venus-color)';
          const colGrid  = this.config.consumer_7_mix_color_grid  || 'var(--pipe-grid-color)';
          if (pctPv > 0)    { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`);    cursor += pctPv; }
          if (pctLg > 0)    { stops.push(`${colLg} ${cursor}% ${cursor + pctLg}%`);   cursor += pctLg; }
          if (pctVenus > 0) { stops.push(`${colVenus} ${cursor}% ${cursor + pctVenus}%`); cursor += pctVenus; }
          if (pctGrid > 0)  { stops.push(`${colGrid} ${cursor}% 100%`); }
          c7MixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c7MixActive = true;
        }
      }

      // --- Waschen / Consumer 2 Configurable Donut Gradient (Phase 5.55) ---
      // Generic ratio donut, same shape as Tesla/BWWP/Pumpe donuts. Default
      // max=5 suits a daily energy budget in kWh (typical washing machine);
      // user can override consumer_2_soc_max for other ranges.
      let c2GradientVal = '';
      let c2DonutActive = false;
      
      if (this.config.consumer_2_soc_donut_mode === true && entities.secondary_consumer_2) {
        const rawVal = parseFloat(getVal(entities.secondary_consumer_2));
        const socMax = parseFloat(this.config.consumer_2_soc_max);
        const maxVal = (!isNaN(socMax) && socMax > 0) ? socMax : 5;
        if (!isNaN(rawVal) && rawVal >= 0) {
          const pct = Math.max(0, Math.min(100, (rawVal / maxVal) * 100));
          const restPct = 100 - pct;
          
          let stops = [];
          let current = 0;
          if (pct > 0) { stops.push(`var(--pipe-consumer-2-color) ${current}% ${current + pct}%`); current += pct; }
          if (restPct > 0) { stops.push(`var(--c2-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          c2GradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c2DonutActive = true;
        }
      }

      // --- Waschen / Consumer 2 Charge-Mix Ring (Phase 5.57) ---
      // Same shape as Pumpe/BWWP mix-ring -- 4-segment conic from per-period
      // kWh sensors (PV / LG / Venus / Grid). Period selectable: day / month /
      // year. Renders only when total > 0.
      let c2MixGradientVal = '';
      let c2MixActive = false;
      
      if (this.config.consumer_2_mix_donut_mode === true) {
        const period = (this.config.consumer_2_mix_period === 'month' || this.config.consumer_2_mix_period === 'year')
          ? this.config.consumer_2_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv    = readVal(`consumer_2_mix_pv_${period}`);
        const lg    = readVal(`consumer_2_mix_lg_${period}`);
        const venus = readVal(`consumer_2_mix_venus_${period}`);
        const grid  = readVal(`consumer_2_mix_grid_${period}`);
        const total = pv + lg + venus + grid;
        if (total > 0) {
          const pctPv    = (pv    / total) * 100;
          const pctLg    = (lg    / total) * 100;
          const pctVenus = (venus / total) * 100;
          const pctGrid  = (grid  / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.83: per-segment colors editor-configurable (like Tesla 5.80/BWWP 5.81).
          // Each falls back to its matching pipe color when unset.
          const colPv    = this.config.consumer_2_mix_color_pv    || 'var(--pipe-solar-color)';
          const colLg    = this.config.consumer_2_mix_color_lg    || 'var(--pipe-battery-color)';
          const colVenus = this.config.consumer_2_mix_color_venus || 'var(--pipe-venus-color)';
          const colGrid  = this.config.consumer_2_mix_color_grid  || 'var(--pipe-grid-color)';
          if (pctPv > 0)    { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`);    cursor += pctPv; }
          if (pctLg > 0)    { stops.push(`${colLg} ${cursor}% ${cursor + pctLg}%`);   cursor += pctLg; }
          if (pctVenus > 0) { stops.push(`${colVenus} ${cursor}% ${cursor + pctVenus}%`); cursor += pctVenus; }
          if (pctGrid > 0)  { stops.push(`${colGrid} ${cursor}% 100%`); }
          c2MixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c2MixActive = true;
        }
      }

      // --- Trockner / Consumer 3 Configurable Donut Gradient (Phase 5.58) ---
      // Generic ratio donut, same shape as Waschen donut. Default max=5 suits
      // a daily energy budget in kWh on a tumble dryer; user can override
      // consumer_3_soc_max for other ranges.
      let c3GradientVal = '';
      let c3DonutActive = false;
      
      if (this.config.consumer_3_soc_donut_mode === true && entities.secondary_consumer_3) {
        const rawVal = parseFloat(getVal(entities.secondary_consumer_3));
        const socMax = parseFloat(this.config.consumer_3_soc_max);
        const maxVal = (!isNaN(socMax) && socMax > 0) ? socMax : 5;
        if (!isNaN(rawVal) && rawVal >= 0) {
          const pct = Math.max(0, Math.min(100, (rawVal / maxVal) * 100));
          const restPct = 100 - pct;
          
          let stops = [];
          let current = 0;
          if (pct > 0) { stops.push(`var(--pipe-consumer-3-color) ${current}% ${current + pct}%`); current += pct; }
          if (restPct > 0) { stops.push(`var(--c3-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          c3GradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c3DonutActive = true;
        }
      }

      // --- Trockner / Consumer 3 Charge-Mix Ring (Phase 5.60) ---
      let c3MixGradientVal = '';
      let c3MixActive = false;
      
      if (this.config.consumer_3_mix_donut_mode === true) {
        const period = (this.config.consumer_3_mix_period === 'month' || this.config.consumer_3_mix_period === 'year')
          ? this.config.consumer_3_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv    = readVal(`consumer_3_mix_pv_${period}`);
        const lg    = readVal(`consumer_3_mix_lg_${period}`);
        const venus = readVal(`consumer_3_mix_venus_${period}`);
        const grid  = readVal(`consumer_3_mix_grid_${period}`);
        const total = pv + lg + venus + grid;
        if (total > 0) {
          const pctPv    = (pv    / total) * 100;
          const pctLg    = (lg    / total) * 100;
          const pctVenus = (venus / total) * 100;
          const pctGrid  = (grid  / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.83: per-segment colors editor-configurable (like Tesla 5.80/BWWP 5.81).
          // Each falls back to its matching pipe color when unset.
          const colPv    = this.config.consumer_3_mix_color_pv    || 'var(--pipe-solar-color)';
          const colLg    = this.config.consumer_3_mix_color_lg    || 'var(--pipe-battery-color)';
          const colVenus = this.config.consumer_3_mix_color_venus || 'var(--pipe-venus-color)';
          const colGrid  = this.config.consumer_3_mix_color_grid  || 'var(--pipe-grid-color)';
          if (pctPv > 0)    { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`);    cursor += pctPv; }
          if (pctLg > 0)    { stops.push(`${colLg} ${cursor}% ${cursor + pctLg}%`);   cursor += pctLg; }
          if (pctVenus > 0) { stops.push(`${colVenus} ${cursor}% ${cursor + pctVenus}%`); cursor += pctVenus; }
          if (pctGrid > 0)  { stops.push(`${colGrid} ${cursor}% 100%`); }
          c3MixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c3MixActive = true;
        }
      }

      // --- Spüler / Consumer 4 Configurable Donut Gradient (Phase 5.61) ---
      // Generic ratio donut, default max=5 for daily kWh budget on a dishwasher.
      let c4GradientVal = '';
      let c4DonutActive = false;
      
      if (this.config.consumer_4_soc_donut_mode === true && entities.secondary_consumer_4) {
        const rawVal = parseFloat(getVal(entities.secondary_consumer_4));
        const socMax = parseFloat(this.config.consumer_4_soc_max);
        const maxVal = (!isNaN(socMax) && socMax > 0) ? socMax : 5;
        if (!isNaN(rawVal) && rawVal >= 0) {
          const pct = Math.max(0, Math.min(100, (rawVal / maxVal) * 100));
          const restPct = 100 - pct;
          
          let stops = [];
          let current = 0;
          if (pct > 0) { stops.push(`var(--pipe-consumer-4-color) ${current}% ${current + pct}%`); current += pct; }
          if (restPct > 0) { stops.push(`var(--c4-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          c4GradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c4DonutActive = true;
        }
      }

      // --- Spüler / Consumer 4 Charge-Mix Ring (Phase 5.63) ---
      let c4MixGradientVal = '';
      let c4MixActive = false;
      
      if (this.config.consumer_4_mix_donut_mode === true) {
        const period = (this.config.consumer_4_mix_period === 'month' || this.config.consumer_4_mix_period === 'year')
          ? this.config.consumer_4_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv    = readVal(`consumer_4_mix_pv_${period}`);
        const lg    = readVal(`consumer_4_mix_lg_${period}`);
        const venus = readVal(`consumer_4_mix_venus_${period}`);
        const grid  = readVal(`consumer_4_mix_grid_${period}`);
        const total = pv + lg + venus + grid;
        if (total > 0) {
          const pctPv    = (pv    / total) * 100;
          const pctLg    = (lg    / total) * 100;
          const pctVenus = (venus / total) * 100;
          const pctGrid  = (grid  / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.83: per-segment colors editor-configurable (like Tesla 5.80/BWWP 5.81).
          // Each falls back to its matching pipe color when unset.
          const colPv    = this.config.consumer_4_mix_color_pv    || 'var(--pipe-solar-color)';
          const colLg    = this.config.consumer_4_mix_color_lg    || 'var(--pipe-battery-color)';
          const colVenus = this.config.consumer_4_mix_color_venus || 'var(--pipe-venus-color)';
          const colGrid  = this.config.consumer_4_mix_color_grid  || 'var(--pipe-grid-color)';
          if (pctPv > 0)    { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`);    cursor += pctPv; }
          if (pctLg > 0)    { stops.push(`${colLg} ${cursor}% ${cursor + pctLg}%`);   cursor += pctLg; }
          if (pctVenus > 0) { stops.push(`${colVenus} ${cursor}% ${cursor + pctVenus}%`); cursor += pctVenus; }
          if (pctGrid > 0)  { stops.push(`${colGrid} ${cursor}% 100%`); }
          c4MixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c4MixActive = true;
        }
      }

      // --- Klima / Consumer 6 Configurable Donut Gradient (Phase 5.64) ---
      // Generic ratio donut, default max=30 for indoor temperature in °C.
      // User can override consumer_6_soc_max for humidity (100), CO2 (2000), etc.
      let c6GradientVal = '';
      let c6DonutActive = false;
      
      if (this.config.consumer_6_soc_donut_mode === true && entities.secondary_consumer_6) {
        const rawVal = parseFloat(getVal(entities.secondary_consumer_6));
        const socMax = parseFloat(this.config.consumer_6_soc_max);
        const maxVal = (!isNaN(socMax) && socMax > 0) ? socMax : 30;
        if (!isNaN(rawVal) && rawVal >= 0) {
          const pct = Math.max(0, Math.min(100, (rawVal / maxVal) * 100));
          const restPct = 100 - pct;
          
          let stops = [];
          let current = 0;
          if (pct > 0) { stops.push(`var(--pipe-consumer-6-color) ${current}% ${current + pct}%`); current += pct; }
          if (restPct > 0) { stops.push(`var(--c6-donut-rest-color, rgba(160, 160, 160, 0.7)) ${current}% 100%`); }
          c6GradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c6DonutActive = true;
        }
      }

      // --- Klima / Consumer 6 Charge-Mix Ring (Phase 5.66) ---
      // Final mix-ring of the seven-bubble feature parity series.
      let c6MixGradientVal = '';
      let c6MixActive = false;
      
      if (this.config.consumer_6_mix_donut_mode === true) {
        const period = (this.config.consumer_6_mix_period === 'month' || this.config.consumer_6_mix_period === 'year')
          ? this.config.consumer_6_mix_period
          : 'day';
        const readVal = (key) => {
          const ent = entities[key];
          if (!ent) return 0;
          const v = parseFloat(getVal(ent));
          return (!isNaN(v) && v > 0) ? v : 0;
        };
        const pv    = readVal(`consumer_6_mix_pv_${period}`);
        const lg    = readVal(`consumer_6_mix_lg_${period}`);
        const venus = readVal(`consumer_6_mix_venus_${period}`);
        const grid  = readVal(`consumer_6_mix_grid_${period}`);
        const total = pv + lg + venus + grid;
        if (total > 0) {
          const pctPv    = (pv    / total) * 100;
          const pctLg    = (lg    / total) * 100;
          const pctVenus = (venus / total) * 100;
          const pctGrid  = (grid  / total) * 100;
          
          let stops = [];
          let cursor = 0;
          // Phase 5.83: per-segment colors editor-configurable (like Tesla 5.80/BWWP 5.81).
          // Each falls back to its matching pipe color when unset.
          const colPv    = this.config.consumer_6_mix_color_pv    || 'var(--pipe-solar-color)';
          const colLg    = this.config.consumer_6_mix_color_lg    || 'var(--pipe-battery-color)';
          const colVenus = this.config.consumer_6_mix_color_venus || 'var(--pipe-venus-color)';
          const colGrid  = this.config.consumer_6_mix_color_grid  || 'var(--pipe-grid-color)';
          if (pctPv > 0)    { stops.push(`${colPv} ${cursor}% ${cursor + pctPv}%`);    cursor += pctPv; }
          if (pctLg > 0)    { stops.push(`${colLg} ${cursor}% ${cursor + pctLg}%`);   cursor += pctLg; }
          if (pctVenus > 0) { stops.push(`${colVenus} ${cursor}% ${cursor + pctVenus}%`); cursor += pctVenus; }
          if (pctGrid > 0)  { stops.push(`${colGrid} ${cursor}% 100%`); }
          c6MixGradientVal = `conic-gradient(from 0deg, ${stops.join(', ')})`;
          c6MixActive = true;
        }
      }

      // Phase 5.24/5.25: a bubble counts as "active for display" if either
      //   (a) power is currently flowing, OR
      //   (b) a donut is active on it (donut content is always meaningful), OR
      //   (c) the user enabled the "always color bubbles" toggle (Phase 5.25)
      // Otherwise the donut would surround a grey icon which makes no visual
      // sense, and users who prefer always-coloured bubbles at zero flow have
      // an opt-in via the global toggle in "Darstellung & Optionen".
      const alwaysColor = this.config.always_color_bubbles === true;
      const solarColor = (isSolarActive || solarDonutActive || alwaysColor) ? 'var(--icon-solar-color)' : 'var(--secondary-text-color)';
      const gridColor = isGridExporting ? 'var(--export-color)' : ((isGridActive || gridDonutActive || alwaysColor) ? 'var(--neon-blue)' : 'var(--secondary-text-color)');
      const gridIconColor = ((isGridActive || gridDonutActive || alwaysColor) && this.config.color_icon_grid) ? 'var(--icon-grid-color)' : gridColor;
      const gridTextColor = ((isGridActive || gridDonutActive || alwaysColor) && this.config.color_text_grid) ? 'var(--text-grid-color)' : gridColor;

      // Animation threshold: pipes only animate (and labels show) when flow > this value
      // Default 1 = legacy behavior. User can raise to ignore standby drift (e.g. Tesla 2W idle).
      // Global fallback threshold. Used only when a per-bubble threshold is not set.
      // Legacy: existing cards with `animation_threshold` in YAML still get that value as fallback.
      // New cards without it default to 1 (effectively off).
      const animThreshold = this.config.animation_threshold !== undefined ? this.config.animation_threshold : 1;

      // Per-bubble threshold helpers: fall back to global animThreshold when bubble-specific value is unset.
      // This lets each bubble have its own standby filter (e.g. BWWP shows 18W idle, Tesla hides 2W idle).
      const getSolarThreshold = () => this.config.solar_animation_threshold !== undefined ? this.config.solar_animation_threshold : animThreshold;
      const getGridThreshold = () => this.config.grid_animation_threshold !== undefined ? this.config.grid_animation_threshold : animThreshold;
      const getBatteryThreshold = () => this.config.battery_animation_threshold !== undefined ? this.config.battery_animation_threshold : animThreshold;
      const getVenusThreshold = () => this.config.venus_animation_threshold !== undefined ? this.config.venus_animation_threshold : animThreshold;
      const getConsumerThreshold = (idx) => {
        const override = this.config[`consumer_${idx}_animation_threshold`];
        return override !== undefined ? override : animThreshold;
      };

      // Resolve threshold by bubble type — used by getAnimStyle/getTextStyle.
      const getThresholdByType = (type) => {
        if (type === 'solar') return getSolarThreshold();
        if (type === 'grid') return getGridThreshold();
        if (type === 'battery') return getBatteryThreshold();
        if (type === 'venus') return getVenusThreshold();
        if (typeof type === 'string' && type.startsWith('consumer_')) {
          const idx = parseInt(type.split('_')[1], 10);
          return getConsumerThreshold(idx);
        }
        return animThreshold;
      };

      const getAnimStyle = (val, opVar = null, type = null) => {
        const threshold = type ? getThresholdByType(type) : animThreshold;
        if (val <= threshold) return "opacity: 0;";

        // --- Dynamic speed based on power ---
        // Higher power = faster animation (shorter duration)
        // Range: 2s (very fast, ~5000W+) to 12s (slow, ~50W)
        const minDuration = 4;
        const maxDuration = 12;
        const factor = 12000;
        let duration = factor / val;
        duration = Math.max(minDuration, Math.min(maxDuration, duration));

        // --- Dynamic particle density based on power ---
        // Higher power = more/denser particles (shorter gap)
        // Lower power = fewer/sparse particles (longer gap)
        let dashSize, gapSize;
        if (showTail) {
          // Comet tail: vary tail length with power
          dashSize = Math.round(15 + (val / 200) * 25); // 15-40
          dashSize = Math.min(dashSize, 40);
          gapSize = Math.round(380 - (val / 200) * 200); // 380-180
          gapSize = Math.max(gapSize, 180);
        } else if (showDashedLine) {
          // Dashed line: vary dash density
          dashSize = Math.round(8 + (val / 500) * 10); // 8-18
          dashSize = Math.min(dashSize, 18);
          gapSize = Math.round(18 - (val / 1000) * 10); // 18-8
          gapSize = Math.max(gapSize, 8);
          duration = duration * 5; // Dashed lines are slower
        } else {
          // Default dots: vary dot count/density
          dashSize = 0;  // stays as dots
          gapSize = Math.round(380 - (val / 200) * 250); // 380-130
          gapSize = Math.max(gapSize, 130);
        }

        const dynamicDash = `${dashSize} ${gapSize}`;

        const opStr = opVar ? `var(${opVar}, 1)` : '1';
        return `opacity: ${opStr}; animation-duration: ${duration}s; stroke-dasharray: ${dynamicDash};`;
      };

      // Background pipe: always visible by default (preserves topology).
      // When hide_inactive_flows is enabled, the pipe also respects the per-bubble
      // threshold and hides when flow is below it. This lets users choose between
      // "always show topology" (false, default) and "only show active flows" (true).
      const getPipeStyle = (val, opVar = null, type = null) => {
        const op = opVar ? `calc(var(${opVar}, 1) * 0.2)` : '0.2';
        if (!hideInactive) return `opacity: ${op};`;
        const threshold = type ? getThresholdByType(type) : animThreshold;
        return val > threshold ? `opacity: ${op};` : "opacity: 0;";
      };

      const getTextStyle = (val, type) => {
        let isVisible = false;
        if (type === 'solar') isVisible = showFlowSolar;
        else if (type === 'grid') isVisible = showFlowGrid;
        else if (type === 'battery') isVisible = showFlowBattery;
        else if (type === 'venus') isVisible = showFlowVenus;
        else if (type === 'consumer_1') isVisible = showFlowConsumer1 && (this.config.consumer_1_enabled !== false);
        else if (type === 'consumer_2') isVisible = showFlowConsumer2 && (this.config.consumer_2_enabled !== false);
        else if (type === 'consumer_3') isVisible = showFlowConsumer3 && (this.config.consumer_3_enabled !== false);
        else if (type === 'consumer_4') isVisible = showFlowConsumer4 && (this.config.consumer_4_enabled !== false);
        else if (type === 'consumer_5') isVisible = showFlowConsumer5 && (this.config.consumer_5_enabled !== false);
        else if (type === 'consumer_6') isVisible = showFlowConsumer6 && (this.config.consumer_6_enabled === true);
        else if (type === 'consumer_7') isVisible = showFlowConsumer7 && (this.config.consumer_7_enabled === true);

        if (!isVisible) return "display: none;";
        const threshold = getThresholdByType(type);
        return val > threshold ? "opacity: 1;" : "opacity: 0;";
      };

      const getColorStyle = (colorVar) => {
        return useColoredValues ? `color: var(${colorVar});` : '';
      };
      const getConsumerColorStyle = (hex) => {
        return useColoredValues ? `color: ${hex};` : '';
      }

      const renderLabel = (text, isVisible) => {
        if (!isVisible) return html``;
        return html`<div class="sub">${text}</div>`;
      };

      const renderSecondaryOrLabel = (labelText, showLabel, secondaryEntity, hasSecondary, entityKey = null) => {
        if (hasSecondary) {
          const secVal = getSecondaryVal(secondaryEntity);
          const secColor = entityKey ? getSecondaryColor(entityKey) : '#888888';
          return html`<div class="sub secondary-val" style="color: ${secColor};">${secVal}</div>`;
        }
        return renderLabel(labelText, showLabel);
      };

      const renderMainIcon = (type, val, customIcon, color = null) => {
        if (customIcon) {
          const style = color ? `color: ${color};` : (type === 'solar' ? 'color: var(--icon-solar-color);' : (type === 'grid' ? 'color: var(--icon-grid-color);' : (type === 'battery' ? 'color: var(--icon-battery-color);' : (type === 'venus' ? 'color: var(--icon-venus-color);' : (type === 'house' ? 'color: var(--icon-house-color);' : '')))));
          return html`<ha-icon icon="${customIcon}" class="icon-custom" style="${style}"></ha-icon>`;
        }
        return this._renderIcon(type, val, color);
      };

      const renderConsumer = (isVisible, cssClass, configKey, label, iconType, val, hexColor) => {
        if (!isVisible) return html``;

        const customIcon = this.config[`${configKey}_icon`];
        let iconContent;

        const iconColorVar = `var(--icon-${configKey.replace(/_/g, '-')}-color)`;

        if (hideConsumerIcons) {
          iconContent = html``;
        } else if (customIcon) {
          iconContent = html`<ha-icon icon="${customIcon}" class="icon-custom" style="color: ${iconColorVar};"></ha-icon>`;
        } else {
          iconContent = this._renderIcon(iconType, val);
        }

        const secEntity = entities[`secondary_${configKey}`];
        const hasSecondary = !!(secEntity && secEntity !== "");

        const textStyle = this.config[`color_text_${configKey}`]
          ? `color: var(--text-${configKey.replace(/_/g, '-')}-color);`
          : getConsumerColorStyle(hexColor);

        // Show-power toggle: when false AND a secondary sensor is configured,
        // the big value displays the secondary (e.g. SoC%) and the label is
        // shown small. Default true preserves legacy behavior (power big,
        // secondary small via renderSecondaryOrLabel).
        const showPower = this.config[`${configKey}_show_power`] !== false;

        let bigValue;
        let subLine;

        if (showPower) {
          // Legacy path: power big, label/secondary small (via existing helper)
          bigValue = this._formatPower(val);
          subLine = renderSecondaryOrLabel(label, true, secEntity, hasSecondary, `secondary_${configKey}`);
        } else {
          // New path: secondary big (e.g. SoC, temperature), label small
          // Falls back to power if no secondary configured.
          const bigContent = hasSecondary ? getSecondaryVal(secEntity) : this._formatPower(val);
          bigValue = bigContent;
          subLine = html`<div class="sub label-val" style="${textStyle} opacity: 0.7;">${label}</div>`;
        }

        // Phase 5.44: rotation layer for consumer bubbles. If the user has
        // configured at least one daily-slot sensor (consumer_X_rotate_daily_N)
        // and enabled it, the bigValue cycles through live + enabled daily
        // slots on the global rotation_interval_sec tick. Uses the same
        // generic _getBubbleRotationDisplay helper as Solar/Grid/Battery/Venus.
        // Backward-compatible: when no rotation is configured, behaves
        // exactly as before.
        let bigValueStyle = textStyle;
        const cfg = this.config;
        const hasAnyRotationSlot =
          cfg[`${configKey}_rotate_show_daily_1`] === true ||
          cfg[`${configKey}_rotate_show_daily_2`] === true ||
          cfg[`${configKey}_rotate_show_daily_3`] === true;
        if (hasAnyRotationSlot) {
          // Live text is whatever bigValue currently holds (power or secondary)
          const liveText = bigValue;
          // Live colour falls back to the consumer hex colour
          const liveColor = hexColor;
          const rot = this._getBubbleRotationDisplay(configKey, liveText, liveColor);
          bigValue = rot.text;
          bigValueStyle = `color: ${rot.color};`;
        }

        // Phase 5.47: SoC donut for Tesla (Consumer 1). Only this bubble has
        // the donut feature for now -- other consumers can be promoted later
        // by extending the variable lookup. The .donut class triggers the
        // CSS ::before mask (see .bubble.c1.donut::before), and --c1-gradient
        // carries the conic-gradient computed earlier.
        const c1Donut = (cssClass === 'c1' && c1DonutActive);
        
        // Phase 5.48: Charge-mix outer ring for Tesla. The .mix-ring class
        // triggers .bubble.c1.mix-ring::after which sits outside the SoC ring.
        // --c1-mix-gradient carries the 4-segment conic, --c1-mix-gap controls
        // how far outside the bubble border the ring sits, --c1-mix-thickness
        // controls how thick the ring is. Independent of the SoC donut --
        // either can be on without the other.
        const c1MixRing = (cssClass === 'c1' && c1MixActive);
        const c1MixGap = (this.config.consumer_1_mix_ring_gap !== undefined)
          ? parseInt(this.config.consumer_1_mix_ring_gap, 10) : 8;
        const c1MixThickness = (this.config.consumer_1_mix_ring_thickness !== undefined)
          ? parseInt(this.config.consumer_1_mix_ring_thickness, 10) : 4;
        
        // Phase 5.49: SoC donut for BWWP (Consumer 5). Same shape as c1Donut,
        // just for cssClass === 'c5' and --c5-gradient. Independent of c1.
        const c5Donut = (cssClass === 'c5' && c5DonutActive);
        
        // Phase 5.51: Charge-mix outer ring for BWWP. Mirror of phase 5.48
        // Tesla mix-ring. Independent of all other rings.
        const c5MixRing = (cssClass === 'c5' && c5MixActive);
        const c5MixGap = (this.config.consumer_5_mix_ring_gap !== undefined)
          ? parseInt(this.config.consumer_5_mix_ring_gap, 10) : 8;
        const c5MixThickness = (this.config.consumer_5_mix_ring_thickness !== undefined)
          ? parseInt(this.config.consumer_5_mix_ring_thickness, 10) : 4;
        
        // Phase 5.52: Water-level donut for Pumpe (Consumer 7). Same shape as
        // c1Donut / c5Donut, just for cssClass === 'c7' and --c7-gradient.
        const c7Donut = (cssClass === 'c7' && c7DonutActive);
        
        // Phase 5.54: Charge-mix outer ring for Pumpe. Mirror of phase 5.51
        // BWWP mix-ring. Independent of all other rings.
        const c7MixRing = (cssClass === 'c7' && c7MixActive);
        const c7MixGap = (this.config.consumer_7_mix_ring_gap !== undefined)
          ? parseInt(this.config.consumer_7_mix_ring_gap, 10) : 8;
        const c7MixThickness = (this.config.consumer_7_mix_ring_thickness !== undefined)
          ? parseInt(this.config.consumer_7_mix_ring_thickness, 10) : 4;
        
        // Phase 5.55: Configurable donut for Waschen (Consumer 2). Same
        // shape as c1Donut / c5Donut / c7Donut, for cssClass === 'c2'.
        const c2Donut = (cssClass === 'c2' && c2DonutActive);
        
        // Phase 5.57: Charge-mix outer ring for Waschen. Mirror of phase 5.54
        // Pumpe mix-ring. Independent of all other rings.
        const c2MixRing = (cssClass === 'c2' && c2MixActive);
        const c2MixGap = (this.config.consumer_2_mix_ring_gap !== undefined)
          ? parseInt(this.config.consumer_2_mix_ring_gap, 10) : 8;
        const c2MixThickness = (this.config.consumer_2_mix_ring_thickness !== undefined)
          ? parseInt(this.config.consumer_2_mix_ring_thickness, 10) : 4;
        
        // Phase 5.58: Configurable donut for Trockner (Consumer 3). Same shape
        // as c2Donut, for cssClass === 'c3'.
        const c3Donut = (cssClass === 'c3' && c3DonutActive);
        
        // Phase 5.60: Charge-mix outer ring for Trockner.
        const c3MixRing = (cssClass === 'c3' && c3MixActive);
        const c3MixGap = (this.config.consumer_3_mix_ring_gap !== undefined)
          ? parseInt(this.config.consumer_3_mix_ring_gap, 10) : 8;
        const c3MixThickness = (this.config.consumer_3_mix_ring_thickness !== undefined)
          ? parseInt(this.config.consumer_3_mix_ring_thickness, 10) : 4;
        
        // Phase 5.61: Configurable donut for Spüler (Consumer 4).
        const c4Donut = (cssClass === 'c4' && c4DonutActive);
        
        // Phase 5.63: Charge-mix outer ring for Spüler.
        const c4MixRing = (cssClass === 'c4' && c4MixActive);
        const c4MixGap = (this.config.consumer_4_mix_ring_gap !== undefined)
          ? parseInt(this.config.consumer_4_mix_ring_gap, 10) : 8;
        const c4MixThickness = (this.config.consumer_4_mix_ring_thickness !== undefined)
          ? parseInt(this.config.consumer_4_mix_ring_thickness, 10) : 4;
        
        // Phase 5.64: Configurable donut for Klima (Consumer 6).
        const c6Donut = (cssClass === 'c6' && c6DonutActive);
        
        // Phase 5.66: Charge-mix outer ring for Klima -- final mix-ring.
        const c6MixRing = (cssClass === 'c6' && c6MixActive);
        const c6MixGap = (this.config.consumer_6_mix_ring_gap !== undefined)
          ? parseInt(this.config.consumer_6_mix_ring_gap, 10) : 8;
        const c6MixThickness = (this.config.consumer_6_mix_ring_thickness !== undefined)
          ? parseInt(this.config.consumer_6_mix_ring_thickness, 10) : 4;
        
        const bubbleStyle = [
          c1Donut ? `--c1-gradient: ${c1GradientVal};` : '',
          c1MixRing ? `--c1-mix-gradient: ${c1MixGradientVal}; --c1-mix-gap: ${c1MixGap}px; --c1-mix-thickness: ${c1MixThickness}px;` : '',
          c5Donut ? `--c5-gradient: ${c5GradientVal};` : '',
          c5MixRing ? `--c5-mix-gradient: ${c5MixGradientVal}; --c5-mix-gap: ${c5MixGap}px; --c5-mix-thickness: ${c5MixThickness}px;` : '',
          c7Donut ? `--c7-gradient: ${c7GradientVal};` : '',
          c7MixRing ? `--c7-mix-gradient: ${c7MixGradientVal}; --c7-mix-gap: ${c7MixGap}px; --c7-mix-thickness: ${c7MixThickness}px;` : '',
          c2Donut ? `--c2-gradient: ${c2GradientVal};` : '',
          c2MixRing ? `--c2-mix-gradient: ${c2MixGradientVal}; --c2-mix-gap: ${c2MixGap}px; --c2-mix-thickness: ${c2MixThickness}px;` : '',
          c3Donut ? `--c3-gradient: ${c3GradientVal};` : '',
          c3MixRing ? `--c3-mix-gradient: ${c3MixGradientVal}; --c3-mix-gap: ${c3MixGap}px; --c3-mix-thickness: ${c3MixThickness}px;` : '',
          c4Donut ? `--c4-gradient: ${c4GradientVal};` : '',
          c4MixRing ? `--c4-mix-gradient: ${c4MixGradientVal}; --c4-mix-gap: ${c4MixGap}px; --c4-mix-thickness: ${c4MixThickness}px;` : '',
          c6Donut ? `--c6-gradient: ${c6GradientVal};` : '',
          c6MixRing ? `--c6-mix-gradient: ${c6MixGradientVal}; --c6-mix-gap: ${c6MixGap}px; --c6-mix-thickness: ${c6MixThickness}px;` : '',
        ].filter(Boolean).join(' ');

        // Phase 5.67: per-bubble sparkline. Renders nothing unless the
        // toggle for this bubble's index is on. cssClass is 'c1'..'c7';
        // strip the leading 'c' to get the numeric index.
        const consumerIdx = parseInt(cssClass.replace('c', ''), 10);
        const sparklineSvg = (consumerIdx >= 1 && consumerIdx <= 7)
          ? this._renderSparkline(consumerIdx)
          : html``;

        return html`
            <div class="bubble ${cssClass} ${cssClass.replace('c', 'node-c')} ${c1Donut ? 'donut' : ''} ${c1MixRing ? 'mix-ring' : ''} ${c5Donut ? 'donut' : ''} ${c5MixRing ? 'mix-ring' : ''} ${c7Donut ? 'donut' : ''} ${c7MixRing ? 'mix-ring' : ''} ${c2Donut ? 'donut' : ''} ${c2MixRing ? 'mix-ring' : ''} ${c3Donut ? 'donut' : ''} ${c3MixRing ? 'mix-ring' : ''} ${c4Donut ? 'donut' : ''} ${c4MixRing ? 'mix-ring' : ''} ${c6Donut ? 'donut' : ''} ${c6MixRing ? 'mix-ring' : ''} ${tintClass} ${glowClass}"
                style="${bubbleStyle}"
                @click=${() => this._handleClick(entities[configKey])}>
                ${sparklineSvg}
                ${iconContent}
                ${subLine}
                <div class="value ${hasAnyRotationSlot ? 'rotating-value' : ''}" style="${bigValueStyle}">${bigValue}</div>
            </div>
        `;
      };

      const getConsumerPipeStyle = (isActive, val, idx = null) => {
        if (!isActive) return "display: none;";
        const type = idx ? `consumer_${idx}` : null;
        return getPipeStyle(val, idx ? `--pipe-consumer-${idx}-opacity` : null, type);
      };

      const getConsumerAnimStyle = (isActive, val, idx = null) => {
        if (!isActive) return "display: none;";
        const type = idx ? `consumer_${idx}` : null;
        return getAnimStyle(val, idx ? `--pipe-consumer-${idx}-opacity` : null, type);
      };

      const pathSolarHouse = "M 120 170 Q 120 290 355 290";
      const pathSolarBatt = "M 120 80 Q 260 35 400 80";
      const pathGridImport = "M 260 170 Q 260 290 355 290";
      const pathGridExport = "M 165 125 Q 190 155 215 125";
      const activeExportPath = pathGridExport;
      // Phase 5.34: PV→Grid (export) label is now positionable just like
      // the other primary labels. Defaults preserve the previous hardcoded
      // position so existing dashboards don't visually shift.
      const exportTextX = 205 + (this.config.solar_export_label_offset_x !== undefined ? this.config.solar_export_label_offset_x : 0);
      const exportTextY = 160 + (this.config.solar_export_label_offset_y !== undefined ? this.config.solar_export_label_offset_y : 0);
      const pathBattHouse = "M 400 170 Q 400 250 400 250";
      const pathHouseToBatt = "M 400 250 Q 400 250 400 170";
      // Venus pipes (mirrors battery pattern, geometrically distinct from LG paths)
      const pathSolarVenus = "M 120 80 Q 330 15 540 80";
      const pathVenusHouse = "M 540 170 Q 540 290 445 290";
      // Phase BKW-1: link from the garden plant into the venus.
      // Phase BKW-13: arcs over the top instead of running straight across.
      // The two bubbles are only 40px apart at bubble_size 100, so a
      // horizontal segment left barely a dash or two of the animation
      // visible. Same over-the-top idiom pathSolarVenus already uses.
      const pathBkwVenus = "M 685 80 Q 640 30 545 80";
      // Phase BKW-3: pass-through path. Physically the energy still travels
      // through the venus, but drawing it straight to the house is what makes
      // the garden readable as a producer -- same treatment the roof gets.
      // Phase BKW-5: follows the house-path idiom used everywhere else --
      // drop vertically, then sweep horizontally with the control point in the
      // corner.
      // Phase BKW-18: leaves from the bubble centre (680) instead of off to
      // the left. The earlier offset guarded against the climate bubble at
      // x>=680, y>=219 -- but sampling shows the curve is already past x=680
      // at y=173, a clear 46px above its top edge, so the guard was not
      // needed. Ends 12px below pathVenusHouse so both stay readable.
      const pathBkwHouse = "M 680 172 Q 680 302 450 302";
      // Phase BKW-14: garden surplus heading for the grid. Arcs above the whole
      // row -- there is no other clear line from the far right to the grid
      // bubble. Kept higher than pathSolarVenus so the two do not collide.
      const pathBkwGrid = "M 685 78 Q 440 -45 265 78";
      const pathHouseToVenus = "M 445 290 Q 540 290 540 170";
      // Phase 5.9: restore curved pipe aesthetic from phase 5.5 for c1-c5
      // (matches the visual style of the upstream card). For c6/c7 the
      // outer pipes are routed horizontally first then bent down at the
      // target x-coordinate so they sweep wide around the row-2 bubbles
      // instead of cutting diagonally through them.
      const pathHouseC1 = "M 355 290 Q 175 290 175 400";
      const pathHouseC2 = "M 400 335 L 400 400";
      const pathHouseC3 = "M 445 290 Q 625 290 625 400";
      const pathHouseC4 = "M 355 290 Q 265 400 285 510";
      const pathHouseC5 = "M 445 290 Q 535 400 515 510";
      const pathHouseC6 = "M 355 290 Q 45 290 45 510";
      const pathHouseC7 = "M 445 290 Q 725 290 725 510";

      const houseTextStyle = this.config.color_text_house
        ? 'color: var(--text-house-color);'
        : (houseTextCol ? `color: ${houseTextCol};` : '');
      const dashArrayVal = showTail ? '30 360' : (showDashedLine ? '13 13' : '0 380');
      const strokeWidthVal = showDashedLine ? 4 : 8;
      
      // Phase 5.41: animated background style.
      //   bg_anim_style: 'off' (default) | 'aurora' | 'flow' | 'pulse'
      //   bg_anim_duration_sec: animation cycle length (5..120s, default 30)
      //   bg_anim_intensity: opacity of the colour layer (0..0.3, default 0.1)
      //   bg_anim_saturate: CSS saturate filter on the layer (0.5..1.5, default 1)
      //   bg_color_1..4: four colour stops
      // All effects are CSS-only (no JS animation loop) and GPU-accelerated.
      // prefers-reduced-motion handled in CSS.
      // Phase 5.43: Pulse style removed. Map legacy 'pulse' configs to 'off'
      // (the conic-gradient rotation didn't pan out aesthetically; only aurora
      // and flow remain). Existing configs that saved 'pulse' will silently
      // render as off until the user picks aurora or flow.
      let bgAnimStyle = this.config.bg_anim_style || 'off';
      if (bgAnimStyle !== 'off' && bgAnimStyle !== 'aurora' && bgAnimStyle !== 'flow') {
        bgAnimStyle = 'off';
      }
      const bgAnimEnabled = bgAnimStyle !== 'off' && !this.config.transparent_background;
      const bgAnimClass = bgAnimEnabled ? `bg-anim-${bgAnimStyle}` : '';
      const bgAnimDuration = this.config.bg_anim_duration_sec !== undefined ? this.config.bg_anim_duration_sec : 30;
      const bgAnimOpacity = this.config.bg_anim_intensity !== undefined ? this.config.bg_anim_intensity : 0.1;
      const bgAnimSaturate = this.config.bg_anim_saturate !== undefined ? this.config.bg_anim_saturate : 1;
      const bgColor1 = this.config.bg_color_1 || '#ffdd00';
      const bgColor2 = this.config.bg_color_2 || '#ff0040';
      const bgColor3 = this.config.bg_color_3 || '#e100ff';
      const bgColor4 = this.config.bg_color_4 || '#8d07d5';
      const bgAnimVars = bgAnimEnabled
        ? ` --bg-anim-duration: ${bgAnimDuration}s; --bg-anim-opacity: ${bgAnimOpacity}; --bg-anim-saturate: ${bgAnimSaturate}; --bg-color-1: ${bgColor1}; --bg-color-2: ${bgColor2}; --bg-color-3: ${bgColor3}; --bg-color-4: ${bgColor4};`
        : '';
      const haCardClasses = [
        this.config.transparent_background ? 'transparent-bg' : '',
        bgAnimClass,
      ].filter(Boolean).join(' ');

      return html`
      <ha-card class="${haCardClasses}" style="height: ${finalCardBackgroundHeightPx}px; width: ${visualWidth + padLeft + padRight}px; padding-top: ${padTop}px; padding-bottom: ${padBottom}px; padding-left: ${padLeft}px; padding-right: ${padRight}px; box-sizing: border-box; margin-left: auto; margin-right: auto; --flow-dasharray: ${dashArrayVal}; --flow-stroke-width: ${strokeWidthVal}px; --pipe-label-size: ${(this.config.pipe_label_size || 10)}px; --bubble-size: ${(this.config.bubble_size || 90)}px;${bgAnimVars}">
        
        <div class="scale-wrapper" style="transform: translate(${sidePanelsOn ? 0 : (this.config.card_offset_x !== undefined ? this.config.card_offset_x : 0)}px, ${sidePanelsStacked ? 0 : (this.config.card_offset_y !== undefined ? this.config.card_offset_y : 0)}px) scale(${scale}); margin-top: ${-padTop}px;">
            
            <div class="absolute-container" style="height: ${baseHeight}px; top: -${topShift}px;">
                <svg height="${baseHeight}" viewBox="0 0 800 ${baseHeight}" preserveAspectRatio="xMidYMid meet">
                    
                    <path class="bg-path bg-solar" d="${pathSolarHouse}" style="${getPipeStyle(solarToHouse, '--pipe-solar-opacity', 'solar')} ${styleSolar}" />
                    <path class="bg-path bg-solar" d="${pathSolarBatt}" style="${getPipeStyle(solarToBatt, '--pipe-solar-opacity', 'solar')} ${styleSolarBatt}" />
                    
                    <path class="bg-path bg-grid" d="${pathGridImport}" style="${getPipeStyle(gridToHouse, '--pipe-grid-opacity', 'grid')} ${styleGrid}" />
                    <path class="bg-path bg-export" d="${activeExportPath}" style="${getPipeStyle(gridExport, '--pipe-grid-opacity', 'grid')} ${styleGrid}" />
                    <path class="bg-path bg-battery" d="${pathBattHouse}" style="${getPipeStyle(batteryDischarge, '--pipe-battery-opacity', 'battery')} ${styleBattery}" />

                    <path class="bg-path bg-battery" d="${pathHouseToBatt}" style="${(batteryChargeViaHouse && batteryCharge > 0) ? getPipeStyle(batteryCharge, '--pipe-battery-opacity', 'battery') + ' ' + styleBattery : 'display:none;'}" />

                    <path class="bg-path bg-venus" d="${pathSolarVenus}" style="${getPipeStyle(solarToVenus, '--pipe-solar-opacity', 'solar')} ${styleSolarVenus}" />
                    <path class="bg-path bg-venus" d="${pathVenusHouse}" style="${getPipeStyle(venusDischarge, '--pipe-venus-opacity', 'venus')} ${styleVenus}" />
                    <path class="bg-path bg-solar" d="${pathBkwVenus}" style="${getPipeStyle(bkwToVenus, '--pipe-solar-opacity', 'solar')}" />
                    <path class="bg-path bg-solar" d="${pathBkwHouse}" style="${getPipeStyle(bkwToHouse, '--pipe-solar-opacity', 'solar')}" />
                    <path class="bg-path bg-export" d="${pathBkwGrid}" style="${getPipeStyle(bkwToGrid, '--pipe-grid-opacity', 'grid')}" />
                    <path class="bg-path bg-venus" d="${pathHouseToVenus}" style="${(venusChargeViaHouse && venusCharge > 0) ? getPipeStyle(venusCharge, '--pipe-venus-opacity', 'venus') + ' ' + styleVenus : 'display:none;'}" />

                    <path d="${pathHouseC1}" fill="none" stroke="${this._getConsumerPipeColor(1)}" stroke-width="6" style="${getConsumerPipeStyle(c1PipeActive, c1Val, 1)}" />
                    <path d="${pathHouseC2}" fill="none" stroke="${this._getConsumerPipeColor(2)}" stroke-width="6" style="${getConsumerPipeStyle(c2PipeActive, c2Val, 2)}" />
                    <path d="${pathHouseC3}" fill="none" stroke="${this._getConsumerPipeColor(3)}" stroke-width="6" style="${getConsumerPipeStyle(c3PipeActive, c3Val, 3)}" />
                    <path d="${pathHouseC4}" fill="none" stroke="${this._getConsumerPipeColor(4)}" stroke-width="6" style="${getConsumerPipeStyle(c4PipeActive, c4Val, 4)}" />
                    <path d="${pathHouseC5}" fill="none" stroke="${this._getConsumerPipeColor(5)}" stroke-width="6" style="${getConsumerPipeStyle(c5PipeActive, c5Val, 5)}" />
                    <path d="${pathHouseC6}" fill="none" stroke="${this._getConsumerPipeColor(6)}" stroke-width="6" style="${getConsumerPipeStyle(c6PipeActive, c6Val, 6)}" />
                    <path d="${pathHouseC7}" fill="none" stroke="${this._getConsumerPipeColor(7)}" stroke-width="6" style="${getConsumerPipeStyle(c7PipeActive, c7Val, 7)}" />

                    <path class="flow-line flow-solar" d="${pathSolarHouse}" style="${getAnimStyle(solarToHouse, '--pipe-solar-opacity', 'solar')} ${styleSolar}" />
                    <path class="flow-line flow-solar" d="${pathSolarBatt}" style="${getAnimStyle(solarToBatt, '--pipe-solar-opacity', 'solar')} ${styleSolarBatt}" />
                    
                    <path class="flow-line flow-grid" d="${pathGridImport}" style="${getAnimStyle(gridToHouse, '--pipe-grid-opacity', 'grid')} ${styleGrid}" />
                    <path class="flow-line flow-export" d="${activeExportPath}" style="${getAnimStyle(gridExport, '--pipe-grid-opacity', 'grid')} ${styleGrid}" />
                    
                    <path class="flow-line flow-battery" d="${pathBattHouse}" style="${getAnimStyle(batteryDischarge, '--pipe-battery-opacity', 'battery')} ${styleBattery}" />

                    <path class="flow-line flow-battery" d="${pathHouseToBatt}" style="${(batteryChargeViaHouse && batteryCharge > 0) ? getAnimStyle(batteryCharge, '--pipe-battery-opacity', 'battery') + ' ' + styleBattery : 'display:none;'}" />

                    <path class="flow-line flow-venus" d="${pathSolarVenus}" style="${getAnimStyle(solarToVenus, '--pipe-solar-opacity', 'solar')} ${styleSolarVenus}" />
                    <path class="flow-line flow-venus" d="${pathVenusHouse}" style="${getAnimStyle(venusDischarge, '--pipe-venus-opacity', 'venus')} ${styleVenus}" />
                    <path class="flow-line flow-solar" d="${pathBkwVenus}" style="${getAnimStyle(bkwToVenus, '--pipe-solar-opacity', 'solar')}" />
                    <path class="flow-line flow-solar" d="${pathBkwHouse}" style="${getAnimStyle(bkwToHouse, '--pipe-solar-opacity', 'solar')}" />
                    <path class="flow-line flow-export" d="${pathBkwGrid}" style="${getAnimStyle(bkwToGrid, '--pipe-grid-opacity', 'grid')}" />
                    <path class="flow-line flow-venus" d="${pathHouseToVenus}" style="${(venusChargeViaHouse && venusCharge > 0) ? getAnimStyle(venusCharge, '--pipe-venus-opacity', 'venus') + ' ' + styleVenus : 'display:none;'}" />

                    <path class="flow-line" d="${pathHouseC1}" stroke="${this._getConsumerPipeColor(1)}" style="${getConsumerAnimStyle(c1PipeActive, c1Val, 1)}" />
                    <path class="flow-line" d="${pathHouseC2}" stroke="${this._getConsumerPipeColor(2)}" style="${getConsumerAnimStyle(c2PipeActive, c2Val, 2)}" />
                    <path class="flow-line" d="${pathHouseC3}" stroke="${this._getConsumerPipeColor(3)}" style="${getConsumerAnimStyle(c3PipeActive, c3Val, 3)}" />
                    <path class="flow-line" d="${pathHouseC4}" stroke="${this._getConsumerPipeColor(4)}" style="${getConsumerAnimStyle(c4PipeActive, c4Val, 4)}" />
                    <path class="flow-line" d="${pathHouseC5}" stroke="${this._getConsumerPipeColor(5)}" style="${getConsumerAnimStyle(c5PipeActive, c5Val, 5)}" />
                    <path class="flow-line" d="${pathHouseC6}" stroke="${this._getConsumerPipeColor(6)}" style="${getConsumerAnimStyle(c6PipeActive, c6Val, 6)}" />
                    <path class="flow-line" d="${pathHouseC7}" stroke="${this._getConsumerPipeColor(7)}" style="${getConsumerAnimStyle(c7PipeActive, c7Val, 7)}" />
                    <text x="${165 + (this.config.solar_label_offset_x !== undefined ? this.config.solar_label_offset_x : 0)}" y="${235 + (this.config.solar_label_offset_y !== undefined ? this.config.solar_label_offset_y : 0)}" class="${textClass} text-solar" style="${getTextStyle(solarToHouse, 'solar')} ${styleSolar}">${this._formatPower(solarToHouse)}</text>
                    <text x="260" y="45" class="${textClass} text-solar" style="${getTextStyle(solarToBatt, 'solar')} ${styleSolarBatt}">${this._formatPower(solarToBatt)}</text>
                    
                    <text x="${290 + (this.config.grid_label_offset_x !== undefined ? this.config.grid_label_offset_x : 0)}" y="${255 + (this.config.grid_label_offset_y !== undefined ? this.config.grid_label_offset_y : 0)}" class="${textClass} text-grid" style="${getTextStyle(gridToHouse, 'grid')} ${styleGrid}">${this._formatPower(gridToHouse)}</text>
                    <text x="${exportTextX}" y="${exportTextY}" class="${textClass} text-export" style="${getTextStyle(gridExport, 'grid')} ${styleGrid}">${this._formatPower(gridExport)}</text>
                    
                    <text x="${345 + (this.config.battery_label_offset_x !== undefined ? this.config.battery_label_offset_x : 0)}" y="${235 + (this.config.battery_label_offset_y !== undefined ? this.config.battery_label_offset_y : 0)}" class="${textClass} text-battery" style="${getTextStyle(batteryDischarge, 'battery')} ${styleBattery}">${this._formatPower(batteryDischarge)}</text>

                    <text x="${345 + (this.config.battery_label_offset_x !== undefined ? this.config.battery_label_offset_x : 0)}" y="${235 + (this.config.battery_label_offset_y !== undefined ? this.config.battery_label_offset_y : 0)}" class="${textClass} text-battery" style="${(batteryChargeViaHouse && batteryCharge > 0) ? getTextStyle(batteryCharge, 'battery') + ' ' + styleBattery : 'display:none;'}">${this._formatPower(batteryCharge)}</text>

                    <text x="330" y="40" class="${textClass} text-solar" style="${getTextStyle(solarToVenus, 'solar')} ${styleSolarVenus}">${this._formatPower(solarToVenus)}</text>
                    <text x="${455 + (this.config.venus_label_offset_x !== undefined ? this.config.venus_label_offset_x : 0)}" y="${235 + (this.config.venus_label_offset_y !== undefined ? this.config.venus_label_offset_y : 0)}" class="${textClass} text-venus" style="${getTextStyle(venusDischarge, 'venus')} ${styleVenus}">${this._formatPower(venusDischarge)}</text>
                    <text x="${455 + (this.config.venus_label_offset_x !== undefined ? this.config.venus_label_offset_x : 0)}" y="${235 + (this.config.venus_label_offset_y !== undefined ? this.config.venus_label_offset_y : 0)}" class="${textClass} text-venus" style="${(venusChargeViaHouse && venusCharge > 0) ? getTextStyle(venusCharge, 'venus') + ' ' + styleVenus : 'display:none;'}">${this._formatPower(venusCharge)}</text>

                    ${/* Phase BKW-7: pipe labels for the garden plant. Same
                         offset idiom as every other pipe label so they can be
                         nudged from the editor. Defaults put the house label
                         left of its vertical run and the venus label just
                         above the short link. */ ''}
                    <text x="${575 + (this.config.bkw_house_label_offset_x !== undefined ? this.config.bkw_house_label_offset_x : 0)}" y="${250 + (this.config.bkw_house_label_offset_y !== undefined ? this.config.bkw_house_label_offset_y : 0)}" class="${textClass} text-solar" style="${this.config.show_flow_rate_bkw === false ? 'display:none;' : getTextStyle(bkwToHouse, 'solar')}">${this._formatPower(bkwToHouse)}</text>
                    <text x="${470 + (this.config.bkw_grid_label_offset_x !== undefined ? this.config.bkw_grid_label_offset_x : 0)}" y="${18 + (this.config.bkw_grid_label_offset_y !== undefined ? this.config.bkw_grid_label_offset_y : 0)}" class="${textClass} text-export" style="${this.config.show_flow_rate_bkw === false ? 'display:none;' : getTextStyle(bkwToGrid, 'grid')}">${this._formatPower(bkwToGrid)}</text>
                    <text x="${615 + (this.config.bkw_venus_label_offset_x !== undefined ? this.config.bkw_venus_label_offset_x : 0)}" y="${28 + (this.config.bkw_venus_label_offset_y !== undefined ? this.config.bkw_venus_label_offset_y : 0)}" class="${textClass} text-solar" style="${this.config.show_flow_rate_bkw === false ? 'display:none;' : getTextStyle(bkwToVenus, 'solar')}">${this._formatPower(bkwToVenus)}</text>

                    <text x="${220 + (this.config.consumer_1_label_offset_x !== undefined ? this.config.consumer_1_label_offset_x : 0)}" y="${320 + (this.config.consumer_1_label_offset_y !== undefined ? this.config.consumer_1_label_offset_y : -25)}" class="${textClass} text-consumer-1" style="${getTextStyle(c1Val, 'consumer_1')}">${this._formatPower(c1Val)}</text>
                    <text x="${400 + (this.config.consumer_2_label_offset_x !== undefined ? this.config.consumer_2_label_offset_x : 0)}" y="${367 + (this.config.consumer_2_label_offset_y !== undefined ? this.config.consumer_2_label_offset_y : -25)}" class="${textClass} text-consumer-2" style="${getTextStyle(c2Val, 'consumer_2')}">${this._formatPower(c2Val)}</text>
                    <text x="${580 + (this.config.consumer_3_label_offset_x !== undefined ? this.config.consumer_3_label_offset_x : 0)}" y="${320 + (this.config.consumer_3_label_offset_y !== undefined ? this.config.consumer_3_label_offset_y : -25)}" class="${textClass} text-consumer-3" style="${getTextStyle(c3Val, 'consumer_3')}">${this._formatPower(c3Val)}</text>
                    <text x="${292 + (this.config.consumer_4_label_offset_x !== undefined ? this.config.consumer_4_label_offset_x : 0)}" y="${400 + (this.config.consumer_4_label_offset_y !== undefined ? this.config.consumer_4_label_offset_y : -25)}" class="${textClass} text-consumer-4" style="${getTextStyle(c4Val, 'consumer_4')}">${this._formatPower(c4Val)}</text>
                    <text x="${508 + (this.config.consumer_5_label_offset_x !== undefined ? this.config.consumer_5_label_offset_x : 0)}" y="${400 + (this.config.consumer_5_label_offset_y !== undefined ? this.config.consumer_5_label_offset_y : -25)}" class="${textClass} text-consumer-5" style="${getTextStyle(c5Val, 'consumer_5')}">${this._formatPower(c5Val)}</text>
                    <text x="${75 + (this.config.consumer_6_label_offset_x !== undefined ? this.config.consumer_6_label_offset_x : 0)}" y="${400 + (this.config.consumer_6_label_offset_y !== undefined ? this.config.consumer_6_label_offset_y : -25)}" class="${textClass} text-consumer-6" style="${getTextStyle(c6Val, 'consumer_6')}">${this._formatPower(c6Val)}</text>
                    <text x="${725 + (this.config.consumer_7_label_offset_x !== undefined ? this.config.consumer_7_label_offset_x : 0)}" y="${400 + (this.config.consumer_7_label_offset_y !== undefined ? this.config.consumer_7_label_offset_y : -25)}" class="${textClass} text-consumer-7" style="${getTextStyle(c7Val, 'consumer_7')}">${this._formatPower(c7Val)}</text>

                </svg>

                ${hasSolar ? (() => {
                  const liveText = this._formatPower(solarVal);
                  const liveColor = (isSolarActive || alwaysColor)
                    ? (this.config.color_text_solar ? 'var(--text-solar-color)' : 'var(--neon-yellow)')
                    : solarColor;
                  const rot = this._getBubbleRotationDisplay('solar', liveText, liveColor);
                  // Phase 5.24/5.25: solar bubble stays in its active color if
                  // (a) flowing, (b) donut active, or (c) global always-color toggle on.
                  // Phase 5.72: ALSO stay-coloured when mix-ring active, so the
                  // .solar.mix-ring CSS rule matches even at night when
                  // bubbleStateClass would otherwise be 'inactive'.
                  const bubbleStateClass = (isSolarActive || solarDonutActive || solarMixActive || alwaysColor) ? 'solar' : 'inactive';
                  const glowOnState = (isSolarActive || solarDonutActive || solarMixActive || alwaysColor) ? glowClass : '';
                  // Phase 5.72: optional mix-ring style vars. Independent
                  // of the PV-forecast donut: either can be on/off solo.
                  const solarMixGap = parseInt(this.config.solar_mix_gap !== undefined ? this.config.solar_mix_gap : 8, 10);
                  const solarMixThk = parseInt(this.config.solar_mix_thickness !== undefined ? this.config.solar_mix_thickness : 4, 10);
                  const solarStyleParts = [];
                  if (solarDonutActive) solarStyleParts.push(`--solar-gradient: ${solarGradientVal};`);
                  if (solarMixActive) {
                    solarStyleParts.push(`--solar-mix-gradient: ${solarMixGradientVal};`);
                    solarStyleParts.push(`--solar-mix-gap: ${solarMixGap}px;`);
                    solarStyleParts.push(`--solar-mix-thickness: ${solarMixThk}px;`);
                  }
                  return html`
                  <div class="bubble ${bubbleStateClass} node-solar ${solarDonutActive ? 'donut' : ''} ${solarMixActive ? 'mix-ring' : ''} ${tintClass} ${glowOnState}"
                      style="${solarStyleParts.join(' ')}"
                      @click=${() => this._handleClick(entities.solar)}>
                      ${this._renderSparklineForSource('solar')}
                      ${renderMainIcon('solar', solarVal, iconSolar, solarColor)}
                      ${renderSecondaryOrLabel(labelSolarText, showLabelSolar, entities.secondary_solar, hasSecondarySolar, 'secondary_solar')}
                      <div class="value rotating-value" style="color: ${rot.color};">${rot.text}</div>
                  </div>`;
                })() : ''}
                
                ${hasGrid ? (() => {
                  const liveText = this._formatPower(isGridExporting ? gridExport : gridImport);
                  const rot = this._getBubbleRotationDisplay('grid', liveText, gridTextColor);
                  const showArrow = rot.kind === 'live';
                  // Phase 5.24/5.25: grid bubble stays in active color if flowing,
                  // donut active, or global always-color toggle on.
                  // Phase 5.73: ALSO stay-coloured when mix-ring active so the
                  // .grid.mix-ring CSS rule matches even at zero-flow moments.
                  // We keep the bidirectional exporting distinction for active
                  // flow only; mix-ring on its own falls back to plain 'grid'.
                  const bubbleStateClass = isGridActive
                    ? (isGridExporting ? 'grid exporting' : 'grid')
                    : ((gridDonutActive || gridMixActive || alwaysColor) ? 'grid' : 'inactive');
                  const glowOnState = (isGridActive || gridDonutActive || gridMixActive || alwaysColor) ? glowClass : '';
                  // Phase 5.73: optional mix-ring style vars. Independent
                  // of the Tages-Mix donut: either can be on/off solo.
                  const gridMixGap = parseInt(this.config.grid_mix_gap !== undefined ? this.config.grid_mix_gap : 8, 10);
                  const gridMixThk = parseInt(this.config.grid_mix_thickness !== undefined ? this.config.grid_mix_thickness : 4, 10);
                  const gridStyleParts = [];
                  if (gridDonutActive) gridStyleParts.push(`--grid-gradient: ${gridGradientVal};`);
                  if (gridMixActive) {
                    gridStyleParts.push(`--grid-mix-gradient: ${gridMixGradientVal};`);
                    gridStyleParts.push(`--grid-mix-gap: ${gridMixGap}px;`);
                    gridStyleParts.push(`--grid-mix-thickness: ${gridMixThk}px;`);
                  }
                  return html`
                  <div class="bubble ${bubbleStateClass} node-grid ${gridDonutActive ? 'donut' : ''} ${gridMixActive ? 'mix-ring' : ''} ${tintClass} ${glowOnState}"
                      style="${gridStyleParts.join(' ')}"
                      @click=${() => this._handleClick(entities.grid_combined || entities.grid)}>
                      ${this._renderSparklineForSource('grid')}
                      ${renderMainIcon('grid', isGridExporting ? gridExport : gridImport, iconGrid, gridIconColor)}
                      ${renderSecondaryOrLabel(labelGridText, showLabelGrid, entities.secondary_grid, hasSecondaryGrid, 'secondary_grid')}
                      <div class="value rotating-value" style="color: ${rot.color};">
                          ${showArrow ? (isGridExporting ? html`<span class="direction-arrow">&#9650;</span>` : (isGridActive ? html`<span class="direction-arrow">&#9660;</span>` : '')) : ''}
                          ${rot.text}
                      </div>
                  </div>`;
                })() : ''}
                
                ${hasBattery ? (() => {
                  // Phase 5.36: rotation + SoC donut for battery bubble.
                  // The "live" slot for the battery shows EITHER the SoC% or the
                  // power value (in W) depending on the user's battery_show_power
                  // toggle -- same logic as before, just routed through the
                  // rotation helper now.
                  const liveText = this.config.battery_show_power
                    ? this._formatPower(battery)
                    : Math.round(battSoc) + '%';
                  const liveColor = this.config.color_text_battery
                    ? 'var(--text-battery-color)'
                    : 'var(--neon-green)';
                  const rot = this._getBubbleRotationDisplay('battery', liveText, liveColor);
                  // Phase 5.68: optional mix-ring class + CSS custom properties.
                  // Independent from the SoC donut: either can be on/off solo or
                  // both together. Defaults: gap 8px, thickness 4px.
                  const batteryMixGap = parseInt(this.config.battery_mix_gap !== undefined ? this.config.battery_mix_gap : 8, 10);
                  const batteryMixThk = parseInt(this.config.battery_mix_thickness !== undefined ? this.config.battery_mix_thickness : 4, 10);
                  const batteryStyleParts = [];
                  if (batteryDonutActive) batteryStyleParts.push(`--battery-gradient: ${batteryGradientVal};`);
                  if (batteryMixActive) {
                    batteryStyleParts.push(`--battery-mix-gradient: ${batteryMixGradientVal};`);
                    batteryStyleParts.push(`--battery-mix-gap: ${batteryMixGap}px;`);
                    batteryStyleParts.push(`--battery-mix-thickness: ${batteryMixThk}px;`);
                  }
                  return html`
                  <div class="bubble battery node-battery ${batteryDonutActive ? 'donut' : ''} ${batteryMixActive ? 'mix-ring' : ''} ${tintClass} ${glowClass}"
                      style="${batteryStyleParts.join(' ')}"
                      @click=${() => this._handleClick(entities.battery)}>
                      ${this._renderSparklineForSource('battery')}
                      ${renderMainIcon('battery', battSoc, iconBattery)}
                      ${renderSecondaryOrLabel(labelBatteryText, showLabelBattery, entities.secondary_battery, hasSecondaryBattery, 'secondary_battery')}
                      <div class="value rotating-value" style="color: ${rot.color};">${rot.text}</div>
                  </div>`;
                })() : ''}
                
                ${/* Venus bubble: gated by hasVenus (Phase 5.14 - was missing wrapper before). */ ''}
                ${hasVenus ? (() => {
                  // Phase 5.37: rotation + SoC donut for venus bubble.
                  // Mirror of the battery treatment in phase 5.36. The live slot
                  // shows EITHER the SoC% or the power value (W) depending on
                  // the venus_show_power toggle -- preserved as default behaviour.
                  const liveText = this.config.venus_show_power
                    ? this._formatPower(venus)
                    : Math.round(venusSoc) + '%';
                  const liveColor = this.config.color_text_venus
                    ? 'var(--text-venus-color)'
                    : 'var(--venus-color)';
                  const rot = this._getBubbleRotationDisplay('venus', liveText, liveColor);
                  // Phase 5.70: optional mix-ring class + CSS custom properties.
                  // Identical pattern to LG (phase 5.68). Defaults: gap 8px, thickness 4px.
                  const venusMixGap = parseInt(this.config.venus_mix_gap !== undefined ? this.config.venus_mix_gap : 8, 10);
                  const venusMixThk = parseInt(this.config.venus_mix_thickness !== undefined ? this.config.venus_mix_thickness : 4, 10);
                  const venusStyleParts = [];
                  if (venusDonutActive) venusStyleParts.push(`--venus-gradient: ${venusGradientVal};`);
                  if (venusMixActive) {
                    venusStyleParts.push(`--venus-mix-gradient: ${venusMixGradientVal};`);
                    venusStyleParts.push(`--venus-mix-gap: ${venusMixGap}px;`);
                    venusStyleParts.push(`--venus-mix-thickness: ${venusMixThk}px;`);
                  }
                  return html`
                  <div class="bubble venus node-venus ${venusDonutActive ? 'donut' : ''} ${venusMixActive ? 'mix-ring' : ''} ${tintClass} ${glowClass}"
                      style="${venusStyleParts.join(' ')}"
                      @click=${() => this._handleClick(entities.venus)}>
                      ${this._renderSparklineForSource('venus')}
                      ${renderMainIcon('venus', venusSoc, iconVenus)}
                      ${renderSecondaryOrLabel(labelVenusText, showLabelVenus, entities.secondary_venus, hasSecondaryVenus, 'secondary_venus')}
                      <div class="value rotating-value" style="color: ${rot.color};">${rot.text}</div>
                  </div>`;
                })() : ''}

                ${/* Phase BKW-1: garden balcony plant.
                     Phase BKW-8: rotation and sparkline wired up. Both helpers
                     are prefix-driven, so 'bkw' works without touching them --
                     bkw_rotate_show_live, bkw_rotate_daily_1..3 and
                     bkw_sparkline_* behave exactly like their solar twins. */ ''}
                ${hasBkw ? (() => {
                  const bkwLiveText = this._formatPower(bkwVal);
                  const bkwLiveColor = this.config.color_text_bkw
                    ? 'var(--text-bkw-color)'
                    : 'var(--bkw-color)';
                  const bkwRot = this._getBubbleRotationDisplay('bkw', bkwLiveText, bkwLiveColor);
                  // Phase BKW-12: greys out when idle, mirroring the solar
                  // bubble. Previously the active class was hard-wired, so the
                  // garden bubble would have stayed lit at night for anyone who
                  // turns always_color_bubbles off.
                  const bkwThreshold = this.config.bkw_animation_threshold !== undefined ? this.config.bkw_animation_threshold : 1;
                  const isBkwActive = bkwVal > bkwThreshold;
                  const bkwStateClass = (isBkwActive || bkwDonutActive || alwaysColor) ? 'solar' : 'inactive';
                  const bkwGlowOnState = (isBkwActive || bkwDonutActive || alwaysColor) ? glowClass : '';
                  return html`
                  <div class="bubble ${bkwStateClass} node-bkw ${bkwDonutActive ? 'donut' : ''} ${tintClass} ${bkwGlowOnState}"
                      style="${bkwDonutActive ? `--solar-gradient: ${bkwGradientVal};` : ''}"
                      @click=${() => this._handleClick(entities.bkw)}>
                      ${this._renderSparklineForSource('bkw')}
                      ${renderMainIcon('solar', bkwVal, this.config.bkw_icon || 'mdi:solar-panel')}
                      ${renderLabel(this.config.bkw_label || 'BKW', this.config.show_label_bkw !== false)}
                      <div class="value rotating-value" style="color: ${bkwRot.color};">${bkwRot.text}</div>
                  </div>`;
                })() : ''}
                
                ${(() => {
                  // Phase 5.77: house bubble wrapped in an IIFE returning a
                  // single html`` template, identical in structure to the
                  // solar/grid/battery/venus bubbles above. Previously the
                  // house bubble was a bare inline <div> and the
                  // ${this._renderSparklineForSource('house')} expression
                  // inside it silently failed to render (diag proved: a
                  // hardcoded sibling element rendered, but the method-call
                  // expression at that position did not -- a lit-html binding
                  // quirk specific to that inline position). Moving it into an
                  // IIFE that returns one html`` template -- the exact pattern
                  // the working source bubbles use -- fixes it.
                  return html`
                  <div class="bubble house node-house ${showDonut ? 'donut' : ''} ${houseMixActive ? 'mix-ring' : ''} ${tintClass}"
                      style="${houseBubbleStyle}"
                      @click=${() => this._handleClick(entities.house)}>
                      ${this._renderSparklineForSource('house')}
                      ${renderMainIcon('house', 0, this.config.house_icon || null, this.config.color_icon_house ? 'var(--icon-house-color)' : houseDominantColor)}
                      ${renderSecondaryOrLabel(labelHouseText, showLabelHouse, entities.secondary_house, hasSecondaryHouse, 'secondary_house')}
                      <div class="value" style="${houseTextStyle}">${this._formatPower(houseDisplay)}</div>
                  </div>`;
                })()}

                ${this.config.temp_enabled === true ? (() => {
                  const tEnts = this.config.entities || {};
                  const tInId  = tEnts.temp_indoor  || this.config.temp_indoor_entity  || 'sensor.haus_durchschnittstemperatur';
                  const tOutId = tEnts.temp_outdoor || this.config.temp_outdoor_entity || 'sensor.sbht_003c_993b_temperature';
                  const tOffX = this.config.temp_offset_x !== undefined ? parseFloat(this.config.temp_offset_x) : 0;
                  const tOffY = this.config.temp_offset_y !== undefined ? parseFloat(this.config.temp_offset_y) : 0;
                  return html`
                  <div class="bubble temp node-temp ${tintClass}"
                       style="--temp-offset-x: ${tOffX}px; --temp-offset-y: ${tOffY}px;">
                      ${this._renderTempSparkline('indoor')}
                      ${this._renderTempSparkline('outdoor')}
                      ${this._renderTempPanel()}
                      <div style="position:absolute;left:0;top:0;width:50%;height:100%;cursor:pointer;z-index:10;"
                           @click=${() => this._handleClick(tInId)}></div>
                      <div style="position:absolute;left:50%;top:0;width:50%;height:100%;cursor:pointer;z-index:10;"
                           @click=${() => this._handleClick(tOutId)}></div>
                  </div>`;
                })() : ''}

                ${renderConsumer(showC1, 'c1', 'consumer_1', labelC1, 'car', c1Val, this._getConsumerColor(1))}
                ${renderConsumer(showC2, 'c2', 'consumer_2', labelC2, 'heater', c2Val, this._getConsumerColor(2))}
                ${renderConsumer(showC3, 'c3', 'consumer_3', labelC3, 'pool', c3Val, this._getConsumerColor(3))}

                ${renderConsumer(showC4, 'c4', 'consumer_4', this.config.consumer_4_label || 'Consumer 4', null, c4Val, this._getConsumerColor(4))}
                ${renderConsumer(showC5, 'c5', 'consumer_5', this.config.consumer_5_label || 'Consumer 5', null, c5Val, this._getConsumerColor(5))}
                ${renderConsumer(showC6, 'c6', 'consumer_6', this.config.consumer_6_label || 'Consumer 6', null, c6Val, this._getConsumerColor(6))}
                ${renderConsumer(showC7, 'c7', 'consumer_7', this.config.consumer_7_label || 'Consumer 7', null, c7Val, this._getConsumerColor(7))}
                
            </div>
        </div>
      </ha-card>
    `;
    }

    render() {
      if (!this.config || !this.hass) return html``;

      const inner = this._renderStandardView(this.config.entities || {});

      // Phase A1.4: the flow lives in .hf-flow-host. In side-panels mode all
      // three columns are FIXED px so panels + center == host exactly (no
      // overflow, no feedback loop). center = host - 2*panelW - 2*gap.
      const flowBlock = html`<div class="hf-flow-host">${inner}</div>`;

      if (this.config.side_panels_enabled !== true) {
        return flowBlock;
      }

      const panelW = this.config.side_panel_width !== undefined ? this.config.side_panel_width : 320;
      const gap = this.config.side_panel_gap !== undefined ? this.config.side_panel_gap : 40;
      const hostW = this._cardWidth || 1200;
      const centerW = Math.max(400, hostW - 2 * panelW - 2 * gap);
      // Responsive collapse: below the width where panels + a usable center fit,
      // stack everything into a single full-width column (panels above/below the
      // flow) instead of a 3-column grid that overflows on mobile. Same threshold
      // as the scale calc (sidePanelsStacked) so layout and scale agree.
      const stacked = (hostW - 2 * panelW - 2 * gap) < 400;
      const gridCols = stacked ? '1fr' : `${panelW}px ${centerW}px ${panelW}px`;
      return html`
        <div class="hf-side-panels-grid" style="grid-template-columns: ${gridCols}; gap: ${gap}px;">
          <div class="hf-panel hf-panel-left">${this._panelLeftEls || ''}</div>
          ${flowBlock}
          <div class="hf-panel hf-panel-right">${this._panelRightEls || ''}</div>
        </div>
      `;
    }
  }

  customElements.define("power-flux-card", PowerFluxCard);
})(lang_en, lang_de);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "power-flux-card",
  name: "Power Flux Card",
  description: "Advanced Animated Energy Flow Card",
});
