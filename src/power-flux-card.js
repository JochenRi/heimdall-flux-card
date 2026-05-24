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
        compact_view: false,
        compact_details: false,
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
    }

    firstUpdated() {
      this._resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            this._cardWidth = entry.contentRect.width;
          }
        }
      });
      this._resizeObserver.observe(this);
      
      // Phase 5.19: bubble value rotation -- a single shared timer ticks
      // forward; each rotating bubble uses (tick % activeSlots) to pick its
      // current slot. The interval is rebuilt on config change.
      this._rotationTick = 0;
      this._startRotationTimer();
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
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
      }
    }

    updated(changedProps) {
      super.updated(changedProps);
      if (changedProps.has('hass') && this.hass) {
        const isDark = this.hass.themes?.darkMode !== false;
        if (isDark) {
          this.removeAttribute('data-theme-light');
        } else {
          this.setAttribute('data-theme-light', '');
        }
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
      
      /* --- COMPACT VIEW STYLES --- */
      .compact-container {
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 120px;
        box-sizing: border-box;
      }

      .compact-bracket {
        height: 24px;
        width: 100%;
        position: relative;
      }
      .bracket-svg {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
        overflow: visible; /* Important for icons */
      }
      .bracket-line {
        fill: none;
        stroke-width: 1.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: d 0.5s ease;
      }
      .compact-icon-wrapper {
        position: absolute;
        top: -6px; /* Default top, overridden inline */
        padding: 0 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: left 0.5s ease;
      }
      .compact-icon {
        --mdc-icon-size: 20px;
      }

      .compact-bar-wrapper {
        height: 36px;
        width: 100%;
        background: var(--card-background-color, #333);
        border-radius: 5px;
        margin: 4px 0;
        display: flex;
        overflow: hidden;
        position: relative;
      }

      .bar-segment {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: bold;
        color: black; 
        transition: width 0.5s ease;
        white-space: nowrap;
        overflow: hidden;
      }

      /* --- COMPACT DETAILS STYLES --- */
      .compact-details {
        display: flex;
        gap: 12px;
        margin-top: 5px;
        padding: 10px 0px 4px;
      }
      .compact-details-column {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        border-right: 1px solid var(--divider-color, #444);
        padding-right: 8px;
      }
      .compact-details-header {
        font-size: 11px;
        font-weight: bold;
        text-transform: uppercase;
        text-align: right;
        opacity: 0.5;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
        border-bottom: 1px solid var(--divider-color, #444);
      }
      .compact-detail-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
      }
      .compact-detail-item ha-icon {
        --mdc-icon-size: 17px;
        flex-shrink: 0;
      }
      .compact-detail-label {
        opacity: 0.7;
        white-space: nowrap;
      }
      .compact-detail-value {
        font-weight: bold;
        margin-left: auto;
      }
      
      /* --- STANDARD VIEW STYLES --- */
      .scale-wrapper {
        width: 800px; /* must match SVG viewBox width (phase 5.5 / 5.6) */
        transform-origin: top left; 
        transition: transform 0.1s linear;
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
      .bubble.house.donut { border: none !important; --house-gradient: var(--neon-pink); background: transparent; }
      .bubble.house.donut.tinted { background: color-mix(in srgb, var(--neon-pink), transparent 85%); }
      .bubble.house.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px; 
          background: var(--house-gradient);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
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
      
      /* Phase 5.23: PV solar donut -- forecast progress ring */
      .bubble.solar.donut { border: none !important; background: transparent; }
      .bubble.solar.donut.tinted { background: color-mix(in srgb, var(--neon-yellow), transparent 85%); }
      .bubble.solar.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--solar-gradient, var(--neon-yellow));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
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
      
      /* Phase 5.37: Venus SoC donut ring */
      .bubble.venus.donut { border: none !important; background: transparent; }
      .bubble.venus.donut.tinted { background: color-mix(in srgb, var(--pipe-venus-color, var(--venus-color)), transparent 85%); }
      .bubble.venus.donut::before {
          content: ""; position: absolute; inset: 0; border-radius: 50%; padding: 4px;
          background: var(--venus-gradient, var(--pipe-venus-color, var(--venus-color)));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor; mask-composite: exclude; z-index: -1; pointer-events: none;
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

      .node-solar { top: 80px; left: 100px; }     
      .node-grid { top: 80px; left: 260px; }     
      .node-battery { top: 80px; left: 420px; }  
      .node-venus { top: 80px; left: 580px; }   
      .node-house { top: 245px; left: 355px; }   
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

    // --- RENDER COMPACT VIEW ---
    _renderCompactView(entities) {
      // 1. Get Values
      const getVal = (entity) => {
        const state = this.hass.states[entity];
        return state ? parseFloat(state.state) || 0 : 0;
      };
      const getValUnit = (entity, unitKw) => {
        return getVal(entity) * (unitKw ? 1000 : 1);
      };

      const solar = entities.solar ? Math.max(0, getValUnit(entities.solar, this.config.solar_unit_kw === true)) : 0;
      const hasGridCombined = !!(entities.grid_combined && entities.grid_combined !== "");
      const gridCombinedVal = hasGridCombined ? getValUnit(entities.grid_combined, this.config.grid_unit_kw === true) : 0;
      const gridMain = hasGridCombined ? gridCombinedVal : (entities.grid ? getValUnit(entities.grid, this.config.grid_unit_kw === true) : 0);
      const gridExportSensor = entities.grid_export ? getValUnit(entities.grid_export, this.config.grid_unit_kw === true) : 0;
      let battery = entities.battery ? getValUnit(entities.battery, this.config.battery_unit_kw === true) : 0;
      if (this.config.invert_battery) {
        battery *= -1;
      }
      let c1Val = entities.consumer_1 ? getValUnit(entities.consumer_1, this.config.consumer_1_unit_kw === true) : 0; // EV Value
      if (this.config.invert_consumer_1) { c1Val *= -1; }
      c1Val = Math.abs(c1Val);

      // 2. Logic Calculation
      let gridImport = 0;
      let gridExport = 0;

      if (hasGridCombined) {
        // COMBINED SENSOR: positive = import, negative = export
        gridImport = gridCombinedVal > 0 ? gridCombinedVal : 0;
        gridExport = gridCombinedVal < 0 ? Math.abs(gridCombinedVal) : 0;
      } else if (entities.grid_export && entities.grid_export !== "") {
        gridImport = gridMain > 0 ? gridMain : 0;
        gridExport = Math.abs(gridExportSensor);
      } else {
        gridImport = gridMain > 0 ? gridMain : 0;
        gridExport = gridMain < 0 ? Math.abs(gridMain) : 0;
      }

      // Check for separate battery charge/discharge sensors
      const hasBattChargeSensor = !!(entities.battery_charge && entities.battery_charge !== "");
      const hasBattDischargeSensor = !!(entities.battery_discharge && entities.battery_discharge !== "");

      const batteryCharge = hasBattChargeSensor ? Math.abs(getVal(entities.battery_charge)) : (battery > 0 ? battery : 0);
      const batteryDischarge = hasBattDischargeSensor ? Math.abs(getVal(entities.battery_discharge)) : (battery < 0 ? Math.abs(battery) : 0);

      let solarToBatt = 0;
      let gridToBatt = 0;

      if (batteryCharge > 0) {
        const hasGridToBattSensor = !!(entities.grid_to_battery && entities.grid_to_battery !== "");
        if (this.config.battery_charge_via_house === true) {
          // Battery charges via house: no direct solar→batt or grid→batt pipes
          solarToBatt = 0;
          gridToBatt = 0;
        } else if (hasGridToBattSensor) {
          gridToBatt = Math.abs(getVal(entities.grid_to_battery));
          solarToBatt = Math.max(0, batteryCharge - gridToBatt);
        } else {
          if (solar >= batteryCharge) {
            solarToBatt = batteryCharge;
            gridToBatt = 0;
          } else {
            solarToBatt = solar;
            gridToBatt = batteryCharge - solar;
          }
        }
      }

      const solarTotalToCons = Math.max(0, solar - solarToBatt - gridExport);
      const gridTotalToCons = Math.max(0, gridImport - gridToBatt);
      const battTotalToCons = batteryDischarge;

      const totalCons = solarTotalToCons + gridTotalToCons + battTotalToCons;

      // Calculate Splits
      let evPower = 0;
      let housePower = totalCons;

      if (c1Val > 0 && totalCons > 0) {
        evPower = Math.min(c1Val, totalCons);
        housePower = totalCons - evPower;
      }

      // Calculate Total Bar Width (Flux)
      // The Bar represents: Battery Discharge + Solar + Grid Import
      // This MUST equal: House + EV + Export + Battery Charge

      // SOURCES (for Bar Segments)
      const srcBattery = batteryDischarge;
      const srcSolar = solar; // Solar includes Export + Charge + Cons
      const srcGrid = gridImport;

      const totalFlux = srcBattery + srcSolar + srcGrid;

      // DESTINATIONS (for Bottom Brackets)
      const destHouse = housePower;
      const destEV = evPower;
      const destExport = gridExport;
      // Note: Battery Charge is also a destination (internal flow), but usually not bracketed if we only want "Consumers"
      // If we don't bracket Charge, there will be a gap. We can accept that or add a Charge bracket.
      // Given user request "Only EV... and Grid Export", we stick to those.

      const threshold = 0.1;
      const availableWidth = (this._cardWidth && this._cardWidth > 0) ? this._cardWidth : (this.offsetWidth || 400);
      const fullWidth = availableWidth - 40;

      if (totalFlux <= threshold) {
        return html`<ha-card><div class="compact-container">Waiting for data...</div></ha-card>`;
      }

      // --- GENERATE BAR SEGMENTS (Aggregated by Source) ---
      // Order: Battery -> Solar -> Grid
      const barSegments = [];
      let currentX = 0;

      const addSegment = (val, color, type, label, entityId) => {
        if (val <= threshold) return;
        const pct = val / totalFlux;
        const width = pct * fullWidth;
        barSegments.push({
          val,
          color,
          widthPct: pct * 100,
          widthPx: width,
          startPx: currentX,
          type,
          label,
          entityId
        });
        currentX += width;
      }

      addSegment(srcBattery, 'var(--neon-green)', 'battery', 'battery', entities.battery);
      addSegment(srcSolar, 'var(--neon-yellow)', 'solar', 'solar', entities.solar);
      addSegment(srcGrid, 'var(--neon-blue)', 'grid', 'grid', entities.grid_combined || entities.grid);

      // --- GENERATE TOP BRACKETS (Based on Bar Segments) ---
      const topBrackets = barSegments.map(s => {
        const path = this._createBracketPath(s.startPx, s.widthPx, 'down');
        let icon = '';
        let iconColor = '';
        if (s.type === 'solar') { icon = 'mdi:weather-sunny'; iconColor = 'var(--icon-solar-color)'; }
        if (s.type === 'grid') { icon = 'mdi:transmission-tower'; iconColor = 'var(--icon-grid-color)'; }
        if (s.type === 'battery') { icon = 'mdi:battery-high'; iconColor = 'var(--icon-battery-color)'; }

        return { path, width: s.widthPx, center: s.startPx + (s.widthPx / 2), icon, iconColor, val: s.val, entityId: s.entityId };
      });

      // --- GENERATE BOTTOM BRACKETS (Independent Calculation) ---
      // Order: House -> EV -> Export
      const bottomBrackets = [];
      let bottomX = 0;

      const addBottomBracket = (val, type, entityId = null) => {
        if (val <= threshold) return;
        const pct = val / totalFlux;
        const width = pct * fullWidth;

        let icon = '';
        let iconColor = '';

        if (type === 'house') { icon = 'mdi:home'; iconColor = 'var(--icon-house-color)'; }
        if (type === 'car') { icon = 'mdi:car-electric'; iconColor = 'var(--icon-consumer-1-color)'; }
        if (type === 'export') { icon = 'mdi:arrow-right-box'; iconColor = 'var(--export-color)'; }
        if (type === 'battery') { icon = 'mdi:battery-charging-high'; iconColor = 'var(--icon-battery-color)'; }

        const path = this._createBracketPath(bottomX, width, 'up');
        bottomBrackets.push({
          path,
          width: width,
          center: bottomX + (width / 2),
          icon,
          iconColor,
          val,
          entityId
        });
        bottomX += width;
      };

      addBottomBracket(destHouse, 'house', entities.house);
      addBottomBracket(destEV, 'car', entities.consumer_1);
      addBottomBracket(destExport, 'export', entities.grid_combined || entities.grid_export || entities.grid);
      addBottomBracket(batteryCharge, 'battery', entities.battery);

      // Note: If there is Battery Charging happening, bottomX will not reach fullWidth. 
      // This leaves a gap at the end (or between segments depending on logic), which is visually correct 
      // as "Internal/Stored Energy" is not an external output.

      return html`
        <ha-card>
            <div class="compact-container">
                <!-- TOP BRACKETS -->
                <div class="compact-bracket">
                    <svg class="bracket-svg" width="100%" height="100%">
                        ${topBrackets.map(b => this._renderSVGPath(b.path, b.iconColor))}
                    </svg>
                    ${topBrackets.map(b => b.width > 20 ? html`
                    <div class="compact-icon-wrapper" 
                         style="left: ${b.center}px; transform: translateX(-50%); top: 4px; cursor: ${b.entityId ? 'pointer' : 'default'};"
                         title="${this._formatPower(b.val)}"
                         @click=${() => b.entityId && this._handleClick(b.entityId)}>
                        <ha-icon icon="${b.icon}" class="compact-icon" style="color: ${b.iconColor};"></ha-icon>
                    </div>` : '')}
                </div>

                <!-- MAIN BAR -->
                <div class="compact-bar-wrapper">
                    ${barSegments.map(s => {
                        const textColor = s.type === 'solar' && this.config.color_text_solar ? 'var(--text-solar-color)'
                          : s.type === 'grid' && this.config.color_text_grid ? 'var(--text-grid-color)'
                          : s.type === 'battery' && this.config.color_text_battery ? 'var(--text-battery-color)'
                          : (s.color === 'var(--export-purple)' ? 'white' : 'black');
                        return html`
                        <div class="bar-segment" 
                             style="width: ${s.widthPct}%; background: ${s.color}; color: ${textColor}; cursor: ${s.entityId ? 'pointer' : 'default'};"
                             title="${this._formatPower(s.val)}"
                             @click=${() => s.entityId && this._handleClick(s.entityId)}>
                            ${s.widthPx > 35 ? this._formatPower(s.val) : ''}
                        </div>
                    `})}
                </div>

                <!-- BOTTOM BRACKETS -->
                <div class="compact-bracket">
                    <svg class="bracket-svg" width="100%" height="100%">
                        ${bottomBrackets.map(b => this._renderSVGPath(b.path, b.iconColor))}
                    </svg>
                    ${bottomBrackets.map(b => b.width > 20 ? html`
                    <div class="compact-icon-wrapper" 
                         style="left: ${b.center}px; transform: translateX(-50%); top: -3px; cursor: ${b.entityId ? 'pointer' : 'default'};"
                         title="${this._formatPower(b.val)}"
                         @click=${() => b.entityId && this._handleClick(b.entityId)}>
                        <ha-icon icon="${b.icon}" class="compact-icon" style="color: ${b.iconColor};"></ha-icon>
                    </div>` : '')}
                </div>

                ${this.config.compact_details ? html`
                <!-- COMPACT DETAILS -->
                <div class="compact-details">
                    <!-- IN COLUMN -->
                    <div class="compact-details-column">
                        <div class="compact-details-header">In</div>
                        ${solar > 0 ? html`
                        <div class="compact-detail-item" @click=${() => entities.solar && this._handleClick(entities.solar)} style="cursor: ${entities.solar ? 'pointer' : 'default'};">
                            <ha-icon icon="mdi:weather-sunny" style="color: var(--icon-solar-color);"></ha-icon>
                            <span class="compact-detail-label">Solar</span>
                            <span class="compact-detail-value" style="color: var(--text-solar-color, var(--neon-yellow));">${this._formatPower(solar)}</span>
                        </div>` : ''}
                        ${gridImport > 0 ? html`
                        <div class="compact-detail-item" @click=${() => (entities.grid_combined || entities.grid) && this._handleClick(entities.grid_combined || entities.grid)} style="cursor: ${(entities.grid_combined || entities.grid) ? 'pointer' : 'default'};">
                            <ha-icon icon="mdi:transmission-tower" style="color: var(--icon-grid-color);"></ha-icon>
                            <span class="compact-detail-label">Grid</span>
                            <span class="compact-detail-value" style="color: var(--text-grid-color, var(--neon-blue));">${this._formatPower(gridImport)}</span>
                        </div>` : ''}
                        ${batteryDischarge > 0 ? html`
                        <div class="compact-detail-item" @click=${() => entities.battery && this._handleClick(entities.battery)} style="cursor: ${entities.battery ? 'pointer' : 'default'};">
                            <ha-icon icon="mdi:battery-arrow-down" style="color: var(--icon-battery-color);"></ha-icon>
                            <span class="compact-detail-label">Batterie</span>
                            <span class="compact-detail-value" style="color: var(--text-battery-color, var(--neon-green));">${this._formatPower(batteryDischarge)}</span>
                        </div>` : ''}
                    </div>
                    <!-- OUT COLUMN -->
                    <div class="compact-details-column">
                        <div class="compact-details-header">Out</div>
                        ${destHouse > 0 ? html`
                        <div class="compact-detail-item" @click=${() => entities.house && this._handleClick(entities.house)} style="cursor: ${entities.house ? 'pointer' : 'default'};">
                            <ha-icon icon="mdi:home" style="color: var(--icon-house-color);"></ha-icon>
                            <span class="compact-detail-label">Haus</span>
                            <span class="compact-detail-value" style="color: var(--text-house-color, var(--neon-pink));">${this._formatPower(destHouse)}</span>
                        </div>` : ''}
                        ${batteryCharge > 0 ? html`
                        <div class="compact-detail-item" @click=${() => entities.battery && this._handleClick(entities.battery)} style="cursor: ${entities.battery ? 'pointer' : 'default'};">
                            <ha-icon icon="mdi:battery-arrow-up" style="color: var(--icon-battery-color);"></ha-icon>
                            <span class="compact-detail-label">Batterie</span>
                            <span class="compact-detail-value" style="color: var(--text-battery-color, var(--neon-green));">${this._formatPower(batteryCharge)}</span>
                        </div>` : ''}
                        ${evPower > 0 ? html`
                        <div class="compact-detail-item" @click=${() => entities.consumer_1 && this._handleClick(entities.consumer_1)} style="cursor: ${entities.consumer_1 ? 'pointer' : 'default'};">
                            <ha-icon icon="mdi:car-electric" style="color: var(--icon-consumer-1-color);"></ha-icon>
                            <span class="compact-detail-label">${this.config.consumer_1_label || 'EV'}</span>
                            <span class="compact-detail-value" style="color: var(--consumer-1-color);">${this._formatPower(evPower)}</span>
                        </div>` : ''}
                        ${gridExport > 0 ? html`
                        <div class="compact-detail-item" @click=${() => (entities.grid_combined || entities.grid_export || entities.grid) && this._handleClick(entities.grid_combined || entities.grid_export || entities.grid)} style="cursor: ${(entities.grid_combined || entities.grid_export || entities.grid) ? 'pointer' : 'default'};">
                            <ha-icon icon="mdi:arrow-right-box" style="color: var(--export-color);"></ha-icon>
                            <span class="compact-detail-label">Export</span>
                            <span class="compact-detail-value" style="color: var(--export-color);">${this._formatPower(gridExport)}</span>
                        </div>` : ''}
                    </div>
                </div>` : ''}
            </div>
        </ha-card>
      `;
    }

    // --- RENDER STANDARD VIEW ---
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

      if (hasVenus && venusCharge > 0) {
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

      let solarToHouse = Math.max(0, solarVal - solarToBatt - gridExport);
      let gridToHouse = Math.max(0, gridImport - gridToBatt);
      const house = solarToHouse + gridToHouse + batteryDischarge + venusDischarge;

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
      const availableWidth = this._cardWidth || designWidth;
      const baseScale = availableWidth / designWidth;
      const userZoom = this.config.zoom !== undefined ? this.config.zoom : 0.9;
      let scale = baseScale * userZoom;

      // Phase 5.16: smart-cap removed -- user can choose zoom > 1.0 to make
      // the card larger than its container (it will overflow vertically).
      // Lower bound kept at 0.5 to prevent unreadably small layouts.
      if (scale < 0.5) scale = 0.5;

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

      const houseTintStyle = showTint
        ? `background: color-mix(in srgb, ${houseDominantColor}, transparent 85%);`
        : '';

      const houseGlowStyle = showNeonGlow
        ? `box-shadow: 0 0 15px color-mix(in srgb, ${houseDominantColor}, transparent 60%);`
        : `box-shadow: none;`;

      const houseBubbleStyle = `${showDonut ? `--house-gradient: ${houseGradientVal};` : ''} ${houseTintStyle} ${houseGlowStyle}`;

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
        const donutStyle = c1Donut ? ` --c1-gradient: ${c1GradientVal};` : '';

        return html`
            <div class="bubble ${cssClass} ${cssClass.replace('c', 'node-c')} ${c1Donut ? 'donut' : ''} ${tintClass} ${glowClass}"
                style="${donutStyle}"
                @click=${() => this._handleClick(entities[configKey])}>
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

      const pathSolarHouse = "M 145 170 Q 145 290 355 290";
      const pathSolarBatt = "M 145 80 Q 305 35 465 80";
      const pathGridImport = "M 305 170 Q 305 290 355 290";
      const pathGridExport = "M 190 125 Q 225 155 260 125";
      const activeExportPath = pathGridExport;
      // Phase 5.34: PV→Grid (export) label is now positionable just like
      // the other primary labels. Defaults preserve the previous hardcoded
      // position so existing dashboards don't visually shift.
      const exportTextX = 230 + (this.config.solar_export_label_offset_x !== undefined ? this.config.solar_export_label_offset_x : 0);
      const exportTextY = 160 + (this.config.solar_export_label_offset_y !== undefined ? this.config.solar_export_label_offset_y : 0);
      const pathBattHouse = "M 465 170 Q 465 290 445 290";
      const pathHouseToBatt = "M 445 290 Q 465 290 465 170";
      // Venus pipes (mirrors battery pattern, geometrically distinct from LG paths)
      const pathSolarVenus = "M 145 80 Q 385 15 625 80";
      const pathVenusHouse = "M 625 170 Q 625 290 445 290";
      const pathHouseToVenus = "M 445 290 Q 625 290 625 170";
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
        
        <div class="scale-wrapper" style="transform: translate(${this.config.card_offset_x !== undefined ? this.config.card_offset_x : 0}px, ${this.config.card_offset_y !== undefined ? this.config.card_offset_y : 0}px) scale(${scale}); margin-top: ${-padTop}px;">
            
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
                    <path class="flow-line flow-venus" d="${pathHouseToVenus}" style="${(venusChargeViaHouse && venusCharge > 0) ? getAnimStyle(venusCharge, '--pipe-venus-opacity', 'venus') + ' ' + styleVenus : 'display:none;'}" />

                    <path class="flow-line" d="${pathHouseC1}" stroke="${this._getConsumerPipeColor(1)}" style="${getConsumerAnimStyle(c1PipeActive, c1Val, 1)}" />
                    <path class="flow-line" d="${pathHouseC2}" stroke="${this._getConsumerPipeColor(2)}" style="${getConsumerAnimStyle(c2PipeActive, c2Val, 2)}" />
                    <path class="flow-line" d="${pathHouseC3}" stroke="${this._getConsumerPipeColor(3)}" style="${getConsumerAnimStyle(c3PipeActive, c3Val, 3)}" />
                    <path class="flow-line" d="${pathHouseC4}" stroke="${this._getConsumerPipeColor(4)}" style="${getConsumerAnimStyle(c4PipeActive, c4Val, 4)}" />
                    <path class="flow-line" d="${pathHouseC5}" stroke="${this._getConsumerPipeColor(5)}" style="${getConsumerAnimStyle(c5PipeActive, c5Val, 5)}" />
                    <path class="flow-line" d="${pathHouseC6}" stroke="${this._getConsumerPipeColor(6)}" style="${getConsumerAnimStyle(c6PipeActive, c6Val, 6)}" />
                    <path class="flow-line" d="${pathHouseC7}" stroke="${this._getConsumerPipeColor(7)}" style="${getConsumerAnimStyle(c7PipeActive, c7Val, 7)}" />
                    <text x="${190 + (this.config.solar_label_offset_x !== undefined ? this.config.solar_label_offset_x : 0)}" y="${235 + (this.config.solar_label_offset_y !== undefined ? this.config.solar_label_offset_y : 0)}" class="${textClass} text-solar" style="${getTextStyle(solarToHouse, 'solar')} ${styleSolar}">${this._formatPower(solarToHouse)}</text>
                    <text x="300" y="45" class="${textClass} text-solar" style="${getTextStyle(solarToBatt, 'solar')} ${styleSolarBatt}">${this._formatPower(solarToBatt)}</text>
                    
                    <text x="${315 + (this.config.grid_label_offset_x !== undefined ? this.config.grid_label_offset_x : 0)}" y="${255 + (this.config.grid_label_offset_y !== undefined ? this.config.grid_label_offset_y : 0)}" class="${textClass} text-grid" style="${getTextStyle(gridToHouse, 'grid')} ${styleGrid}">${this._formatPower(gridToHouse)}</text>
                    <text x="${exportTextX}" y="${exportTextY}" class="${textClass} text-export" style="${getTextStyle(gridExport, 'grid')} ${styleGrid}">${this._formatPower(gridExport)}</text>
                    
                    <text x="${410 + (this.config.battery_label_offset_x !== undefined ? this.config.battery_label_offset_x : 0)}" y="${235 + (this.config.battery_label_offset_y !== undefined ? this.config.battery_label_offset_y : 0)}" class="${textClass} text-battery" style="${getTextStyle(batteryDischarge, 'battery')} ${styleBattery}">${this._formatPower(batteryDischarge)}</text>

                    <text x="${410 + (this.config.battery_label_offset_x !== undefined ? this.config.battery_label_offset_x : 0)}" y="${235 + (this.config.battery_label_offset_y !== undefined ? this.config.battery_label_offset_y : 0)}" class="${textClass} text-battery" style="${(batteryChargeViaHouse && batteryCharge > 0) ? getTextStyle(batteryCharge, 'battery') + ' ' + styleBattery : 'display:none;'}">${this._formatPower(batteryCharge)}</text>

                    <text x="380" y="40" class="${textClass} text-solar" style="${getTextStyle(solarToVenus, 'solar')} ${styleSolarVenus}">${this._formatPower(solarToVenus)}</text>
                    <text x="${540 + (this.config.venus_label_offset_x !== undefined ? this.config.venus_label_offset_x : 0)}" y="${235 + (this.config.venus_label_offset_y !== undefined ? this.config.venus_label_offset_y : 0)}" class="${textClass} text-venus" style="${getTextStyle(venusDischarge, 'venus')} ${styleVenus}">${this._formatPower(venusDischarge)}</text>
                    <text x="${540 + (this.config.venus_label_offset_x !== undefined ? this.config.venus_label_offset_x : 0)}" y="${235 + (this.config.venus_label_offset_y !== undefined ? this.config.venus_label_offset_y : 0)}" class="${textClass} text-venus" style="${(venusChargeViaHouse && venusCharge > 0) ? getTextStyle(venusCharge, 'venus') + ' ' + styleVenus : 'display:none;'}">${this._formatPower(venusCharge)}</text>

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
                  const bubbleStateClass = (isSolarActive || solarDonutActive || alwaysColor) ? 'solar' : 'inactive';
                  const glowOnState = (isSolarActive || solarDonutActive || alwaysColor) ? glowClass : '';
                  return html`
                  <div class="bubble ${bubbleStateClass} node-solar ${solarDonutActive ? 'donut' : ''} ${tintClass} ${glowOnState}"
                      style="${solarDonutActive ? `--solar-gradient: ${solarGradientVal};` : ''}"
                      @click=${() => this._handleClick(entities.solar)}>
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
                  const bubbleStateClass = isGridActive
                    ? (isGridExporting ? 'grid exporting' : 'grid')
                    : ((gridDonutActive || alwaysColor) ? 'grid' : 'inactive');
                  const glowOnState = (isGridActive || gridDonutActive || alwaysColor) ? glowClass : '';
                  return html`
                  <div class="bubble ${bubbleStateClass} node-grid ${gridDonutActive ? 'donut' : ''} ${tintClass} ${glowOnState}"
                      style="${gridDonutActive ? `--grid-gradient: ${gridGradientVal};` : ''}"
                      @click=${() => this._handleClick(entities.grid_combined || entities.grid)}>
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
                  return html`
                  <div class="bubble battery node-battery ${batteryDonutActive ? 'donut' : ''} ${tintClass} ${glowClass}"
                      style="${batteryDonutActive ? `--battery-gradient: ${batteryGradientVal};` : ''}"
                      @click=${() => this._handleClick(entities.battery)}>
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
                  return html`
                  <div class="bubble venus node-venus ${venusDonutActive ? 'donut' : ''} ${tintClass} ${glowClass}"
                      style="${venusDonutActive ? `--venus-gradient: ${venusGradientVal};` : ''}"
                      @click=${() => this._handleClick(entities.venus)}>
                      ${renderMainIcon('venus', venusSoc, iconVenus)}
                      ${renderSecondaryOrLabel(labelVenusText, showLabelVenus, entities.secondary_venus, hasSecondaryVenus, 'secondary_venus')}
                      <div class="value rotating-value" style="color: ${rot.color};">${rot.text}</div>
                  </div>`;
                })() : ''}
                
                <div class="bubble house node-house ${showDonut ? 'donut' : ''} ${tintClass}" 
                    style="${houseBubbleStyle}"
                    @click=${() => this._handleClick(entities.house)}>
                    ${renderMainIcon('house', 0, this.config.house_icon || null, this.config.color_icon_house ? 'var(--icon-house-color)' : houseDominantColor)}
                    ${renderSecondaryOrLabel(labelHouseText, showLabelHouse, entities.secondary_house, hasSecondaryHouse, 'secondary_house')}
                    <div class="value" style="${houseTextStyle}">${this._formatPower(houseDisplay)}</div>
                </div>

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

      // SWITCH VIEW BASED ON CONFIG
      if (this.config.compact_view === true) {
        return this._renderCompactView(this.config.entities || {});
      } else {
        return this._renderStandardView(this.config.entities || {});
      }
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
