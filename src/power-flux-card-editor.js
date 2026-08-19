import lang_en from "./lang-en.js";
import lang_de from "./lang-de.js";

const editorTranslations = {
    "en": lang_en.editor,
    "de": lang_de.editor
};


// Phase power-B0: the five entity keys the power tile owns. Single source of
// truth -- used to build the form data, to read the form result back, and
// registered in entityKeys for the legacy hand-wired path.
const POWER_FLUX_EDITOR_POWER_KEYS = [
    'power_autarkie',
    'power_lg_nutzbar', 'power_lg_reichweite',
    'power_venus_nutzbar', 'power_venus_reichweite',
];

// ---------------------------------------------------------------------------
// Phase editor-1: schema-driven bubble sections.
//
// Every bubble section in this editor is a hand-written copy of the same
// controls. Twelve copies, 5954 lines, and every new option has to be added
// twelve times -- which is how bkw_sparkline_test_mode, show_label_house,
// animation_threshold and show_flow_rates ended up readable by the card but
// not settable in the editor.
//
// BUBBLE_CAPS holds what each bubble can do. bubbleFields() turns that into a
// field list, and the field list is the SINGLE source for three things:
// the ha-form data, the ha-form schema, and the write whitelist in the
// change handler. They cannot drift apart because they are the same array.
//
// Deliberately NOT in the schema (see session notes 18.08.2026, section 3.4):
//   - colours: ha-form only offers color_rgb (number arrays), the config uses
//     hex strings, and color_rgb has no empty state so the reset button would
//     be lost. Colour pickers stay as markup, in place.
//   - entity pickers: they keep _renderEntitySelector, except for the donut
//     group, which is the flatten:false probe (see _bubbleEntitySchema).
// ---------------------------------------------------------------------------

const SPARKLINE_LAYERS = ['back', 'mid', 'front'];
const SPARKLINE_STYLES = ['area', 'line', 'area-line'];
const SPARKLINE_PERIODS = ['1h', '6h', '12h', '24h'];
const MIX_PERIODS = ['day', 'month', 'year'];

const BUBBLE_CAPS = {
    bkw: {
        label: true,
        icon: true,
        enabled: { key: 'bkw_enabled', def: true },
        showLabel: { key: 'show_label_bkw', def: true },
        unitKw: { key: 'bkw_unit_kw', def: false },
        showFlowRate: { key: 'show_flow_rate_bkw', def: true },
        animationThreshold: { key: 'bkw_animation_threshold', max: 200, def: 1 },
        labelOffsets: { targets: ['house', 'venus', 'grid'], range: 150, labels: 'axis' },
        rotation: { slots: 3, showLiveDef: true },
        donutToday: { toggleKey: 'bkw_donut_today_mode', toggleDef: false,
                      entities: ['bkw_donut_produced_today', 'bkw_donut_forecast_today'] },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: null, periodDef: undefined, testMode: true },
    },
    solar: {
        label: true,
        icon: true,
        showLabel: { key: 'show_label_solar', def: false },
        unitKw: { key: 'solar_unit_kw', def: false },
        showFlowRate: { key: 'show_flow_rate_solar', def: true },
        animationThreshold: { key: 'solar_animation_threshold', max: 200, def: 1 },
        // '' yields solar_label_offset_x, 'export' yields solar_export_label_offset_x
        labelOffsets: { targets: ['', 'export'], range: 100, labels: 'bubble' },
        rotation: { slots: 3, showLiveDef: true },
        donutToday: { toggleKey: 'pv_donut_today_mode', toggleDef: false,
                      labelKey: 'pv_donut_enabled',
                      entities: ['pv_donut_produced_today', 'pv_donut_forecast_today'] },
        mix: { toggleKey: 'solar_mix_donut_mode', toggleDef: false,
               periodDef: 'day', gapDef: 8, gapMax: 30,
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15 },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h', testMode: true },
    },
};

// A field: { key, def, selector, labelKey }. def is the value the legacy
// markup used as its fallback -- reproduced exactly so no switch flips on
// first open, and so the handler can avoid writing defaults into the YAML.
const bubbleFields = (prefix, group) => {
    const caps = BUBBLE_CAPS[prefix];
    if (!caps) return [];
    const f = [];
    const bool = (key, def, labelKey) =>
        f.push({ key, def, selector: { boolean: {} }, labelKey });
    const num = (key, def, min, max, step, labelKey) =>
        f.push({ key, def, selector: { number: { min, max, step, mode: 'slider' } }, labelKey });

    if (group === 'sensors') {
        if (caps.label) f.push({ key: `${prefix}_label`, def: undefined,
            selector: { text: {} }, labelKey: 'label', optional: true });
        if (caps.icon) f.push({ key: `${prefix}_icon`, def: undefined,
            selector: { icon: {} }, labelKey: 'icon', optional: true });
    }

    if (group === 'behavior') {
        if (caps.enabled) bool(caps.enabled.key, caps.enabled.def, `${prefix}_enabled`);
        if (caps.showLabel) bool(caps.showLabel.key, caps.showLabel.def, 'label_toggle');
        if (caps.unitKw) bool(caps.unitKw.key, caps.unitKw.def, `${prefix}_unit_kw`);
        if (caps.showFlowRate) bool(caps.showFlowRate.key, caps.showFlowRate.def, 'flow_rate_title');
        if (caps.animationThreshold) {
            const a = caps.animationThreshold;
            num(a.key, a.def, 0, a.max, 1, 'bubble_animation_threshold');
        }
    }

    if (group === 'offsets' && caps.labelOffsets) {
        const o = caps.labelOffsets;
        for (const target of o.targets) {
            const stem = target ? `${prefix}_${target}` : prefix;
            for (const axis of ['x', 'y']) {
                num(`${stem}_label_offset_${axis}`, 0, -o.range, o.range, 1,
                    o.labels === 'bubble'
                        ? `bubble_label_offset_${axis}`
                        : `__axis_${axis.toUpperCase()}`);
            }
        }
    }

    if (group === 'rotation' && caps.rotation) {
        bool(`${prefix}_rotate_show_live`, caps.rotation.showLiveDef, 'rotation_show_live');
        for (let n = 1; n <= caps.rotation.slots; n++) {
            bool(`${prefix}_rotate_show_daily_${n}`, false, `rotation_show_slot_${n}`);
        }
    }

    if (group === 'donut' && caps.donutToday) {
        const d = caps.donutToday;
        bool(d.toggleKey, d.toggleDef, d.labelKey || `${prefix}_donut_enabled`);
    }

    if (group === 'mix' && caps.mix) {
        const m = caps.mix;
        bool(m.toggleKey, m.toggleDef, `${prefix}_mix_enabled`);
        f.push({ key: `${prefix}_mix_period`, def: m.periodDef,
            selector: { select: { mode: 'dropdown', options: MIX_PERIODS } },
            labelKey: `${prefix}_mix_period`, optionLabels: `${prefix}_mix_period_` });
        num(`${prefix}_mix_gap`, m.gapDef, 0, m.gapMax, 1, `${prefix}_mix_gap`);
        num(`${prefix}_mix_thickness`, m.thicknessDef, m.thicknessMin, m.thicknessMax, 1,
            `${prefix}_mix_thickness`);
    }

    if (group === 'sparkline' && caps.sparkline) {
        const s = caps.sparkline;
        bool(`${prefix}_sparkline`, false, 'sparkline_enabled');
        if (s.periods) {
            // Period options are literal durations -- shown as-is, not translated.
            f.push({ key: `${prefix}_sparkline_period`, def: s.periodDef,
                selector: { select: { mode: 'dropdown', options: s.periods } },
                labelKey: 'sparkline_period', optionLabels: '' });
        } else {
            f.push({ key: `${prefix}_sparkline_period`, def: s.periodDef,
                selector: { text: {} }, labelKey: 'sparkline_period' });
        }
        f.push({ key: `${prefix}_sparkline_layer`, def: s.layerDef,
            selector: { select: { mode: 'dropdown', options: SPARKLINE_LAYERS } },
            labelKey: 'sparkline_layer', optionLabels: 'sparkline_layer_' });
        f.push({ key: `${prefix}_sparkline_style`, def: s.styleDef,
            selector: { select: { mode: 'dropdown', options: SPARKLINE_STYLES } },
            labelKey: 'sparkline_style', optionLabels: 'sparkline_style_' });
        num(`${prefix}_sparkline_opacity`, s.opacityDef, 0.05, 1, 0.05, 'sparkline_opacity');
        if (s.testMode) bool(`${prefix}_sparkline_test_mode`, false, 'sparkline_test_mode');
    }

    return f;
};

const fireEvent = (node, type, detail, options) => {
    options = options || {};
    detail = detail === null || detail === undefined ? {} : detail;
    const event = new Event(type, {
        bubbles: options.bubbles === undefined ? true : options.bubbles,
        cancelable: Boolean(options.cancelable),
        composed: options.composed === undefined ? true : options.composed,
    });
    event.detail = detail;
    node.dispatchEvent(event);
    return event;
};

const LitElement = customElements.get("ha-lit-element") || Object.getPrototypeOf(customElements.get("home-assistant-main"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class PowerFluxCardEditor extends LitElement {

    static get properties() {
        return {
            hass: {},
            _config: { state: true },
            _subView: { state: true } // Controls which sub-page is open (null = main)
        };
    }

    setConfig(config) {
        this._config = config;
    }

    _localize(key) {
        const lang = this.hass && this.hass.language ? this.hass.language : 'en';
        const dict = editorTranslations[lang] || editorTranslations['en'];
        return dict[key] || editorTranslations['en'][key] || key;
    }

    _valueChanged(ev) {
        if (!this._config || !this.hass) return;

        const target = ev.target;
        const key = target.configValue;

        let value;
        if (target.tagName === 'HA-SWITCH') {
            value = target.checked;
        } else if (ev.detail && 'value' in ev.detail) {
            value = ev.detail.value;
        } else {
            value = target.value;
        }

        if (value === null || value === undefined) {
            value = "";
        }

        if (key) {
            const entityKeys = [
                'solar', 'grid', 'grid_export', 'grid_combined',
                'battery', 'battery_soc', 'grid_to_battery',
                'battery_charge', 'battery_discharge',
                'venus', 'venus_soc', 'venus_charge', 'venus_discharge',
                'house',
                'temp_outdoor', 'temp_indoor', 'temp_forecast_high', 'temp_forecast_low',
                'temp_indoor_sparkline_entity', 'temp_outdoor_sparkline_entity',
                'consumer_1', 'consumer_2', 'consumer_3',
                'consumer_4', 'consumer_5',
                'consumer_6', 'consumer_7',
                'secondary_solar', 'secondary_grid', 'secondary_battery',
                'secondary_venus',
                'secondary_consumer_1', 'secondary_consumer_2', 'secondary_consumer_3',
                'secondary_consumer_4', 'secondary_consumer_5',
                'secondary_consumer_6', 'secondary_consumer_7',
                'secondary_house',
                'donut_today_solar', 'donut_today_battery', 'donut_today_venus', 'donut_today_grid',
                'grid_rotate_daily_1', 'grid_rotate_daily_2', 'grid_rotate_daily_3',
                'grid_donut_import_today', 'grid_donut_export_today',
                'solar_rotate_daily_1', 'solar_rotate_daily_2', 'solar_rotate_daily_3',
                'pv_donut_produced_today', 'pv_donut_forecast_today',
                'bkw', 'bkw_sparkline_entity',
                'bkw_rotate_daily_1', 'bkw_rotate_daily_2', 'bkw_rotate_daily_3',
                'bkw_donut_produced_today', 'bkw_donut_forecast_today',
                'battery_rotate_daily_1', 'battery_rotate_daily_2', 'battery_rotate_daily_3',
                'venus_rotate_daily_1', 'venus_rotate_daily_2', 'venus_rotate_daily_3',
                'consumer_1_rotate_daily_1', 'consumer_1_rotate_daily_2', 'consumer_1_rotate_daily_3',
                'consumer_5_rotate_daily_1', 'consumer_5_rotate_daily_2', 'consumer_5_rotate_daily_3',
                'consumer_7_rotate_daily_1', 'consumer_7_rotate_daily_2', 'consumer_7_rotate_daily_3',
                'consumer_2_rotate_daily_1', 'consumer_2_rotate_daily_2', 'consumer_2_rotate_daily_3',
                'consumer_3_rotate_daily_1', 'consumer_3_rotate_daily_2', 'consumer_3_rotate_daily_3',
                'consumer_4_rotate_daily_1', 'consumer_4_rotate_daily_2', 'consumer_4_rotate_daily_3',
                'consumer_6_rotate_daily_1', 'consumer_6_rotate_daily_2', 'consumer_6_rotate_daily_3',
                'consumer_6_mix_pv_day', 'consumer_6_mix_pv_month', 'consumer_6_mix_pv_year',
                'consumer_6_mix_lg_day', 'consumer_6_mix_lg_month', 'consumer_6_mix_lg_year',
                'consumer_6_mix_venus_day', 'consumer_6_mix_venus_month', 'consumer_6_mix_venus_year',
                'consumer_6_mix_grid_day', 'consumer_6_mix_grid_month', 'consumer_6_mix_grid_year',
                'consumer_4_mix_pv_day', 'consumer_4_mix_pv_month', 'consumer_4_mix_pv_year',
                'consumer_4_mix_lg_day', 'consumer_4_mix_lg_month', 'consumer_4_mix_lg_year',
                'consumer_4_mix_venus_day', 'consumer_4_mix_venus_month', 'consumer_4_mix_venus_year',
                'consumer_4_mix_grid_day', 'consumer_4_mix_grid_month', 'consumer_4_mix_grid_year',
                'consumer_3_mix_pv_day', 'consumer_3_mix_pv_month', 'consumer_3_mix_pv_year',
                'consumer_3_mix_lg_day', 'consumer_3_mix_lg_month', 'consumer_3_mix_lg_year',
                'consumer_3_mix_venus_day', 'consumer_3_mix_venus_month', 'consumer_3_mix_venus_year',
                'consumer_3_mix_grid_day', 'consumer_3_mix_grid_month', 'consumer_3_mix_grid_year',
                'consumer_2_mix_pv_day', 'consumer_2_mix_pv_month', 'consumer_2_mix_pv_year',
                'consumer_2_mix_lg_day', 'consumer_2_mix_lg_month', 'consumer_2_mix_lg_year',
                'consumer_2_mix_venus_day', 'consumer_2_mix_venus_month', 'consumer_2_mix_venus_year',
                'consumer_2_mix_grid_day', 'consumer_2_mix_grid_month', 'consumer_2_mix_grid_year',
                'consumer_7_mix_pv_day', 'consumer_7_mix_pv_month', 'consumer_7_mix_pv_year',
                'consumer_7_mix_lg_day', 'consumer_7_mix_lg_month', 'consumer_7_mix_lg_year',
                'consumer_7_mix_venus_day', 'consumer_7_mix_venus_month', 'consumer_7_mix_venus_year',
                'consumer_7_mix_grid_day', 'consumer_7_mix_grid_month', 'consumer_7_mix_grid_year',
                'consumer_5_mix_pv_day', 'consumer_5_mix_pv_month', 'consumer_5_mix_pv_year',
                'consumer_5_mix_lg_day', 'consumer_5_mix_lg_month', 'consumer_5_mix_lg_year',
                'consumer_5_mix_venus_day', 'consumer_5_mix_venus_month', 'consumer_5_mix_venus_year',
                'consumer_5_mix_grid_day', 'consumer_5_mix_grid_month', 'consumer_5_mix_grid_year',
                'consumer_1_mix_pv_day', 'consumer_1_mix_pv_month', 'consumer_1_mix_pv_year',
                'consumer_1_mix_lg_day', 'consumer_1_mix_lg_month', 'consumer_1_mix_lg_year',
                'consumer_1_mix_venus_day', 'consumer_1_mix_venus_month', 'consumer_1_mix_venus_year',
                'consumer_1_mix_grid_day', 'consumer_1_mix_grid_month', 'consumer_1_mix_grid_year',
                // Phase 5.67.1+: optional per-bubble sparkline source entity.
                // Added one bubble at a time as the sparkline feature rolls out.
                // 5.67    = Consumer 3 (Trockner)
                // 5.67.7  = Consumer 1 (Tesla)
                // 5.67.8  = Consumer 2 (Waschen)
                // 5.67.9  = Consumer 4 (Spüler)
                // 5.67.10 = Consumer 5 (BWWP)
                // 5.67.11 = Consumer 6 (Klima)
                // 5.67.12 = Consumer 7 (Pumpe) -- COMPLETES 7-BUBBLE PARITY
                'consumer_1_sparkline_entity',
                'consumer_2_sparkline_entity',
                'consumer_3_sparkline_entity',
                'consumer_4_sparkline_entity',
                'consumer_5_sparkline_entity',
                'consumer_6_sparkline_entity',
                'consumer_7_sparkline_entity',
                // Phase 5.68: LG (battery) charge-source mix ring. 2 sources
                // (PV + Grid) x 3 periods (day/month/year) = 6 sensor keys.
                // CRITICAL: every sensor-picker key MUST be in this array,
                // otherwise picked sensors land as top-level config keys
                // instead of under config.entities.* (Phase 4.15 bug).
                'battery_mix_pv_day', 'battery_mix_pv_month', 'battery_mix_pv_year',
                'battery_mix_grid_day', 'battery_mix_grid_month', 'battery_mix_grid_year',
                // Phase 5.69: LG sparkline source entity override (optional).
                // First source-bubble sparkline. Follows the same pattern as
                // consumer_X_sparkline_entity but with battery_ prefix.
                'battery_sparkline_entity',
                // Phase 5.70: Venus charge-source mix ring. Same 2-source schema
                // as LG: PV + Grid x 3 periods = 6 keys.
                'venus_mix_pv_day', 'venus_mix_pv_month', 'venus_mix_pv_year',
                'venus_mix_grid_day', 'venus_mix_grid_month', 'venus_mix_grid_year',
                // Phase 5.71: Venus sparkline source entity override (optional).
                'venus_sparkline_entity',
                // Phase 5.72: Solar PV-distribution mix ring (4 destinations).
                // House/LG/Venus/Grid x 3 periods = 12 keys.
                'solar_mix_house_day', 'solar_mix_house_month', 'solar_mix_house_year',
                'solar_mix_lg_day',    'solar_mix_lg_month',    'solar_mix_lg_year',
                'solar_mix_venus_day', 'solar_mix_venus_month', 'solar_mix_venus_year',
                'solar_mix_grid_day',  'solar_mix_grid_month',  'solar_mix_grid_year',
                // Phase 5.72: Solar sparkline source entity override (optional).
                'solar_sparkline_entity',
                // Phase 5.73: Grid Import/Export balance mix-ring (2 segments).
                // Import + Export x 3 periods = 6 keys, plus sparkline override.
                'grid_mix_import_day', 'grid_mix_import_month', 'grid_mix_import_year',
                'grid_mix_export_day', 'grid_mix_export_month', 'grid_mix_export_year',
                'grid_sparkline_entity',
                // Phase 5.74: House self-sufficiency mix-ring (2 segments) +
                // sparkline. Self + Grid x 3 periods = 6 keys, plus sparkline.
                'house_mix_self_day', 'house_mix_self_month', 'house_mix_self_year',
                'house_mix_grid_day', 'house_mix_grid_month', 'house_mix_grid_year',
                'house_sparkline_entity',
                // Phase power-1: power tile. Only the five values the card does
                // not already know. Everything else is reused from existing keys
                // (donut_today_*, pv_donut_*, bkw_donut_*, grid_combined, ...).
                'power_autarkie',
                'power_lg_nutzbar', 'power_lg_reichweite',
                'power_venus_nutzbar', 'power_venus_reichweite'
            ];

            let newConfig = { ...this._config };

            if (entityKeys.includes(key)) {
                const currentEntities = newConfig.entities || {};
                const newEntities = { ...currentEntities, [key]: value };
                newConfig.entities = newEntities;
            } else {
                newConfig[key] = value;

                if (key === 'show_comet_tail' && value === true) {
                    newConfig.show_dashed_line = false;
                }
                if (key === 'show_dashed_line' && value === true) {
                    newConfig.show_comet_tail = false;
                }
            }

            this._config = newConfig;
            fireEvent(this, "config-changed", { config: this._config });
        }
    }

    _goSubView(view) {
        this._subView = view;
    }

    _goBack() {
        this._subView = null;
    }

    _clearEntity(key) {
        const newConfig = { ...this._config };
        const currentEntities = newConfig.entities || {};
        const newEntities = { ...currentEntities, [key]: "" };
        newConfig.entities = newEntities;
        this._config = newConfig;
        fireEvent(this, "config-changed", { config: this._config });
    }

    _colorChanged(key, ev) {
        const newConfig = { ...this._config, [key]: ev.target.value };
        this._config = newConfig;
        fireEvent(this, "config-changed", { config: this._config });
    }

    _resetColor(key) {
        const newConfig = { ...this._config };
        delete newConfig[key];
        this._config = newConfig;
        fireEvent(this, "config-changed", { config: this._config });
    }

    // -----------------------------------------------------------------------
    // Phase editor-1: the three consumers of bubbleFields(). Data, schema and
    // write whitelist all come from the same array, so a field cannot exist in
    // one and be missing from another.
    // -----------------------------------------------------------------------

    // Form data. Defaults are reproduced exactly as the legacy markup computed
    // them, so opening a section never flips a switch.
    _bubbleFormData(prefix, group) {
        const data = {};
        for (const fld of bubbleFields(prefix, group)) {
            const cur = this._config[fld.key];
            data[fld.key] = cur !== undefined ? cur : fld.def;
        }
        return data;
    }

    _bubbleSchema(prefix, group) {
        return bubbleFields(prefix, group).map((fld) => {
            const entry = { name: fld.key, selector: fld.selector,
                            labelKey: fld.labelKey, optional: fld.optional };
            if (fld.optionLabels !== undefined) {
                // An empty optionLabels prefix means the values are literals
                // (durations such as "6h") and are shown unchanged. Otherwise
                // the legacy keys drop the hyphen: "area-line" -> ..._arealine.
                entry.selector = { select: { mode: 'dropdown',
                    options: fld.selector.select.options.map((v) => ({
                        value: v,
                        label: fld.optionLabels === '' ? v : this._localize(
                            `editor.${fld.optionLabels}${v.replace(/-/g, '')}`),
                    })) } };
            }
            return entry;
        });
    }

    _bubbleLabel(schemaEntry) {
        const k = schemaEntry.labelKey || schemaEntry.name;
        if (k === '__axis_X') return 'X';
        if (k === '__axis_Y') return 'Y';
        const txt = this._localize(`editor.${k}`);
        return schemaEntry.optional ? `${txt} (Optional)` : txt;
    }

    // Never assigns a whole object back -- only the keys this group declares.
    // A default is written only when the key already exists in the config, so
    // opening a section does not materialise thirty defaults into the YAML.
    _bubbleFormChanged(prefix, group, ev) {
        ev.stopPropagation();
        if (!this._config) return;
        const v = (ev.detail && ev.detail.value) || {};
        const cfg = { ...this._config };

        for (const fld of bubbleFields(prefix, group)) {
            if (!(fld.key in v)) continue;
            const val = v[fld.key];
            const isDefault = (val === fld.def) || (val === undefined) || (val === '');
            if (isDefault && !(fld.key in this._config)) continue;
            if (val === undefined || val === '') delete cfg[fld.key];
            else cfg[fld.key] = val;
        }

        this._config = cfg;
        fireEvent(this, "config-changed", { config: this._config });
    }

    // Shorthand so a section can drop in one line per group.
    _bubbleForm(prefix, group) {
        return html`
            <ha-form
                .hass=${this.hass}
                .data=${this._bubbleFormData(prefix, group)}
                .schema=${this._bubbleSchema(prefix, group)}
                .computeLabel=${(s) => this._bubbleLabel(s)}
                @value-changed=${(ev) => this._bubbleFormChanged(prefix, group, ev)}
            ></ha-form>
        `;
    }

    // Phase A3.2a: side-panel card-list management. Each panel is an array under
    // left_panel_cards / right_panel_cards. These helpers add/remove/reorder
    // entries immutably and fire config-changed, following the same pattern as
    // _colorChanged/_clearEntity above. The graphical picker (A3.2b) and the
    // per-card editor (A3.2c) build on top of this.
    _panelKey(side) {
        return side === 'left' ? 'left_panel_cards' : 'right_panel_cards';
    }

    _panelAddCard(side) {
        const key = this._panelKey(side);
        const list = Array.isArray(this._config[key]) ? [...this._config[key]] : [];
        // A3.2a default: a minimal, valid card the user can refine. Replaced by
        // the real card picker in A3.2b.
        list.push({ type: 'entities', entities: [] });
        const newConfig = { ...this._config, [key]: list };
        this._config = newConfig;
        fireEvent(this, "config-changed", { config: this._config });
    }

    _panelRemoveCard(side, index) {
        const key = this._panelKey(side);
        if (!Array.isArray(this._config[key])) return;
        const list = this._config[key].filter((_, i) => i !== index);
        const newConfig = { ...this._config, [key]: list };
        this._config = newConfig;
        fireEvent(this, "config-changed", { config: this._config });
    }

    _panelMoveCard(side, index, dir) {
        const key = this._panelKey(side);
        if (!Array.isArray(this._config[key])) return;
        const list = [...this._config[key]];
        const target = index + dir;
        if (target < 0 || target >= list.length) return;
        [list[index], list[target]] = [list[target], list[index]];
        const newConfig = { ...this._config, [key]: list };
        this._config = newConfig;
        fireEvent(this, "config-changed", { config: this._config });
    }

    // Phase A3.2b: apply edited YAML for one card. Parsed only on value-changed
    // (fires when the textarea commits, not per keystroke). Invalid YAML leaves
    // the existing config untouched and records an error to show inline -- a bad
    // paste must never destroy the config. State is kept per-side+index.
    _panelCardYamlChanged(side, index, ev) {
        const text = ev && ev.detail && 'value' in ev.detail ? ev.detail.value : (ev.target ? ev.target.value : '');
        const errKey = `${side}:${index}`;
        if (!this._panelYamlErrors) this._panelYamlErrors = {};
        let parsed;
        try {
            parsed = yamlMiniParse(text);
        } catch (e) {
            this._panelYamlErrors = { ...this._panelYamlErrors, [errKey]: (e && e.message) ? e.message : 'YAML-Fehler' };
            this.requestUpdate();
            return;
        }
        if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
            this._panelYamlErrors = { ...this._panelYamlErrors, [errKey]: 'Eine Karte muss ein YAML-Mapping mit "type:" sein.' };
            this.requestUpdate();
            return;
        }
        // valid: clear any prior error and write the card back into the list
        if (this._panelYamlErrors[errKey]) {
            const cleared = { ...this._panelYamlErrors };
            delete cleared[errKey];
            this._panelYamlErrors = cleared;
        }
        const key = this._panelKey(side);
        if (!Array.isArray(this._config[key])) return;
        const list = [...this._config[key]];
        list[index] = parsed;
        const newConfig = { ...this._config, [key]: list };
        this._config = newConfig;
        fireEvent(this, "config-changed", { config: this._config });
    }

    // Compact human-readable label for a card config in the list.
    _panelCardLabel(cardConfig) {
        if (!cardConfig || typeof cardConfig !== 'object') return '?';
        const type = (cardConfig.type || '?').replace('custom:', '');
        const ref = cardConfig.entity
            || (Array.isArray(cardConfig.entities) && cardConfig.entities.length
                ? (cardConfig.entities[0].entity || cardConfig.entities[0])
                : null)
            || cardConfig.camera_image
            || cardConfig.title
            || cardConfig.name;
        return ref ? `${type}: ${ref}` : type;
    }

    _renderEntitySelector(entitySelectorSchema, value, configValue, label) {
        const val = value || "";
            return html`
            <div class="entity-picker-wrapper">
                <ha-selector
                    .hass=${this.hass}
                    .selector=${entitySelectorSchema}
                    .value=${val}
                    .configValue=${configValue}
                    .label=${label}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
                ${val ? html`<ha-icon 
                    class="clear-entity-btn" 
                    icon="mdi:close-circle" 
                    @click=${() => this._clearEntity(configValue)}
                ></ha-icon>` : ''}
            </div>
        `;
    }

    _renderColorPicker(key, label, defaultColor) {
        const currentColor = this._config[key] || defaultColor;
        const hasCustom = !!this._config[key];
        return html`
            <div class="color-picker-row">
                <input type="color" 
                       .value=${currentColor}
                       @input=${(e) => this._colorChanged(key, e)}>
                <span class="color-label">${label}</span>
                ${hasCustom ? html`<ha-icon class="color-reset-btn" 
                    icon="mdi:refresh" 
                    @click=${() => this._resetColor(key)}></ha-icon>` : ''}
            </div>
        `;
    }

    _renderColorPickerQuad(bubbleKey, pipeKey, textKey, iconKey, defaultColor) {
        const items = [
            { key: bubbleKey, label: this._localize('editor.color_picker'), default: defaultColor },
            ];
        if (pipeKey) items.push({ key: pipeKey, label: this._localize('editor.pipe_color'), default: defaultColor });
        items.push({ key: textKey, label: this._localize('editor.text_color'), default: defaultColor });
        items.push({ key: iconKey, label: this._localize('editor.icon_color'), default: defaultColor });
        return html`
            <div class="color-picker-quad">
                ${items.map(item => {
                    const color = this._config[item.key] || item.default;
                    const hasCustom = !!this._config[item.key];
                    return html`
                        <div class="color-picker-row">
                            <input type="color" 
                                   .value=${color}
                                   @input=${(e) => this._colorChanged(item.key, e)}>
                            <span class="color-label">${item.label}</span>
                            ${hasCustom ? html`<ha-icon class="color-reset-btn" 
                                icon="mdi:refresh" 
                                @click=${() => this._resetColor(item.key)}></ha-icon>` : ''}
                        </div>
                    `;
                })}
            </div>
        `;
    }

    _renderColorPickerQuint(bubbleKey, pipeKey, textKey, iconKey, secondaryKey, defaultColor) {
        const items = [
            { key: bubbleKey, label: this._localize('editor.color_picker'), default: defaultColor },
            ];
        if (pipeKey) items.push({ key: pipeKey, label: this._localize('editor.pipe_color'), default: defaultColor });
        items.push({ key: textKey, label: this._localize('editor.text_color'), default: defaultColor });
        items.push({ key: iconKey, label: this._localize('editor.icon_color'), default: defaultColor });
        items.push({ key: secondaryKey, label: this._localize('editor.secondary_color'), default: '#888888' });
        return html`
            <div class="color-picker-quint">
                ${items.map(item => {
                    const color = this._config[item.key] || item.default;
                    const hasCustom = !!this._config[item.key];
                    return html`
                        <div class="color-picker-row">
                            <input type="color" 
                                   .value=${color}
                                   @input=${(e) => this._colorChanged(item.key, e)}>
                            <span class="color-label">${item.label}</span>
                            ${hasCustom ? html`<ha-icon class="color-reset-btn" 
                                icon="mdi:refresh" 
                                @click=${() => this._resetColor(item.key)}></ha-icon>` : ''}
                        </div>
                    `;
                })}
            </div>
        `;
    }

    static get styles() {
        return css`
      .card-config {
        display: flex;
        flex-direction: column;
        padding-bottom: 24px;
      }
      .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
      }
      .back-btn {
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: bold;
          color: var(--primary-color);
      }
      .menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--divider-color);
          margin-bottom: 13px;
          cursor: pointer;
          transition: background 0.2s;
      }
      .menu-item:hover {
          background: rgba(var(--rgb-primary-text-color), 0.05);
      }
      .menu-icon {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: bold;
      }
      .switch-row {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 8px 0;
        margin-top: 8px;
      }
      .switch-label {
        font-weight: bold;
      }
      .section-title {
        font-size: 1.1em;
        font-weight: bold;
        margin-top: 15px;
        margin-bottom: 15px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--divider-color);
      }
      /* Phase 5.33: editor section groups -- visual breathing room and
       * a subtle left-accent to make logical groups obvious without
       * being heavy-handed. */
      .option-group {
        margin-bottom: 18px;
        padding: 4px 0 4px 8px;
        border-left: 2px solid var(--divider-color);
      }
      .option-group .group-title {
        font-size: 0.95em;
        font-weight: 600;
        color: var(--primary-text-color);
        margin-bottom: 8px;
        margin-top: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
        opacity: 0.85;
      }
      .option-group .group-title ha-icon {
        --mdc-icon-size: 18px;
        color: var(--primary-color);
        opacity: 0.7;
      }
      ha-selector {
        width: 100%;
        display: block;
        margin-bottom: 12px;
      }

      /* Phase 5.82: collapsible sections via ha-expansion-panel.
         Default HA expansion-panel styling is fine but we want a bit
         more breathing room between sections inside a consumer-group. */
      ha-expansion-panel {
        display: block;
        margin: 8px 0 4px 0;
        --expansion-panel-summary-padding: 0 12px;
        --expansion-panel-content-padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color, transparent);
      }
      ha-expansion-panel[expanded] {
        background: var(--secondary-background-color, transparent);
      }
      ha-expansion-panel > .section-icon {
        --mdc-icon-size: 18px;
        color: var(--primary-color);
        margin-right: 6px;
        vertical-align: middle;
      }
      .consumer-group {
        padding: 10px;
        border-radius: 8px;
        border-bottom: 1px solid var(--divider-color);
        margin-bottom: 12px;
      }
      .consumer-title {
        font-weight: bold; 
        margin-bottom: 8px;
        color: var(--primary-text-color);
      }
      .separator {
          border-bottom: 1px solid var(--divider-color);
          margin: 10px 0;
      }
      .entity-picker-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          gap: 4px;
      }
      .entity-picker-wrapper ha-selector {
          flex: 1;
      }
      .clear-entity-btn {
          --mdc-icon-size: 20px;
          color: var(--secondary-text-color);
          cursor: pointer;
          flex-shrink: 0;
          margin-top: -12px;
      }
      .clear-entity-btn:hover {
          color: var(--error-color, #db4437);
      }
      .color-picker-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
      }
      .color-picker-row input[type="color"] {
          -webkit-appearance: none;
          border: 2px solid var(--divider-color);
          border-radius: 50%;
          width: 30px;
          height: 30px;
          padding: 2px;
          cursor: pointer;
          background: transparent;
      }
      .color-picker-row input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 0;
      }
      .color-picker-row input[type="color"]::-webkit-color-swatch {
          border: none;
          border-radius: 50%;
      }
      .color-label {
          flex: 1;
          font-size: 14px;
      }
      .color-reset-btn {
          --mdc-icon-size: 20px;
          color: var(--secondary-text-color);
          cursor: pointer;
      }
      .color-reset-btn:hover {
          color: var(--primary-color);
      }
      .color-picker-quad {
          display: flex;
          gap: 8px;
      }
      .color-picker-quad .color-picker-row {
          flex: 1;
      }
      .color-picker-quint {
          display: flex;
          gap: 6px;
      }
      .color-picker-quint .color-picker-row {
          flex: 1;
      }
      .color-picker-quint input[type="color"] {
          width: 26px;
          height: 26px;
      }
    `;
    }

    // --- SUBVIEW RENDERING ---

    _renderSidePanelsView() {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.side_panels_section')}</h2>
        </div>

        <div class="option-group">
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.side_panels_enabled === true}
                    .configValue=${'side_panels_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.side_panels_enabled')}</div>
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 8px 0 12px 0;">
                ${this._localize('editor.side_panels_hint')}
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 150, max: 500, step: 10, mode: "slider" } }}
                    .value=${this._config.side_panel_width !== undefined ? this._config.side_panel_width : 320}
                    .configValue=${'side_panel_width'}
                    .label=${this._localize('editor.side_panel_width')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 120, step: 4, mode: "slider" } }}
                    .value=${this._config.side_panel_gap !== undefined ? this._config.side_panel_gap : 40}
                    .configValue=${'side_panel_gap'}
                    .label=${this._localize('editor.side_panel_gap')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
        </div>

        ${(() => {
            // Phase power-1b: the width/gap pair silently drives the whole card
            // scale -- scale = min(zoom, (host - 2*width - 2*gap) / 800). Turning
            // the gap up shrinks every bubble, and nothing in the editor said so.
            // This block makes the trade visible while dragging.
            const w = Number(this._config.side_panel_width !== undefined ? this._config.side_panel_width : 320);
            const g = Number(this._config.side_panel_gap !== undefined ? this._config.side_panel_gap : 40);
            const reserve = 2 * w + 2 * g;
            const threshold = 800 + reserve;
            const tight = threshold > 1920;
            return html`
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 4px 0 12px; line-height: 1.6;">
                ${this._localize('editor.side_panels_scale_hint')}<br><br>
                ${this._localize('editor.side_panels_reserve')}: 2 × ${w} + 2 × ${g} =
                <b style="color: var(--primary-text-color);">${reserve} px</b><br>
                ${this._localize('editor.side_panels_threshold')}
                <b style="color: ${tight ? 'var(--error-color)' : 'var(--primary-text-color)'};">${threshold} px</b>
                ${tight ? html`<br><span style="color: var(--error-color);">${this._localize('editor.side_panels_warn')}</span>` : ''}
            </div>`;
        })()}

        ${this._renderPanelCardList('left')}
        ${this._renderPanelCardList('right')}
        `;
    }

    // Phase A3.2a: render one panel column's card list with reorder/remove and
    // an add button. The add button currently appends a default card (A3.2a);
    // it becomes the graphical card picker in A3.2b.
    _renderPanelCardList(side) {
        const key = this._panelKey(side);
        const list = Array.isArray(this._config[key]) ? this._config[key] : [];
        const title = side === 'left'
            ? this._localize('editor.side_panel_left_title')
            : this._localize('editor.side_panel_right_title');
        return html`
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon=${side === 'left' ? 'mdi:dock-left' : 'mdi:dock-right'}></ha-icon>
                ${title}
            </div>

            ${list.length === 0
                ? html`<div style="font-size: 0.85em; color: var(--secondary-text-color); padding: 4px 0;">${this._localize('editor.side_panel_no_cards')}</div>`
                : list.map((cardConfig, index) => {
                    const errKey = `${side}:${index}`;
                    const err = this._panelYamlErrors ? this._panelYamlErrors[errKey] : null;
                    let yamlText = '';
                    try { yamlText = yamlMiniDump(cardConfig); } catch (e) { yamlText = ''; }
                    return html`
                    <ha-expansion-panel outlined .header=${this._panelCardLabel(cardConfig)}>
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
                            <span style="flex:1; font-size:0.85em; color:var(--secondary-text-color);">${this._localize('editor.side_panel_card_yaml')}</span>
                            <ha-icon-button .disabled=${index === 0} @click=${() => this._panelMoveCard(side, index, -1)} title="↑">
                                <ha-icon icon="mdi:arrow-up"></ha-icon>
                            </ha-icon-button>
                            <ha-icon-button .disabled=${index === list.length - 1} @click=${() => this._panelMoveCard(side, index, 1)} title="↓">
                                <ha-icon icon="mdi:arrow-down"></ha-icon>
                            </ha-icon-button>
                            <ha-icon-button @click=${() => this._panelRemoveCard(side, index)} title="✕">
                                <ha-icon icon="mdi:delete" style="color:var(--error-color, #db4437);"></ha-icon>
                            </ha-icon-button>
                        </div>
                        <ha-selector
                            .hass=${this.hass}
                            .selector=${{ text: { multiline: true } }}
                            .value=${yamlText}
                            @value-changed=${(ev) => this._panelCardYamlChanged(side, index, ev)}
                        ></ha-selector>
                        ${err ? html`<div style="color:var(--error-color, #db4437); font-size:0.8em; margin-top:6px;">⚠️ ${err}</div>` : ''}
                    </ha-expansion-panel>
                    `;
                })}

            <div style="margin-top:10px;">
                <ha-button @click=${() => this._panelAddCard(side)}>
                    <ha-icon icon="mdi:plus" slot="icon"></ha-icon>
                    ${this._localize('editor.side_panel_add_card')}
                </ha-button>
            </div>
        </div>
        `;
    }

    // Phase editor-2a: Solar on the generic schema. Richest of the source
    // bubbles -- mix ring with four destinations, secondary value, PV donut,
    // and a second label-offset pair for the export path. Whatever the schema
    // carries here, Grid/LG/Venus need only a subset of.
    _renderSolarView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['house', 'lg', 'venus', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.solar_section')}</h2>
        </div>

        <!-- Group: Sensors & display -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:tune"></ha-icon>
                ${this._localize('editor.group_sensors_display')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.solar, 'solar', this._localize('editor.entity'))}

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_solar || "", 'secondary_solar', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('solar', 'sensors')}

            ${this._renderColorPickerQuint('color_solar', 'color_pipe_solar', 'color_text_solar', 'color_icon_solar', 'color_secondary_solar', '#ffdd00')}
        </div>

        <!-- Group: Behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cog"></ha-icon>
                ${this._localize('editor.group_behavior')}
            </div>

            ${this._bubbleForm('solar', 'behavior')}
        </div>

        <!-- Group: Watt-label positioning -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cursor-move"></ha-icon>
                ${this._localize('editor.group_label_positions')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 4px; margin-top: 4px;">
                ${this._localize('editor.solar_label_pos_solar_house')} /
                ${this._localize('editor.solar_label_pos_solar_grid')}
            </div>

            ${this._bubbleForm('solar', 'offsets')}
        </div>

        <!-- Group: Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('solar', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`solar_rotate_daily_${n}`] || "", `solar_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`solar_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
                </ha-expansion-panel>

        <!-- Group: PV donut -->
        <ha-expansion-panel outlined .header=${this._localize('editor.pv_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.pv_donut_hint')}
            </div>

            ${this._bubbleForm('solar', 'donut')}

            ${this._renderEntitySelector(entitySelectorSchema, entities.pv_donut_produced_today || "", 'pv_donut_produced_today', this._localize('editor.pv_donut_produced_sensor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.pv_donut_forecast_today || "", 'pv_donut_forecast_today', this._localize('editor.pv_donut_forecast_sensor'))}

            <!-- Phase 5.72: Solar PV-distribution mix-ring -- 4 segments
                 (House / LG / Venus / Grid-export). Sits OUTSIDE the
                 PV-forecast donut. Source-bubble semantics inverted from
                 LG/Venus: instead of "where did my charge come from",
                 it answers "where did my PV energy go". -->
            <div class="group-title">
                <ha-icon icon="mdi:circle-multiple-outline"></ha-icon>
                ${this._localize('editor.solar_mix_section')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.solar_mix_hint')}
            </div>

            ${this._bubbleForm('solar', 'mix')}

            ${(() => {
                // Only the configured period is rendered. The card reads one
                // period at a time, so showing all three meant twelve pickers
                // where four are ever in use. Values for the other periods stay
                // in the config untouched -- switching the period brings them
                // straight back.
                const mixPeriod = this._config.solar_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.solar_mix_${mixPeriod}_section`)}
                </div>
                ${mixTargets.map((mixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`solar_mix_${mixTarget}_${mixPeriod}`] || "",
                    `solar_mix_${mixTarget}_${mixPeriod}`,
                    this._localize(`editor.solar_mix_${mixTarget}_label`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <!-- Phase 5.84: per-segment colors for the solar mix-ring.
                 Each defaults to the matching pipe color when unset. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.source_mix_colors_section')}
            </div>
            ${this._renderColorPicker('solar_mix_color_house', this._localize('editor.solar_mix_color_house'), '#ff2d78')}
            ${this._renderColorPicker('solar_mix_color_lg', this._localize('editor.solar_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('solar_mix_color_venus', this._localize('editor.solar_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('solar_mix_color_grid', this._localize('editor.solar_mix_color_grid'), '#ff0040')}

            <!-- Phase 5.72: Solar sparkline. Same control set as LG/Venus,
                 driven by solar_sparkline_* keys via _renderSparklineForSource('solar'). -->
            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.sparkline_title')}
            </div>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.solar_sparkline_entity || "", 'solar_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('solar', 'sparkline')}

            ${this._renderColorPicker('solar_sparkline_color', this._localize('editor.sparkline_color'), '#ffd900')}
                </ha-expansion-panel>
      `;
    }
    _renderGridView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.grid_section')}</h2>
        </div>

        <!-- Group: Sensors & display -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:tune"></ha-icon>
                ${this._localize('editor.group_sensors_display')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_combined || "", 'grid_combined', this._localize('editor.grid_combined_sensor'))}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 4px; margin-bottom: 8px;">
                ${this._localize('editor.grid_combined_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.grid, 'grid', this._localize('card.label_import') + " (W)")}
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_export, 'grid_export', this._localize('card.label_export') + " (W, Optional)")}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_grid || "", 'secondary_grid', this._localize('editor.secondary_sensor'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.grid_label}
                .configValue=${'grid_label'}
                .label=${this._localize('editor.label') + " (Optional)"}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.grid_icon}
                .configValue=${'grid_icon'}
                .label=${this._localize('editor.icon') + " (Optional)"}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPickerQuint('color_grid', 'color_pipe_grid', 'color_text_grid', 'color_icon_grid', 'color_secondary_grid', '#3b82f6')}
            ${this._renderColorPicker('color_export', this._localize('editor.export_color'), '#ff3333')}
        </div>

        <!-- Group: Behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cog"></ha-icon>
                ${this._localize('editor.group_behavior')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_label_grid === true}
                    .configValue=${'show_label_grid'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.label_toggle')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.grid_unit_kw === true}
                    .configValue=${'grid_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.grid_unit_kw')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_flow_rate_grid !== false}
                    .configValue=${'show_flow_rate_grid'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.flow_rate_title')}</div>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                    .value=${this._config.grid_animation_threshold !== undefined ? this._config.grid_animation_threshold : 1}
                    .configValue=${'grid_animation_threshold'}
                    .label=${this._localize('editor.bubble_animation_threshold')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
        </div>

        <!-- Group: Watt-label positioning -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cursor-move"></ha-icon>
                ${this._localize('editor.group_label_positions')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 4px; margin-top: 4px;">
                ${this._localize('editor.grid_label_pos_import')}
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                    .value=${this._config.grid_label_offset_x !== undefined ? this._config.grid_label_offset_x : 0}
                    .configValue=${'grid_label_offset_x'}
                    .label=${this._localize('editor.bubble_label_offset_x')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                    .value=${this._config.grid_label_offset_y !== undefined ? this._config.grid_label_offset_y : 0}
                    .configValue=${'grid_label_offset_y'}
                    .label=${this._localize('editor.bubble_label_offset_y')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
        </div>

        <!-- Group: Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.grid_rotate_show_live !== false}
                    .configValue=${'grid_rotate_show_live'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
            </div>

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.grid_rotate_show_daily_1 === true}
                    .configValue=${'grid_rotate_show_daily_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_rotate_daily_1 || "", 'grid_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
            ${this._renderColorPicker('grid_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.grid_rotate_show_daily_2 === true}
                    .configValue=${'grid_rotate_show_daily_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_rotate_daily_2 || "", 'grid_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
            ${this._renderColorPicker('grid_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.grid_rotate_show_daily_3 === true}
                    .configValue=${'grid_rotate_show_daily_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_rotate_daily_3 || "", 'grid_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
            ${this._renderColorPicker('grid_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}
                </ha-expansion-panel>

        <!-- Group: Grid donut -->
        <ha-expansion-panel outlined .header=${this._localize('editor.grid_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.grid_donut_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.grid_donut_today_mode === true}
                    .configValue=${'grid_donut_today_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.grid_donut_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_donut_import_today || "", 'grid_donut_import_today', this._localize('editor.grid_donut_import_sensor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_donut_export_today || "", 'grid_donut_export_today', this._localize('editor.grid_donut_export_sensor'))}

            <!-- Phase 5.73: Grid Import/Export balance mix-ring. 2-segment outer
                 ring around the existing Tages-Mix donut. Answers
                 "wie ist meine Netz-Bilanz?". -->
            <div class="group-title">
                <ha-icon icon="mdi:circle-multiple-outline"></ha-icon>
                ${this._localize('editor.grid_mix_section')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.grid_mix_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.grid_mix_donut_mode === true}
                    .configValue=${'grid_mix_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.grid_mix_enabled')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "day",   label: this._localize('editor.grid_mix_period_day')   },
                    { value: "month", label: this._localize('editor.grid_mix_period_month') },
                    { value: "year",  label: this._localize('editor.grid_mix_period_year')  }
                ] } }}
                .value=${this._config.grid_mix_period || 'day'}
                .configValue=${'grid_mix_period'}
                .label=${this._localize('editor.grid_mix_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                .value=${this._config.grid_mix_gap !== undefined ? this._config.grid_mix_gap : 8}
                .configValue=${'grid_mix_gap'}
                .label=${this._localize('editor.grid_mix_gap')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                .value=${this._config.grid_mix_thickness !== undefined ? this._config.grid_mix_thickness : 4}
                .configValue=${'grid_mix_thickness'}
                .label=${this._localize('editor.grid_mix_thickness')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Day-period sensors (Import + Export) -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.grid_mix_day_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_mix_import_day || "", 'grid_mix_import_day', this._localize('editor.grid_mix_import_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_mix_export_day || "", 'grid_mix_export_day', this._localize('editor.grid_mix_export_label'))}

            <!-- Month-period sensors -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.grid_mix_month_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_mix_import_month || "", 'grid_mix_import_month', this._localize('editor.grid_mix_import_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_mix_export_month || "", 'grid_mix_export_month', this._localize('editor.grid_mix_export_label'))}

            <!-- Year-period sensors -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.grid_mix_year_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_mix_import_year || "", 'grid_mix_import_year', this._localize('editor.grid_mix_import_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_mix_export_year || "", 'grid_mix_export_year', this._localize('editor.grid_mix_export_label'))}

            <!-- Phase 5.84: per-segment colors for the grid mix-ring.
                 Each defaults to the matching pipe color when unset. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.source_mix_colors_section')}
            </div>
            ${this._renderColorPicker('grid_mix_color_import', this._localize('editor.grid_mix_color_import'), '#ff0040')}
            ${this._renderColorPicker('grid_mix_color_export', this._localize('editor.grid_mix_color_export'), '#ffd900')}

            <!-- Phase 5.73: Grid sparkline. Default sensor (when override is
                 empty) is the bubble's main entity entities.grid which is
                 typically the combined/signed grid sensor. Sparkline data
                 path uses Math.max(0, v) so negative export values appear as
                 zero -- user can pick an import-only or export-only sensor
                 as override to see those separately. Default colour matches
                 the grid pipe colour (red). -->
            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.sparkline_title')}
            </div>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.grid_sparkline === true}
                    .configValue=${'grid_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_sparkline_entity || "", 'grid_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.grid_sparkline_period || '24h'}
                .configValue=${'grid_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.grid_sparkline_layer || 'back'}
                .configValue=${'grid_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.grid_sparkline_style || 'area-line'}
                .configValue=${'grid_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.grid_sparkline_opacity !== undefined ? this._config.grid_sparkline_opacity : 0.35}
                .configValue=${'grid_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('grid_sparkline_color', this._localize('editor.sparkline_color'), '#ff0040')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.grid_sparkline_test_mode === true}
                    .configValue=${'grid_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
                </ha-expansion-panel>
      `;
    }

    _renderBatteryView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.battery_section')}</h2>
        </div>

        <div class="switch-row">
            <ha-switch
                .checked=${this._config.battery_enabled !== false}
                .configValue=${'battery_enabled'}
                @change=${this._valueChanged}
            ></ha-switch>
            <div class="switch-label">${this._localize('editor.storage_enabled')}</div>
        </div>

        <!-- Group: Sensors & display -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:tune"></ha-icon>
                ${this._localize('editor.group_sensors_display')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.battery, 'battery', this._localize('editor.entity'))}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 4px; margin-bottom: 8px;">
                ${this._localize('editor.battery_separate_hint')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_charge || "", 'battery_charge', this._localize('editor.battery_charge_sensor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_discharge || "", 'battery_discharge', this._localize('editor.battery_discharge_sensor'))}

            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_soc, 'battery_soc', this._localize('editor.battery_soc_label'))}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 4px; margin-bottom: 8px;">
                ${this._localize('editor.grid_to_battery_hint')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_to_battery || "", 'grid_to_battery', this._localize('editor.grid_to_battery_sensor'))}

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_battery || "", 'secondary_battery', this._localize('editor.secondary_sensor'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.battery_label}
                .configValue=${'battery_label'}
                .label=${this._localize('editor.label') + " (Optional)"}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.battery_icon}
                .configValue=${'battery_icon'}
                .label=${this._localize('editor.icon') + " (Optional)"}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPickerQuint('color_battery', 'color_pipe_battery', 'color_text_battery', 'color_icon_battery', 'color_secondary_battery', '#00ff88')}
        </div>

        <!-- Group: Behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cog"></ha-icon>
                ${this._localize('editor.group_behavior')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_label_battery === true}
                    .configValue=${'show_label_battery'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.label_toggle')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_unit_kw === true}
                    .configValue=${'battery_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.battery_unit_kw')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_flow_rate_battery !== false}
                    .configValue=${'show_flow_rate_battery'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.flow_rate_title')}</div>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                    .value=${this._config.battery_animation_threshold !== undefined ? this._config.battery_animation_threshold : 1}
                    .configValue=${'battery_animation_threshold'}
                    .label=${this._localize('editor.bubble_animation_threshold')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.invert_battery === true}
                    .configValue=${'invert_battery'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.invert_battery')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_show_power === true}
                    .configValue=${'battery_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.battery_show_power')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_charge_via_house === true}
                    .configValue=${'battery_charge_via_house'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.battery_charge_via_house')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.hide_solar_to_battery_pipe === true}
                    .configValue=${'hide_solar_to_battery_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.hide_solar_arc')}</div>
            </div>
        </div>

        <!-- Group: Watt-label positioning -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cursor-move"></ha-icon>
                ${this._localize('editor.group_label_positions')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 4px; margin-top: 4px;">
                ${this._localize('editor.battery_label_pos')}
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                    .value=${this._config.battery_label_offset_x !== undefined ? this._config.battery_label_offset_x : 0}
                    .configValue=${'battery_label_offset_x'}
                    .label=${this._localize('editor.bubble_label_offset_x')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                    .value=${this._config.battery_label_offset_y !== undefined ? this._config.battery_label_offset_y : 0}
                    .configValue=${'battery_label_offset_y'}
                    .label=${this._localize('editor.bubble_label_offset_y')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
        </div>

        <!-- Group: Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_rotate_show_live !== false}
                    .configValue=${'battery_rotate_show_live'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
            </div>

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_rotate_show_daily_1 === true}
                    .configValue=${'battery_rotate_show_daily_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_rotate_daily_1 || "", 'battery_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
            ${this._renderColorPicker('battery_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_rotate_show_daily_2 === true}
                    .configValue=${'battery_rotate_show_daily_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_rotate_daily_2 || "", 'battery_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
            ${this._renderColorPicker('battery_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_rotate_show_daily_3 === true}
                    .configValue=${'battery_rotate_show_daily_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_rotate_daily_3 || "", 'battery_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
            ${this._renderColorPicker('battery_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}
                </ha-expansion-panel>

        <!-- Group: SoC donut -->
        <ha-expansion-panel outlined .header=${this._localize('editor.battery_soc_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.battery_soc_donut_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_soc_donut_mode === true}
                    .configValue=${'battery_soc_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.battery_soc_donut_enabled')}</div>
            </div>

            <!-- Phase 5.68: LG charge-source mix-ring -- an OUTER ring around the
                 SoC donut, showing where LG's stored energy came from over the
                 chosen period. Source-bubble semantics: only PV and Grid can
                 charge LG, so 2 segments only. -->
            <div class="group-title">
                <ha-icon icon="mdi:circle-multiple-outline"></ha-icon>
                ${this._localize('editor.battery_mix_section')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.battery_mix_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_mix_donut_mode === true}
                    .configValue=${'battery_mix_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.battery_mix_enabled')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "day",   label: this._localize('editor.battery_mix_period_day')   },
                    { value: "month", label: this._localize('editor.battery_mix_period_month') },
                    { value: "year",  label: this._localize('editor.battery_mix_period_year')  }
                ] } }}
                .value=${this._config.battery_mix_period || 'day'}
                .configValue=${'battery_mix_period'}
                .label=${this._localize('editor.battery_mix_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                .value=${this._config.battery_mix_gap !== undefined ? this._config.battery_mix_gap : 8}
                .configValue=${'battery_mix_gap'}
                .label=${this._localize('editor.battery_mix_gap')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                .value=${this._config.battery_mix_thickness !== undefined ? this._config.battery_mix_thickness : 4}
                .configValue=${'battery_mix_thickness'}
                .label=${this._localize('editor.battery_mix_thickness')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Day-period sensors (PV + Grid) -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.battery_mix_day_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_mix_pv_day || "", 'battery_mix_pv_day', this._localize('editor.battery_mix_pv_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_mix_grid_day || "", 'battery_mix_grid_day', this._localize('editor.battery_mix_grid_label'))}

            <!-- Month-period sensors -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.battery_mix_month_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_mix_pv_month || "", 'battery_mix_pv_month', this._localize('editor.battery_mix_pv_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_mix_grid_month || "", 'battery_mix_grid_month', this._localize('editor.battery_mix_grid_label'))}

            <!-- Year-period sensors -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.battery_mix_year_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_mix_pv_year || "", 'battery_mix_pv_year', this._localize('editor.battery_mix_pv_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_mix_grid_year || "", 'battery_mix_grid_year', this._localize('editor.battery_mix_grid_label'))}

            <!-- Phase 5.84: per-segment colors for the battery mix-ring.
                 Each defaults to the matching pipe color when unset. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.source_mix_colors_section')}
            </div>
            ${this._renderColorPicker('battery_mix_color_pv', this._localize('editor.battery_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('battery_mix_color_grid', this._localize('editor.battery_mix_color_grid'), '#ff0040')}

            <!-- Phase 5.69: LG sparkline section. Same control set as the 7
                 consumer sparklines, but driven by source-prefix keys
                 (battery_sparkline_* instead of consumer_X_sparkline_*).
                 Default colour matches the bubble's pipe colour. -->
            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.sparkline_title')}
            </div>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.battery_sparkline === true}
                    .configValue=${'battery_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_sparkline_entity || "", 'battery_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.battery_sparkline_period || '24h'}
                .configValue=${'battery_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.battery_sparkline_layer || 'back'}
                .configValue=${'battery_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.battery_sparkline_style || 'area-line'}
                .configValue=${'battery_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.battery_sparkline_opacity !== undefined ? this._config.battery_sparkline_opacity : 0.35}
                .configValue=${'battery_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('battery_sparkline_color', this._localize('editor.sparkline_color'), '#e100ff')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.battery_sparkline_test_mode === true}
                    .configValue=${'battery_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
                </ha-expansion-panel>
      `;
    }

    // Phase editor-1: first legacy section rebuilt on the generic schema.
    // Switches, numbers, text, icon and dropdowns come from BUBBLE_CAPS via
    // _bubbleForm(); colour pickers and entity pickers stay as markup in place
    // (see the note above BUBBLE_CAPS). 300 lines -> ~75, and the section
    // gains bkw_sparkline_test_mode, which the card has always read but no
    // editor copy ever offered.
    _renderBkwView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.bkw_section')}</h2>
        </div>

        <!-- Group: Sensors & display -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:tune"></ha-icon>
                ${this._localize('editor.group_sensors_display')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.bkw || "", 'bkw', this._localize('editor.entity'))}

            ${this._bubbleForm('bkw', 'sensors')}

            ${this._renderColorPicker('color_bkw', this._localize('editor.bkw_color_bubble'), '#ffdd00')}
            ${this._renderColorPicker('color_pipe_bkw', this._localize('editor.bkw_color_pipe'), '#ffdd00')}
            ${this._renderColorPicker('color_text_bkw', this._localize('editor.bkw_color_text'), '#ffdd00')}
            ${this._renderColorPicker('color_icon_bkw', this._localize('editor.bkw_color_icon'), '#ffffff')}
        </div>

        <!-- Group: Behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cog"></ha-icon>
                ${this._localize('editor.group_behavior')}
            </div>

            ${this._bubbleForm('bkw', 'behavior')}
        </div>

        <!-- Group: Pipe label positions -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:arrow-all"></ha-icon>
                ${this._localize('editor.group_label_positions')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 4px; margin-top: 4px;">
                ${this._localize('editor.bkw_label_pos_house')} / ${this._localize('editor.bkw_label_pos_venus')} / ${this._localize('editor.bkw_label_pos_grid')}
            </div>

            ${this._bubbleForm('bkw', 'offsets')}
        </div>

        <!-- Rotation -->
        <ha-expansion-panel outlined>
            <div slot="header" class="panel-header">
                <ha-icon icon="mdi:rotate-right"></ha-icon>
                ${this._localize('editor.rotation_section')}
            </div>
            <div class="panel-content">
                ${this._bubbleForm('bkw', 'rotation')}

                ${[1, 2, 3].map((n) => html`
                    ${this._renderEntitySelector(entitySelectorSchema, entities[`bkw_rotate_daily_${n}`] || "", `bkw_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                    ${this._renderColorPicker(`bkw_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), '#f7e364')}
                `)}
            </div>
        </ha-expansion-panel>

        <!-- Production ring -->
        <ha-expansion-panel outlined>
            <div slot="header" class="panel-header">
                <ha-icon icon="mdi:chart-donut"></ha-icon>
                ${this._localize('editor.bkw_donut_section')}
            </div>
            <div class="panel-content">
                ${this._bubbleForm('bkw', 'donut')}

                <div class="hint">${this._localize('editor.bkw_donut_hint')}</div>

                ${this._renderEntitySelector(entitySelectorSchema, entities.bkw_donut_produced_today || "", 'bkw_donut_produced_today', this._localize('editor.bkw_donut_produced'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.bkw_donut_forecast_today || "", 'bkw_donut_forecast_today', this._localize('editor.bkw_donut_forecast'))}
            </div>
        </ha-expansion-panel>

        <!-- Sparkline -->
        <ha-expansion-panel outlined>
            <div slot="header" class="panel-header">
                <ha-icon icon="mdi:chart-line"></ha-icon>
                ${this._localize('editor.sparkline_title')}
            </div>
            <div class="panel-content">
                ${this._renderEntitySelector(entitySelectorSchema, entities.bkw_sparkline_entity || "", 'bkw_sparkline_entity', this._localize('editor.sparkline_entity_label'))}

                ${this._bubbleForm('bkw', 'sparkline')}

                ${this._renderColorPicker('bkw_sparkline_color', this._localize('editor.sparkline_color'), '#ffdd00')}
            </div>
        </ha-expansion-panel>
        `;
    }

    _renderVenusView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.venus_section')}</h2>
        </div>

        <div class="switch-row">
            <ha-switch
                .checked=${this._config.venus_enabled !== false}
                .configValue=${'venus_enabled'}
                @change=${this._valueChanged}
            ></ha-switch>
            <div class="switch-label">${this._localize('editor.storage_enabled')}</div>
        </div>

        <!-- Group: Sensors & display -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:tune"></ha-icon>
                ${this._localize('editor.group_sensors_display')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.venus || "", 'venus', this._localize('editor.venus_entity'))}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 4px; margin-bottom: 8px;">
                ${this._localize('editor.venus_separate_hint')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_charge || "", 'venus_charge', this._localize('editor.venus_charge_sensor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_discharge || "", 'venus_discharge', this._localize('editor.venus_discharge_sensor'))}

            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_soc || "", 'venus_soc', this._localize('editor.venus_soc_label'))}

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_venus || "", 'secondary_venus', this._localize('editor.venus_secondary_sensor'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.venus_label}
                .configValue=${'venus_label'}
                .label=${this._localize('editor.label') + " (Optional)"}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.venus_icon}
                .configValue=${'venus_icon'}
                .label=${this._localize('editor.icon') + " (Optional)"}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPickerQuint('color_venus', 'color_pipe_venus', 'color_text_venus', 'color_icon_venus', 'color_secondary_venus', '#06b6d4')}
        </div>

        <!-- Group: Behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cog"></ha-icon>
                ${this._localize('editor.group_behavior')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_label_venus === true}
                    .configValue=${'show_label_venus'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.label_toggle')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_unit_kw === true}
                    .configValue=${'venus_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.venus_unit_kw')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_flow_rate_venus !== false}
                    .configValue=${'show_flow_rate_venus'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.flow_rate_title')}</div>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                    .value=${this._config.venus_animation_threshold !== undefined ? this._config.venus_animation_threshold : 1}
                    .configValue=${'venus_animation_threshold'}
                    .label=${this._localize('editor.bubble_animation_threshold')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.invert_venus === true}
                    .configValue=${'invert_venus'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.invert_venus')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_show_power === true}
                    .configValue=${'venus_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.venus_show_power')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_charge_via_house === true}
                    .configValue=${'venus_charge_via_house'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.venus_charge_via_house')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.hide_solar_to_venus_pipe === true}
                    .configValue=${'hide_solar_to_venus_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.hide_solar_arc')}</div>
            </div>
        </div>

        <!-- Group: Watt-label positioning -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cursor-move"></ha-icon>
                ${this._localize('editor.group_label_positions')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 4px; margin-top: 4px;">
                ${this._localize('editor.venus_label_pos')}
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                    .value=${this._config.venus_label_offset_x !== undefined ? this._config.venus_label_offset_x : 0}
                    .configValue=${'venus_label_offset_x'}
                    .label=${this._localize('editor.bubble_label_offset_x')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                    .value=${this._config.venus_label_offset_y !== undefined ? this._config.venus_label_offset_y : 0}
                    .configValue=${'venus_label_offset_y'}
                    .label=${this._localize('editor.bubble_label_offset_y')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
        </div>

        <!-- Group: Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_rotate_show_live !== false}
                    .configValue=${'venus_rotate_show_live'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
            </div>

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_rotate_show_daily_1 === true}
                    .configValue=${'venus_rotate_show_daily_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_rotate_daily_1 || "", 'venus_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
            ${this._renderColorPicker('venus_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_rotate_show_daily_2 === true}
                    .configValue=${'venus_rotate_show_daily_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_rotate_daily_2 || "", 'venus_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
            ${this._renderColorPicker('venus_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_rotate_show_daily_3 === true}
                    .configValue=${'venus_rotate_show_daily_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_rotate_daily_3 || "", 'venus_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
            ${this._renderColorPicker('venus_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}
                </ha-expansion-panel>

        <!-- Group: SoC donut -->
        <ha-expansion-panel outlined .header=${this._localize('editor.venus_soc_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.venus_soc_donut_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_soc_donut_mode === true}
                    .configValue=${'venus_soc_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.venus_soc_donut_enabled')}</div>
            </div>

            <!-- Phase 5.70: Venus charge-source mix-ring. Mirror of LG mix-ring
                 (phase 5.68) -- same 2-segment semantics (PV + Grid only). -->
            <div class="group-title">
                <ha-icon icon="mdi:circle-multiple-outline"></ha-icon>
                ${this._localize('editor.venus_mix_section')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.venus_mix_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_mix_donut_mode === true}
                    .configValue=${'venus_mix_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.venus_mix_enabled')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "day",   label: this._localize('editor.venus_mix_period_day')   },
                    { value: "month", label: this._localize('editor.venus_mix_period_month') },
                    { value: "year",  label: this._localize('editor.venus_mix_period_year')  }
                ] } }}
                .value=${this._config.venus_mix_period || 'day'}
                .configValue=${'venus_mix_period'}
                .label=${this._localize('editor.venus_mix_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                .value=${this._config.venus_mix_gap !== undefined ? this._config.venus_mix_gap : 8}
                .configValue=${'venus_mix_gap'}
                .label=${this._localize('editor.venus_mix_gap')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                .value=${this._config.venus_mix_thickness !== undefined ? this._config.venus_mix_thickness : 4}
                .configValue=${'venus_mix_thickness'}
                .label=${this._localize('editor.venus_mix_thickness')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Day-period sensors (PV + Grid) -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.venus_mix_day_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_mix_pv_day || "", 'venus_mix_pv_day', this._localize('editor.venus_mix_pv_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_mix_grid_day || "", 'venus_mix_grid_day', this._localize('editor.venus_mix_grid_label'))}

            <!-- Month-period sensors -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.venus_mix_month_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_mix_pv_month || "", 'venus_mix_pv_month', this._localize('editor.venus_mix_pv_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_mix_grid_month || "", 'venus_mix_grid_month', this._localize('editor.venus_mix_grid_label'))}

            <!-- Year-period sensors -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.venus_mix_year_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_mix_pv_year || "", 'venus_mix_pv_year', this._localize('editor.venus_mix_pv_label'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_mix_grid_year || "", 'venus_mix_grid_year', this._localize('editor.venus_mix_grid_label'))}

            <!-- Phase 5.84: per-segment colors for the venus mix-ring.
                 Each defaults to the matching pipe color when unset. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.source_mix_colors_section')}
            </div>
            ${this._renderColorPicker('venus_mix_color_pv', this._localize('editor.venus_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('venus_mix_color_grid', this._localize('editor.venus_mix_color_grid'), '#ff0040')}

            <!-- Phase 5.71: Venus sparkline. Same control set as LG sparkline
                 (phase 5.69), driven by venus_sparkline_* keys via the
                 _renderSparklineForSource('venus') helper. Default colour matches
                 the Venus bubble pipe colour (violet #8d07d5). -->
            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.sparkline_title')}
            </div>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.venus_sparkline === true}
                    .configValue=${'venus_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_sparkline_entity || "", 'venus_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.venus_sparkline_period || '24h'}
                .configValue=${'venus_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.venus_sparkline_layer || 'back'}
                .configValue=${'venus_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.venus_sparkline_style || 'area-line'}
                .configValue=${'venus_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.venus_sparkline_opacity !== undefined ? this._config.venus_sparkline_opacity : 0.35}
                .configValue=${'venus_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('venus_sparkline_color', this._localize('editor.sparkline_color'), '#8d07d5')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.venus_sparkline_test_mode === true}
                    .configValue=${'venus_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
                </ha-expansion-panel>
      `;
    }

    _renderDonutView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.donut_section')}</h2>
        </div>

        <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-bottom: 8px;">
            ${this._localize('editor.donut_hint')}
        </div>

        <div class="switch-row">
            <ha-switch
                .checked=${this._config.donut_today_mode === true}
                .configValue=${'donut_today_mode'}
                @change=${this._valueChanged}
            ></ha-switch>
            <div class="switch-label">${this._localize('editor.donut_today_mode')}</div>
        </div>

        <div class="separator"></div>

        ${this._renderEntitySelector(entitySelectorSchema, entities.donut_today_solar || "", 'donut_today_solar', this._localize('editor.donut_today_solar'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.donut_today_battery || "", 'donut_today_battery', this._localize('editor.donut_today_battery'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.donut_today_venus || "", 'donut_today_venus', this._localize('editor.donut_today_venus'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.donut_today_grid || "", 'donut_today_grid', this._localize('editor.donut_today_grid'))}

        <div class="separator"></div>

        <!-- Phase 5.74: House self-sufficiency (Autarkie) mix-ring. Second
             outer ring around the consumption-origin donut. 2 segments:
             self-supplied (PV+battery) vs grid. -->
        <ha-expansion-panel outlined .header=${this._localize('editor.house_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.house_mix_hint')}
            </div>

        <div class="switch-row">
            <ha-switch
                .checked=${this._config.house_mix_donut_mode === true}
                .configValue=${'house_mix_donut_mode'}
                @change=${this._valueChanged}
            ></ha-switch>
            <div class="switch-label">${this._localize('editor.house_mix_enabled')}</div>
        </div>

        <ha-selector
            .hass=${this.hass}
            .selector=${{ select: { mode: "dropdown", options: [
                { value: "day",   label: this._localize('editor.house_mix_period_day')   },
                { value: "month", label: this._localize('editor.house_mix_period_month') },
                { value: "year",  label: this._localize('editor.house_mix_period_year')  }
            ] } }}
            .value=${this._config.house_mix_period || 'day'}
            .configValue=${'house_mix_period'}
            .label=${this._localize('editor.house_mix_period')}
            @value-changed=${this._valueChanged}
        ></ha-selector>

        <ha-selector
            .hass=${this.hass}
            .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
            .value=${this._config.house_mix_gap !== undefined ? this._config.house_mix_gap : 8}
            .configValue=${'house_mix_gap'}
            .label=${this._localize('editor.house_mix_gap')}
            @value-changed=${this._valueChanged}
        ></ha-selector>

        <ha-selector
            .hass=${this.hass}
            .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
            .value=${this._config.house_mix_thickness !== undefined ? this._config.house_mix_thickness : 4}
            .configValue=${'house_mix_thickness'}
            .label=${this._localize('editor.house_mix_thickness')}
            @value-changed=${this._valueChanged}
        ></ha-selector>

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
            ${this._localize('editor.house_mix_day_section')}
        </div>
        ${this._renderEntitySelector(entitySelectorSchema, entities.house_mix_self_day || "", 'house_mix_self_day', this._localize('editor.house_mix_self_label'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.house_mix_grid_day || "", 'house_mix_grid_day', this._localize('editor.house_mix_grid_label'))}

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
            ${this._localize('editor.house_mix_month_section')}
        </div>
        ${this._renderEntitySelector(entitySelectorSchema, entities.house_mix_self_month || "", 'house_mix_self_month', this._localize('editor.house_mix_self_label'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.house_mix_grid_month || "", 'house_mix_grid_month', this._localize('editor.house_mix_grid_label'))}

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
            ${this._localize('editor.house_mix_year_section')}
        </div>
        ${this._renderEntitySelector(entitySelectorSchema, entities.house_mix_self_year || "", 'house_mix_self_year', this._localize('editor.house_mix_self_label'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.house_mix_grid_year || "", 'house_mix_grid_year', this._localize('editor.house_mix_grid_label'))}

        <!-- Phase 5.84: per-segment colors for the house mix-ring.
             Each defaults to the matching pipe color when unset. -->
        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
            ${this._localize('editor.source_mix_colors_section')}
        </div>
        ${this._renderColorPicker('house_mix_color_self', this._localize('editor.house_mix_color_self'), '#ffd900')}
        ${this._renderColorPicker('house_mix_color_grid', this._localize('editor.house_mix_color_grid'), '#ff0040')}

        <div class="separator"></div>

        <!-- Phase 5.74: House sparkline. Default sensor is entities.house
             (the home consumption sensor). Default colour house pink. -->
        </ha-expansion-panel>

        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

        <div class="switch-row">
            <ha-switch
                .checked=${this._config.house_sparkline === true}
                .configValue=${'house_sparkline'}
                @change=${this._valueChanged}
            ></ha-switch>
            <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
        </div>

        ${this._renderEntitySelector(entitySelectorSchema, entities.house_sparkline_entity || "", 'house_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
        <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
            ${this._localize('editor.sparkline_entity_hint')}
        </div>

        <ha-selector
            .hass=${this.hass}
            .selector=${{ select: { mode: "dropdown", options: [
                { value: "1h",  label: "1h"  },
                { value: "6h",  label: "6h"  },
                { value: "12h", label: "12h" },
                { value: "24h", label: "24h" }
            ] } }}
            .value=${this._config.house_sparkline_period || '24h'}
            .configValue=${'house_sparkline_period'}
            .label=${this._localize('editor.sparkline_period')}
            @value-changed=${this._valueChanged}
        ></ha-selector>

        <ha-selector
            .hass=${this.hass}
            .selector=${{ select: { mode: "dropdown", options: [
                { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                { value: "front", label: this._localize('editor.sparkline_layer_front') }
            ] } }}
            .value=${this._config.house_sparkline_layer || 'back'}
            .configValue=${'house_sparkline_layer'}
            .label=${this._localize('editor.sparkline_layer')}
            @value-changed=${this._valueChanged}
        ></ha-selector>

        <ha-selector
            .hass=${this.hass}
            .selector=${{ select: { mode: "dropdown", options: [
                { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
            ] } }}
            .value=${this._config.house_sparkline_style || 'area-line'}
            .configValue=${'house_sparkline_style'}
            .label=${this._localize('editor.sparkline_style')}
            @value-changed=${this._valueChanged}
        ></ha-selector>

        <ha-selector
            .hass=${this.hass}
            .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
            .value=${this._config.house_sparkline_opacity !== undefined ? this._config.house_sparkline_opacity : 0.35}
            .configValue=${'house_sparkline_opacity'}
            .label=${this._localize('editor.sparkline_opacity')}
            @value-changed=${this._valueChanged}
        ></ha-selector>

        ${this._renderColorPicker('house_sparkline_color', this._localize('editor.sparkline_color'), '#ff2d78')}

        <div class="switch-row" style="margin-top: 8px;">
            <ha-switch
                .checked=${this._config.house_sparkline_test_mode === true}
                .configValue=${'house_sparkline_test_mode'}
                @change=${this._valueChanged}
            ></ha-switch>
            <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
        </div>
        </ha-expansion-panel>
      `;
    }

    // Phase 5.46: helper -- consumer menu label.
    // Returns the user-set consumer_N_label if non-empty, otherwise a
    // generic "Bubble N" fallback. Keeps the main menu universal: tesla
    // owners see "Tesla", pool owners see "Pool", everyone else just
    // sees their bubbles numbered.
    _consumerMenuLabel(idx) {
        const userLabel = this._config[`consumer_${idx}_label`];
        if (userLabel && typeof userLabel === 'string' && userLabel.trim() !== '') {
            return userLabel;
        }
        return this._localize('editor.bubble_fallback').replace('{n}', idx);
    }

    // Phase 5.46: per-bubble menu-icon resolver.
    // Returns the user-set consumer_N_icon if configured, otherwise the
    // generic bubble icon. Used for the main menu items so users see
    // their actual chosen icon next to each bubble entry.
    _consumerMenuIcon(idx) {
        return this._config[`consumer_${idx}_icon`] || 'mdi:circle-outline';
    }

    // Phase 5.46: generic sub-view renderer for Consumer 2..7.
    // Consumer 1 (Tesla) gets its own _renderConsumer1View because it has
    // the rotation block added in phase 5.44; the rest share this generic
    // template until they need their own special-purpose features. When
    // rotation/SoC/mix-ring is later added to other bubbles, they each get
    // promoted to their own _renderConsumerNView like Tesla.
    _renderConsumerNView(idx, entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const defaultColors = ['#a855f7', '#f97316', '#06b6d4', '#eab308', '#6366f1', '#14b8a6', '#ec4899'];
        const defaultColor = defaultColors[idx - 1] || '#888888';
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(idx)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: ${defaultColor};">${this._localize(`editor.consumer_${idx}_title`)}</div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config[`consumer_${idx}_enabled`] !== false}
                    .configValue=${`consumer_${idx}_enabled`}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities[`consumer_${idx}`], `consumer_${idx}`, this._localize('editor.entity'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config[`consumer_${idx}_label`]}
                .configValue=${`consumer_${idx}_label`}
                .label=${this._localize('editor.label')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config[`consumer_${idx}_icon`]}
                .configValue=${`consumer_${idx}_icon`}
                .label=${this._localize('editor.icon')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.invert_consumer')}</span>
                <ha-switch
                    .checked=${this._config[`invert_consumer_${idx}`] === true}
                    .configValue=${`invert_consumer_${idx}`}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.consumer_hide_pipe')}</span>
                <ha-switch
                    .checked=${this._config[`consumer_${idx}_hide_pipe`] === true}
                    .configValue=${`consumer_${idx}_hide_pipe`}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            ${this._config[`consumer_${idx}_hide_pipe`] === true ? html`
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 2000, step: 10, mode: "slider" } }}
                .value=${this._config[`consumer_${idx}_pipe_threshold`] !== undefined ? this._config[`consumer_${idx}_pipe_threshold`] : 0}
                .configValue=${`consumer_${idx}_pipe_threshold`}
                .label=${this._localize('editor.consumer_pipe_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_unit_kw')}</span>
                <ha-switch
                    .checked=${this._config[`consumer_${idx}_unit_kw`] === true}
                    .configValue=${`consumer_${idx}_unit_kw`}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_power')}</span>
                <ha-switch
                    .checked=${this._config[`consumer_${idx}_show_power`] !== false}
                    .configValue=${`consumer_${idx}_show_power`}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_flow_rate')}</span>
                <ha-switch
                    .checked=${this._config[`show_flow_rate_consumer_${idx}`] === true}
                    .configValue=${`show_flow_rate_consumer_${idx}`}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config[`consumer_${idx}_label_offset_x`] !== undefined ? this._config[`consumer_${idx}_label_offset_x`] : 0}
                .configValue=${`consumer_${idx}_label_offset_x`}
                .label=${this._localize('editor.consumer_label_offset_x')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config[`consumer_${idx}_label_offset_y`] !== undefined ? this._config[`consumer_${idx}_label_offset_y`] : -25}
                .configValue=${`consumer_${idx}_label_offset_y`}
                .label=${this._localize('editor.consumer_label_offset_y')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                .value=${this._config[`consumer_${idx}_animation_threshold`] !== undefined ? this._config[`consumer_${idx}_animation_threshold`] : 0}
                .configValue=${`consumer_${idx}_animation_threshold`}
                .label=${this._localize('editor.consumer_animation_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities[`secondary_consumer_${idx}`] || "", `secondary_consumer_${idx}`, this._localize('editor.secondary_sensor'))}

            ${this._renderColorPickerQuint(`color_consumer_${idx}`, `color_pipe_consumer_${idx}`, `color_text_consumer_${idx}`, `color_icon_consumer_${idx}`, `color_secondary_consumer_${idx}`, defaultColor)}
        </div>
        `;
    }

    // Phase power-1: editor for the power tile. Toggle, position and the five
    // entities the card does not already know. Everything else the tile shows
    // is read from keys that are already configured elsewhere in this editor,
    // so it stays in sync with the bubbles by construction.
    // Phase power-B0: proof of concept for schema-driven editor sections.
    // This is the first section built on <ha-form> instead of hand-wired
    // controls. If it holds up, the twelve legacy views follow the same
    // pattern -- ~6000 lines of near-duplicate template code collapse into
    // data. Deliberately kept to the four fields the section already had, so
    // a failure costs four fields and not a whole phase.
    _powerSchema() {
        const sensor = { entity: { domain: ['sensor', 'input_number'] } };
        return [
            { name: 'power_enabled', selector: { boolean: {} } },
            { type: 'grid', name: '', flatten: true, column_min_width: '220px', schema: [
                { name: 'power_offset_x', selector: { number: { min: -300, max: 300, step: 1, mode: 'slider' } } },
                { name: 'power_offset_y', selector: { number: { min: -300, max: 300, step: 1, mode: 'slider' } } },
            ]},
            { type: 'grid', name: '', flatten: true, column_min_width: '220px', schema: [
                { name: 'power_pulse_enabled', selector: { boolean: {} } },
                { name: 'power_pulse_threshold', selector: { number: { min: 0, max: 2000, step: 25, mode: 'slider' } } },
            ]},
            // flatten:false is the point of this experiment: the five children
            // are expected to land under config.entities.* automatically, which
            // is exactly what the hand-maintained entityKeys array does today.
            { type: 'expandable', name: 'entities', flatten: false,
              title: this._localize('editor.power_entities_title'), schema:
                POWER_FLUX_EDITOR_POWER_KEYS.map(k => ({ name: k, selector: sensor })) },
        ];
    }

    _powerFormChanged(ev) {
        ev.stopPropagation();
        if (!this._config) return;
        const v = (ev.detail && ev.detail.value) || {};
        const cfg = { ...this._config };

        // Never assign a whole object back. Only known keys are copied, so a
        // surprise in what ha-form returns cannot wipe unrelated config.
        for (const k of ['power_enabled', 'power_offset_x', 'power_offset_y',
                         'power_pulse_enabled', 'power_pulse_threshold']) {
            if (k in v) cfg[k] = v[k];
        }

        const ents = { ...(this._config.entities || {}) };
        const incoming = v.entities || {};
        for (const k of POWER_FLUX_EDITOR_POWER_KEYS) {
            if (!(k in incoming)) continue;
            if (incoming[k]) ents[k] = incoming[k]; else delete ents[k];
        }
        cfg.entities = ents;

        this._config = cfg;
        fireEvent(this, "config-changed", { config: this._config });
    }

    _renderPowerView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        // Only the five power keys go into data, so ha-form can only ever hand
        // back those five -- the other ~100 entity keys are never exposed to it.
        const data = {
            power_enabled: this._config.power_enabled === true,
            power_offset_x: this._config.power_offset_x !== undefined ? this._config.power_offset_x : 0,
            power_offset_y: this._config.power_offset_y !== undefined ? this._config.power_offset_y : 0,
            power_pulse_enabled: this._config.power_pulse_enabled !== false,
            power_pulse_threshold: this._config.power_pulse_threshold !== undefined ? this._config.power_pulse_threshold : 200,
            entities: {},
        };
        for (const k of POWER_FLUX_EDITOR_POWER_KEYS) {
            const val = (this._config.entities || {})[k];
            if (val) data.entities[k] = val;
        }

        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.power_section')}</h2>
        </div>

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 8px 0 12px; line-height: 1.6;">
            ${this._localize('editor.power_position_hint')}
        </div>

        <ha-form
            .hass=${this.hass}
            .data=${data}
            .schema=${this._powerSchema()}
            .computeLabel=${(s) => this._localize(`editor.${s.name}`)}
            .computeHelper=${(s) => (s.name === 'power_enabled'
                ? this._localize('editor.power_entities_hint') : undefined)}
            @value-changed=${this._powerFormChanged}
        ></ha-form>
        `;
    }

    // Phase 5.64: dedicated sub-view for Klima (Consumer 6) -- seventh and
    // final bubble with full feature parity. Default donut max = 30 (°C)
    // suitable for indoor temperature. User can override consumer_6_soc_max
    // for humidity (max=100), CO2 (max=2000), or any other ratio metric.
    // Rotation (phase 5.65) and charge-mix ring (phase 5.66) follow.
    _renderTempView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        // Phase 5.79c: full editor for the split climate (temp) bubble.
        // Four entities (outdoor/indoor current + forecast high/low) land
        // under config.entities.* via entityKeys; scales are top-level config.
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.temp_section')}</h2>
        </div>

        <div class="switch-row">
            <ha-switch
                .checked=${this._config.temp_enabled === true}
                .configValue=${'temp_enabled'}
                @change=${this._valueChanged}
            ></ha-switch>
            <div class="switch-label">${this._localize('editor.temp_enabled')}</div>
        </div>

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 12px 0 6px;">
            ${this._localize('editor.temp_position_hint')}
        </div>
        <ha-selector
            .hass=${this.hass}
            .selector=${{ number: { min: -300, max: 300, step: 1, mode: "slider" } }}
            .value=${this._config.temp_offset_x !== undefined ? this._config.temp_offset_x : 0}
            .configValue=${'temp_offset_x'}
            .label=${this._localize('editor.temp_offset_x')}
            @value-changed=${this._valueChanged}
        ></ha-selector>
        <ha-selector
            .hass=${this.hass}
            .selector=${{ number: { min: -300, max: 300, step: 1, mode: "slider" } }}
            .value=${this._config.temp_offset_y !== undefined ? this._config.temp_offset_y : 0}
            .configValue=${'temp_offset_y'}
            .label=${this._localize('editor.temp_offset_y')}
            @value-changed=${this._valueChanged}
        ></ha-selector>

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 12px 0 6px;">
            ${this._localize('editor.temp_sensors_hint')}
        </div>

        ${this._renderEntitySelector(entitySelectorSchema, entities.temp_outdoor || "", 'temp_outdoor', this._localize('editor.temp_outdoor'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.temp_indoor || "", 'temp_indoor', this._localize('editor.temp_indoor'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.temp_forecast_high || "", 'temp_forecast_high', this._localize('editor.temp_forecast_high'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.temp_forecast_low || "", 'temp_forecast_low', this._localize('editor.temp_forecast_low'))}

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 12px 0 6px;">
            ${this._localize('editor.temp_scales_hint')}
        </div>

        <div>
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -40, max: 20, step: 1, mode: "slider" } }}
                .value=${this._config.temp_outdoor_min !== undefined ? this._config.temp_outdoor_min : -10}
                .configValue=${'temp_outdoor_min'}
                .label=${this._localize('editor.temp_outdoor_min')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
        </div>
        <div>
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 20, max: 60, step: 1, mode: "slider" } }}
                .value=${this._config.temp_outdoor_max !== undefined ? this._config.temp_outdoor_max : 40}
                .configValue=${'temp_outdoor_max'}
                .label=${this._localize('editor.temp_outdoor_max')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
        </div>
        <div>
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 20, step: 1, mode: "slider" } }}
                .value=${this._config.temp_indoor_min !== undefined ? this._config.temp_indoor_min : 10}
                .configValue=${'temp_indoor_min'}
                .label=${this._localize('editor.temp_indoor_min')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
        </div>
        <div>
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 20, max: 40, step: 1, mode: "slider" } }}
                .value=${this._config.temp_indoor_max !== undefined ? this._config.temp_indoor_max : 30}
                .configValue=${'temp_indoor_max'}
                .label=${this._localize('editor.temp_indoor_max')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
        </div>

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 12px 0 6px;">
            ${this._localize('editor.temp_colors_hint')}
        </div>
        ${this._renderColorPicker('temp_outdoor_color', this._localize('editor.temp_outdoor_color'), '#378ADD')}
        ${this._renderColorPicker('temp_indoor_color', this._localize('editor.temp_indoor_color'), '#1D9E75')}
        ${this._renderColorPicker('temp_marker_color', this._localize('editor.temp_marker_color'), '#D85A30')}

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 16px 0 6px;">
            ${this._localize('editor.temp_sparkline_hint')}
        </div>

        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.temp_sparkline_indoor_title')}
            </div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.temp_indoor_sparkline === true}
                    .configValue=${'temp_indoor_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, this._config.temp_indoor_sparkline_entity || "", 'temp_indoor_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h", label: "1h" }, { value: "6h", label: "6h" },
                    { value: "12h", label: "12h" }, { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.temp_indoor_sparkline_period || '24h'}
                .configValue=${'temp_indoor_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area", label: this._localize('editor.sparkline_style_area') },
                    { value: "line", label: this._localize('editor.sparkline_style_line') },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.temp_indoor_sparkline_style || 'area-line'}
                .configValue=${'temp_indoor_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.temp_indoor_sparkline_opacity !== undefined ? this._config.temp_indoor_sparkline_opacity : 0.35}
                .configValue=${'temp_indoor_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ${this._renderColorPicker('temp_indoor_sparkline_color', this._localize('editor.sparkline_color'), '#1D9E75')}
        </div>

        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.temp_sparkline_outdoor_title')}
            </div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.temp_outdoor_sparkline === true}
                    .configValue=${'temp_outdoor_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, this._config.temp_outdoor_sparkline_entity || "", 'temp_outdoor_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h", label: "1h" }, { value: "6h", label: "6h" },
                    { value: "12h", label: "12h" }, { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.temp_outdoor_sparkline_period || '24h'}
                .configValue=${'temp_outdoor_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area", label: this._localize('editor.sparkline_style_area') },
                    { value: "line", label: this._localize('editor.sparkline_style_line') },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.temp_outdoor_sparkline_style || 'area-line'}
                .configValue=${'temp_outdoor_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.temp_outdoor_sparkline_opacity !== undefined ? this._config.temp_outdoor_sparkline_opacity : 0.35}
                .configValue=${'temp_outdoor_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ${this._renderColorPicker('temp_outdoor_sparkline_color', this._localize('editor.sparkline_color'), '#378ADD')}
        </div>
    `;
    }

    _renderConsumer6View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(6)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #14b8a6;">${this._localize('editor.consumer_6_title')}</div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_6_enabled !== false}
                    .configValue=${'consumer_6_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6, 'consumer_6', this._localize('editor.entity'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.consumer_6_label}
                .configValue=${'consumer_6_label'}
                .label=${this._localize('editor.label')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.consumer_6_icon}
                .configValue=${'consumer_6_icon'}
                .label=${this._localize('editor.icon')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.invert_consumer')}</span>
                <ha-switch
                    .checked=${this._config.invert_consumer_6 === true}
                    .configValue=${'invert_consumer_6'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.consumer_hide_pipe')}</span>
                <ha-switch
                    .checked=${this._config.consumer_6_hide_pipe === true}
                    .configValue=${'consumer_6_hide_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            ${this._config.consumer_6_hide_pipe === true ? html`
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 2000, step: 10, mode: "slider" } }}
                .value=${this._config.consumer_6_pipe_threshold !== undefined ? this._config.consumer_6_pipe_threshold : 0}
                .configValue=${'consumer_6_pipe_threshold'}
                .label=${this._localize('editor.consumer_pipe_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_unit_kw')}</span>
                <ha-switch
                    .checked=${this._config.consumer_6_unit_kw === true}
                    .configValue=${'consumer_6_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_power')}</span>
                <ha-switch
                    .checked=${this._config.consumer_6_show_power !== false}
                    .configValue=${'consumer_6_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_flow_rate')}</span>
                <ha-switch
                    .checked=${this._config.show_flow_rate_consumer_6 === true}
                    .configValue=${'show_flow_rate_consumer_6'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_6_label_offset_x !== undefined ? this._config.consumer_6_label_offset_x : 0}
                .configValue=${'consumer_6_label_offset_x'}
                .label=${this._localize('editor.consumer_label_offset_x')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_6_label_offset_y !== undefined ? this._config.consumer_6_label_offset_y : -25}
                .configValue=${'consumer_6_label_offset_y'}
                .label=${this._localize('editor.consumer_label_offset_y')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_6_animation_threshold !== undefined ? this._config.consumer_6_animation_threshold : 0}
                .configValue=${'consumer_6_animation_threshold'}
                .label=${this._localize('editor.consumer_animation_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_6 || "", 'secondary_consumer_6', this._localize('editor.secondary_sensor'))}

            ${this._renderColorPickerQuint('color_consumer_6', 'color_pipe_consumer_6', 'color_text_consumer_6', 'color_icon_consumer_6', 'color_secondary_consumer_6', '#14b8a6')}

            <!-- Phase 5.64: configurable donut for Klima -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_6_donut_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_6_donut_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_6_soc_donut_mode === true}
                    .configValue=${'consumer_6_soc_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_6_soc_donut_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 1000, step: 1, mode: "box" } }}
                .value=${this._config.consumer_6_soc_max !== undefined ? this._config.consumer_6_soc_max : 30}
                .configValue=${'consumer_6_soc_max'}
                .label=${this._localize('editor.consumer_6_soc_max')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Phase 5.66: Charge-mix outer ring for Klima -- final mix-ring of the series. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_6_mix_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_6_mix_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_6_mix_donut_mode === true}
                    .configValue=${'consumer_6_mix_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_6_mix_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "day",   label: this._localize('editor.consumer_1_mix_period_day') },
                    { value: "month", label: this._localize('editor.consumer_1_mix_period_month') },
                    { value: "year",  label: this._localize('editor.consumer_1_mix_period_year') }
                ] } }}
                .value=${this._config.consumer_6_mix_period || 'day'}
                .configValue=${'consumer_6_mix_period'}
                .label=${this._localize('editor.consumer_1_mix_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_6_mix_ring_gap !== undefined ? this._config.consumer_6_mix_ring_gap : 8}
                .configValue=${'consumer_6_mix_ring_gap'}
                .label=${this._localize('editor.consumer_1_mix_ring_gap')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_6_mix_ring_thickness !== undefined ? this._config.consumer_6_mix_ring_thickness : 4}
                .configValue=${'consumer_6_mix_ring_thickness'}
                .label=${this._localize('editor.consumer_1_mix_ring_thickness')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Tag -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_day')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_pv_day || "", 'consumer_6_mix_pv_day', this._localize('editor.consumer_6_mix_pv_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_lg_day || "", 'consumer_6_mix_lg_day', this._localize('editor.consumer_6_mix_lg_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_venus_day || "", 'consumer_6_mix_venus_day', this._localize('editor.consumer_6_mix_venus_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_grid_day || "", 'consumer_6_mix_grid_day', this._localize('editor.consumer_6_mix_grid_day'))}

            <!-- Monat -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_month')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_pv_month || "", 'consumer_6_mix_pv_month', this._localize('editor.consumer_6_mix_pv_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_lg_month || "", 'consumer_6_mix_lg_month', this._localize('editor.consumer_6_mix_lg_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_venus_month || "", 'consumer_6_mix_venus_month', this._localize('editor.consumer_6_mix_venus_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_grid_month || "", 'consumer_6_mix_grid_month', this._localize('editor.consumer_6_mix_grid_month'))}

            <!-- Jahr -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_year')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_pv_year || "", 'consumer_6_mix_pv_year', this._localize('editor.consumer_6_mix_pv_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_lg_year || "", 'consumer_6_mix_lg_year', this._localize('editor.consumer_6_mix_lg_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_venus_year || "", 'consumer_6_mix_venus_year', this._localize('editor.consumer_6_mix_venus_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_mix_grid_year || "", 'consumer_6_mix_grid_year', this._localize('editor.consumer_6_mix_grid_year'))}

            <!-- Phase 5.83: per-segment colors for the c6 mix-ring.
                 Each defaults to the matching pipe color when unset.
                 Reuses the consumer_1 color i18n labels (identical PV/LG/Venus/Grid
                 semantics) -- no new translation keys needed. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_6_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_6_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_6_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_6_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}

            <!-- Phase 5.65: rotation for Klima bubble -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.rotation_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_6_rotate_show_live !== false}
                    .configValue=${'consumer_6_rotate_show_live'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
            </div>

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_6_rotate_show_daily_1 === true}
                    .configValue=${'consumer_6_rotate_show_daily_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_rotate_daily_1 || "", 'consumer_6_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
            ${this._renderColorPicker('consumer_6_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_6_rotate_show_daily_2 === true}
                    .configValue=${'consumer_6_rotate_show_daily_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_rotate_daily_2 || "", 'consumer_6_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
            ${this._renderColorPicker('consumer_6_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_6_rotate_show_daily_3 === true}
                    .configValue=${'consumer_6_rotate_show_daily_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_rotate_daily_3 || "", 'consumer_6_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
            ${this._renderColorPicker('consumer_6_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}

            <!-- Phase 5.67.11: Sparkline / history graph for Klima.
                 Default colour #14b8a6 (teal, matches the bubble's
                 default consumer-6 colour). Same control set as
                 Tesla / Waschen / Trockner / Spüler / BWWP. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.sparkline_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_6_sparkline === true}
                    .configValue=${'consumer_6_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_sparkline_entity || "", 'consumer_6_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.consumer_6_sparkline_period || '24h'}
                .configValue=${'consumer_6_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.consumer_6_sparkline_layer || 'back'}
                .configValue=${'consumer_6_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.consumer_6_sparkline_style || 'area-line'}
                .configValue=${'consumer_6_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.consumer_6_sparkline_opacity !== undefined ? this._config.consumer_6_sparkline_opacity : 0.35}
                .configValue=${'consumer_6_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('consumer_6_sparkline_color', this._localize('editor.sparkline_color'), '#14b8a6')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_6_sparkline_debug === true}
                    .configValue=${'consumer_6_sparkline_debug'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_debug')}</div>
            </div>

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_6_sparkline_test_mode === true}
                    .configValue=${'consumer_6_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
            </ha-expansion-panel>
        </div>
        `;
    }

    // Phase 5.61: dedicated sub-view for Spüler (Consumer 4) -- sixth bubble
    // with full feature parity. Default donut max = 5 (kWh) for a daily
    // energy budget on a dishwasher. User can override consumer_4_soc_max
    // for any other ratio metric. Rotation (phase 5.62) and charge-mix ring
    // (phase 5.63) follow.
    _renderConsumer4View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(4)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #eab308;">${this._localize('editor.consumer_4_title')}</div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_4_enabled !== false}
                    .configValue=${'consumer_4_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4, 'consumer_4', this._localize('editor.entity'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.consumer_4_label}
                .configValue=${'consumer_4_label'}
                .label=${this._localize('editor.label')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.consumer_4_icon}
                .configValue=${'consumer_4_icon'}
                .label=${this._localize('editor.icon')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.invert_consumer')}</span>
                <ha-switch
                    .checked=${this._config.invert_consumer_4 === true}
                    .configValue=${'invert_consumer_4'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.consumer_hide_pipe')}</span>
                <ha-switch
                    .checked=${this._config.consumer_4_hide_pipe === true}
                    .configValue=${'consumer_4_hide_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            ${this._config.consumer_4_hide_pipe === true ? html`
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 2000, step: 10, mode: "slider" } }}
                .value=${this._config.consumer_4_pipe_threshold !== undefined ? this._config.consumer_4_pipe_threshold : 0}
                .configValue=${'consumer_4_pipe_threshold'}
                .label=${this._localize('editor.consumer_pipe_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_unit_kw')}</span>
                <ha-switch
                    .checked=${this._config.consumer_4_unit_kw === true}
                    .configValue=${'consumer_4_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_power')}</span>
                <ha-switch
                    .checked=${this._config.consumer_4_show_power !== false}
                    .configValue=${'consumer_4_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_flow_rate')}</span>
                <ha-switch
                    .checked=${this._config.show_flow_rate_consumer_4 === true}
                    .configValue=${'show_flow_rate_consumer_4'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_4_label_offset_x !== undefined ? this._config.consumer_4_label_offset_x : 0}
                .configValue=${'consumer_4_label_offset_x'}
                .label=${this._localize('editor.consumer_label_offset_x')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_4_label_offset_y !== undefined ? this._config.consumer_4_label_offset_y : -25}
                .configValue=${'consumer_4_label_offset_y'}
                .label=${this._localize('editor.consumer_label_offset_y')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_4_animation_threshold !== undefined ? this._config.consumer_4_animation_threshold : 0}
                .configValue=${'consumer_4_animation_threshold'}
                .label=${this._localize('editor.consumer_animation_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_4 || "", 'secondary_consumer_4', this._localize('editor.secondary_sensor'))}

            ${this._renderColorPickerQuint('color_consumer_4', 'color_pipe_consumer_4', 'color_text_consumer_4', 'color_icon_consumer_4', 'color_secondary_consumer_4', '#eab308')}

            <!-- Phase 5.61: configurable donut for Spüler. Generic ratio -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_4_donut_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_4_donut_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_4_soc_donut_mode === true}
                    .configValue=${'consumer_4_soc_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_4_soc_donut_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 1000, step: 1, mode: "box" } }}
                .value=${this._config.consumer_4_soc_max !== undefined ? this._config.consumer_4_soc_max : 5}
                .configValue=${'consumer_4_soc_max'}
                .label=${this._localize('editor.consumer_4_soc_max')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Phase 5.63: Charge-mix outer ring for Spüler. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_4_mix_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_4_mix_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_4_mix_donut_mode === true}
                    .configValue=${'consumer_4_mix_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_4_mix_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "day",   label: this._localize('editor.consumer_1_mix_period_day') },
                    { value: "month", label: this._localize('editor.consumer_1_mix_period_month') },
                    { value: "year",  label: this._localize('editor.consumer_1_mix_period_year') }
                ] } }}
                .value=${this._config.consumer_4_mix_period || 'day'}
                .configValue=${'consumer_4_mix_period'}
                .label=${this._localize('editor.consumer_1_mix_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_4_mix_ring_gap !== undefined ? this._config.consumer_4_mix_ring_gap : 8}
                .configValue=${'consumer_4_mix_ring_gap'}
                .label=${this._localize('editor.consumer_1_mix_ring_gap')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_4_mix_ring_thickness !== undefined ? this._config.consumer_4_mix_ring_thickness : 4}
                .configValue=${'consumer_4_mix_ring_thickness'}
                .label=${this._localize('editor.consumer_1_mix_ring_thickness')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Tag -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_day')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_pv_day || "", 'consumer_4_mix_pv_day', this._localize('editor.consumer_4_mix_pv_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_lg_day || "", 'consumer_4_mix_lg_day', this._localize('editor.consumer_4_mix_lg_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_venus_day || "", 'consumer_4_mix_venus_day', this._localize('editor.consumer_4_mix_venus_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_grid_day || "", 'consumer_4_mix_grid_day', this._localize('editor.consumer_4_mix_grid_day'))}

            <!-- Monat -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_month')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_pv_month || "", 'consumer_4_mix_pv_month', this._localize('editor.consumer_4_mix_pv_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_lg_month || "", 'consumer_4_mix_lg_month', this._localize('editor.consumer_4_mix_lg_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_venus_month || "", 'consumer_4_mix_venus_month', this._localize('editor.consumer_4_mix_venus_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_grid_month || "", 'consumer_4_mix_grid_month', this._localize('editor.consumer_4_mix_grid_month'))}

            <!-- Jahr -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_year')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_pv_year || "", 'consumer_4_mix_pv_year', this._localize('editor.consumer_4_mix_pv_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_lg_year || "", 'consumer_4_mix_lg_year', this._localize('editor.consumer_4_mix_lg_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_venus_year || "", 'consumer_4_mix_venus_year', this._localize('editor.consumer_4_mix_venus_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_mix_grid_year || "", 'consumer_4_mix_grid_year', this._localize('editor.consumer_4_mix_grid_year'))}

            <!-- Phase 5.83: per-segment colors for the c4 mix-ring.
                 Each defaults to the matching pipe color when unset.
                 Reuses the consumer_1 color i18n labels (identical PV/LG/Venus/Grid
                 semantics) -- no new translation keys needed. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_4_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_4_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_4_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_4_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}

            <!-- Phase 5.62: rotation for Spüler bubble -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.rotation_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_4_rotate_show_live !== false}
                    .configValue=${'consumer_4_rotate_show_live'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
            </div>

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_4_rotate_show_daily_1 === true}
                    .configValue=${'consumer_4_rotate_show_daily_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_rotate_daily_1 || "", 'consumer_4_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
            ${this._renderColorPicker('consumer_4_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_4_rotate_show_daily_2 === true}
                    .configValue=${'consumer_4_rotate_show_daily_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_rotate_daily_2 || "", 'consumer_4_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
            ${this._renderColorPicker('consumer_4_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_4_rotate_show_daily_3 === true}
                    .configValue=${'consumer_4_rotate_show_daily_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_rotate_daily_3 || "", 'consumer_4_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
            ${this._renderColorPicker('consumer_4_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}

            <!-- Phase 5.67.9: Sparkline / history graph for Spüler.
                 Default colour #eab308 (yellow, matches the bubble's
                 default consumer-4 colour). Same control set as
                 Tesla / Waschen / Trockner. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.sparkline_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_4_sparkline === true}
                    .configValue=${'consumer_4_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_sparkline_entity || "", 'consumer_4_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.consumer_4_sparkline_period || '24h'}
                .configValue=${'consumer_4_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.consumer_4_sparkline_layer || 'back'}
                .configValue=${'consumer_4_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.consumer_4_sparkline_style || 'area-line'}
                .configValue=${'consumer_4_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.consumer_4_sparkline_opacity !== undefined ? this._config.consumer_4_sparkline_opacity : 0.35}
                .configValue=${'consumer_4_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('consumer_4_sparkline_color', this._localize('editor.sparkline_color'), '#eab308')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_4_sparkline_debug === true}
                    .configValue=${'consumer_4_sparkline_debug'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_debug')}</div>
            </div>

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_4_sparkline_test_mode === true}
                    .configValue=${'consumer_4_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
            </ha-expansion-panel>
        </div>
        `;
    }

    // Phase 5.58: dedicated sub-view for Trockner (Consumer 3) -- fifth bubble
    // with full feature parity to Tesla/BWWP/Pumpe/Waschen. Default donut
    // max = 5 (kWh) suitable for a daily energy budget on a tumble dryer.
    // User can override consumer_3_soc_max for any other ratio metric.
    // Rotation (phase 5.59) and charge-mix ring (phase 5.60) follow.
    _renderConsumer3View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(3)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #06b6d4;">${this._localize('editor.consumer_3_title')}</div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_3_enabled !== false}
                    .configValue=${'consumer_3_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3, 'consumer_3', this._localize('editor.entity'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.consumer_3_label}
                .configValue=${'consumer_3_label'}
                .label=${this._localize('editor.label')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.consumer_3_icon}
                .configValue=${'consumer_3_icon'}
                .label=${this._localize('editor.icon')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.invert_consumer')}</span>
                <ha-switch
                    .checked=${this._config.invert_consumer_3 === true}
                    .configValue=${'invert_consumer_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.consumer_hide_pipe')}</span>
                <ha-switch
                    .checked=${this._config.consumer_3_hide_pipe === true}
                    .configValue=${'consumer_3_hide_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            ${this._config.consumer_3_hide_pipe === true ? html`
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 2000, step: 10, mode: "slider" } }}
                .value=${this._config.consumer_3_pipe_threshold !== undefined ? this._config.consumer_3_pipe_threshold : 0}
                .configValue=${'consumer_3_pipe_threshold'}
                .label=${this._localize('editor.consumer_pipe_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_unit_kw')}</span>
                <ha-switch
                    .checked=${this._config.consumer_3_unit_kw === true}
                    .configValue=${'consumer_3_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_power')}</span>
                <ha-switch
                    .checked=${this._config.consumer_3_show_power !== false}
                    .configValue=${'consumer_3_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_flow_rate')}</span>
                <ha-switch
                    .checked=${this._config.show_flow_rate_consumer_3 === true}
                    .configValue=${'show_flow_rate_consumer_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_3_label_offset_x !== undefined ? this._config.consumer_3_label_offset_x : 0}
                .configValue=${'consumer_3_label_offset_x'}
                .label=${this._localize('editor.consumer_label_offset_x')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_3_label_offset_y !== undefined ? this._config.consumer_3_label_offset_y : -25}
                .configValue=${'consumer_3_label_offset_y'}
                .label=${this._localize('editor.consumer_label_offset_y')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_3_animation_threshold !== undefined ? this._config.consumer_3_animation_threshold : 0}
                .configValue=${'consumer_3_animation_threshold'}
                .label=${this._localize('editor.consumer_animation_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_3 || "", 'secondary_consumer_3', this._localize('editor.secondary_sensor'))}

            ${this._renderColorPickerQuint('color_consumer_3', 'color_pipe_consumer_3', 'color_text_consumer_3', 'color_icon_consumer_3', 'color_secondary_consumer_3', '#06b6d4')}

            <!-- Phase 5.58: configurable donut for Trockner. Generic ratio
                 visualisation: secondary sensor / max. Use a daily energy
                 sensor with max=5 kWh for budget, or any other progress
                 indicator. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_3_donut_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_3_donut_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_3_soc_donut_mode === true}
                    .configValue=${'consumer_3_soc_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_3_soc_donut_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 1000, step: 1, mode: "box" } }}
                .value=${this._config.consumer_3_soc_max !== undefined ? this._config.consumer_3_soc_max : 5}
                .configValue=${'consumer_3_soc_max'}
                .label=${this._localize('editor.consumer_3_soc_max')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Phase 5.60: Charge-mix outer ring for Trockner. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_3_mix_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_3_mix_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_3_mix_donut_mode === true}
                    .configValue=${'consumer_3_mix_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_3_mix_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "day",   label: this._localize('editor.consumer_1_mix_period_day') },
                    { value: "month", label: this._localize('editor.consumer_1_mix_period_month') },
                    { value: "year",  label: this._localize('editor.consumer_1_mix_period_year') }
                ] } }}
                .value=${this._config.consumer_3_mix_period || 'day'}
                .configValue=${'consumer_3_mix_period'}
                .label=${this._localize('editor.consumer_1_mix_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_3_mix_ring_gap !== undefined ? this._config.consumer_3_mix_ring_gap : 8}
                .configValue=${'consumer_3_mix_ring_gap'}
                .label=${this._localize('editor.consumer_1_mix_ring_gap')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_3_mix_ring_thickness !== undefined ? this._config.consumer_3_mix_ring_thickness : 4}
                .configValue=${'consumer_3_mix_ring_thickness'}
                .label=${this._localize('editor.consumer_1_mix_ring_thickness')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Tag -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_day')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_pv_day || "", 'consumer_3_mix_pv_day', this._localize('editor.consumer_3_mix_pv_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_lg_day || "", 'consumer_3_mix_lg_day', this._localize('editor.consumer_3_mix_lg_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_venus_day || "", 'consumer_3_mix_venus_day', this._localize('editor.consumer_3_mix_venus_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_grid_day || "", 'consumer_3_mix_grid_day', this._localize('editor.consumer_3_mix_grid_day'))}

            <!-- Monat -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_month')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_pv_month || "", 'consumer_3_mix_pv_month', this._localize('editor.consumer_3_mix_pv_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_lg_month || "", 'consumer_3_mix_lg_month', this._localize('editor.consumer_3_mix_lg_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_venus_month || "", 'consumer_3_mix_venus_month', this._localize('editor.consumer_3_mix_venus_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_grid_month || "", 'consumer_3_mix_grid_month', this._localize('editor.consumer_3_mix_grid_month'))}

            <!-- Jahr -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_year')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_pv_year || "", 'consumer_3_mix_pv_year', this._localize('editor.consumer_3_mix_pv_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_lg_year || "", 'consumer_3_mix_lg_year', this._localize('editor.consumer_3_mix_lg_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_venus_year || "", 'consumer_3_mix_venus_year', this._localize('editor.consumer_3_mix_venus_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_mix_grid_year || "", 'consumer_3_mix_grid_year', this._localize('editor.consumer_3_mix_grid_year'))}

            <!-- Phase 5.83: per-segment colors for the c3 mix-ring.
                 Each defaults to the matching pipe color when unset.
                 Reuses the consumer_1 color i18n labels (identical PV/LG/Venus/Grid
                 semantics) -- no new translation keys needed. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_3_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_3_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_3_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_3_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}

            <!-- Phase 5.59: rotation for Trockner bubble (analog Tesla/BWWP/Pumpe/Waschen) -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.rotation_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_3_rotate_show_live !== false}
                    .configValue=${'consumer_3_rotate_show_live'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
            </div>

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_3_rotate_show_daily_1 === true}
                    .configValue=${'consumer_3_rotate_show_daily_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_rotate_daily_1 || "", 'consumer_3_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
            ${this._renderColorPicker('consumer_3_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_3_rotate_show_daily_2 === true}
                    .configValue=${'consumer_3_rotate_show_daily_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_rotate_daily_2 || "", 'consumer_3_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
            ${this._renderColorPicker('consumer_3_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_3_rotate_show_daily_3 === true}
                    .configValue=${'consumer_3_rotate_show_daily_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_rotate_daily_3 || "", 'consumer_3_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
            ${this._renderColorPicker('consumer_3_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}

            <!-- Phase 5.67: Sparkline / history graph in bubble background.
                 Prototype on Trockner first; if visually convincing,
                 replicate to all 7 consumer bubbles in follow-up phases. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.sparkline_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_3_sparkline === true}
                    .configValue=${'consumer_3_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            <!-- Phase 5.67.1: optional sensor override. Empty value =
                 fall back to consumer_3 main entity. Allows showing any
                 entity (e.g. temperature, total energy, status) in the
                 background even when the main sensor is power. -->
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_sparkline_entity || "", 'consumer_3_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.consumer_3_sparkline_period || '24h'}
                .configValue=${'consumer_3_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.consumer_3_sparkline_layer || 'back'}
                .configValue=${'consumer_3_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.consumer_3_sparkline_style || 'area-line'}
                .configValue=${'consumer_3_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.consumer_3_sparkline_opacity !== undefined ? this._config.consumer_3_sparkline_opacity : 0.35}
                .configValue=${'consumer_3_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('consumer_3_sparkline_color', this._localize('editor.sparkline_color'), '#06b6d4')}

            <!-- Phase 5.67.1: developer debug toggle. When on, the fetch
                 helper logs URL, raw response, parsed series length and
                 first/last point to the browser DevTools console. Use to
                 diagnose why no chart appears (wrong sensor? empty
                 history? auth failure?). -->
            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_3_sparkline_debug === true}
                    .configValue=${'consumer_3_sparkline_debug'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_debug')}</div>
            </div>

            <!-- Phase 5.67.2: test-mode toggle. Replaces the live history
                 fetch with a synthetic sine wave so the render pipeline can
                 be verified in isolation. If you enable this and see a
                 smooth curve in the bubble, the rendering works -- any
                 real-mode failure is then about data fetching, not display. -->
            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_3_sparkline_test_mode === true}
                    .configValue=${'consumer_3_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
            </ha-expansion-panel>
        </div>
        `;
    }

    // Phase 5.55: dedicated sub-view for Waschen (Consumer 2) -- fourth bubble
    // with full feature parity to Tesla/BWWP/Pumpe. Default donut max = 5 (kWh)
    // suitable for a daily energy budget on a washing machine. User can
    // override consumer_2_soc_max for other sensor ranges (different machine,
    // or a different secondary sensor like remaining time in minutes).
    // Rotation (phase 5.56) and charge-mix ring (phase 5.57) follow.
    _renderConsumer2View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(2)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #f97316;">${this._localize('editor.consumer_2_title')}</div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_2_enabled !== false}
                    .configValue=${'consumer_2_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2, 'consumer_2', this._localize('editor.entity'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.consumer_2_label}
                .configValue=${'consumer_2_label'}
                .label=${this._localize('editor.label')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.consumer_2_icon}
                .configValue=${'consumer_2_icon'}
                .label=${this._localize('editor.icon')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.invert_consumer')}</span>
                <ha-switch
                    .checked=${this._config.invert_consumer_2 === true}
                    .configValue=${'invert_consumer_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.consumer_hide_pipe')}</span>
                <ha-switch
                    .checked=${this._config.consumer_2_hide_pipe === true}
                    .configValue=${'consumer_2_hide_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            ${this._config.consumer_2_hide_pipe === true ? html`
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 2000, step: 10, mode: "slider" } }}
                .value=${this._config.consumer_2_pipe_threshold !== undefined ? this._config.consumer_2_pipe_threshold : 0}
                .configValue=${'consumer_2_pipe_threshold'}
                .label=${this._localize('editor.consumer_pipe_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_unit_kw')}</span>
                <ha-switch
                    .checked=${this._config.consumer_2_unit_kw === true}
                    .configValue=${'consumer_2_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_power')}</span>
                <ha-switch
                    .checked=${this._config.consumer_2_show_power !== false}
                    .configValue=${'consumer_2_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_flow_rate')}</span>
                <ha-switch
                    .checked=${this._config.show_flow_rate_consumer_2 === true}
                    .configValue=${'show_flow_rate_consumer_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_2_label_offset_x !== undefined ? this._config.consumer_2_label_offset_x : 0}
                .configValue=${'consumer_2_label_offset_x'}
                .label=${this._localize('editor.consumer_label_offset_x')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_2_label_offset_y !== undefined ? this._config.consumer_2_label_offset_y : -25}
                .configValue=${'consumer_2_label_offset_y'}
                .label=${this._localize('editor.consumer_label_offset_y')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_2_animation_threshold !== undefined ? this._config.consumer_2_animation_threshold : 0}
                .configValue=${'consumer_2_animation_threshold'}
                .label=${this._localize('editor.consumer_animation_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_2 || "", 'secondary_consumer_2', this._localize('editor.secondary_sensor'))}

            ${this._renderColorPickerQuint('color_consumer_2', 'color_pipe_consumer_2', 'color_text_consumer_2', 'color_icon_consumer_2', 'color_secondary_consumer_2', '#f97316')}

            <!-- Phase 5.55/5.82: configurable donut for Waschen, wrapped in
                 a collapsible expansion panel. Generic ratio visualisation:
                 secondary sensor / max. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_2_donut_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_2_donut_hint')}
                </div>

                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_2_soc_donut_mode === true}
                        .configValue=${'consumer_2_soc_donut_mode'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.consumer_2_soc_donut_enable')}</div>
                </div>

                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 1, max: 1000, step: 1, mode: "box" } }}
                    .value=${this._config.consumer_2_soc_max !== undefined ? this._config.consumer_2_soc_max : 5}
                    .configValue=${'consumer_2_soc_max'}
                    .label=${this._localize('editor.consumer_2_soc_max')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </ha-expansion-panel>

            <!-- Phase 5.57/5.82: Charge-mix outer ring for Waschen, wrapped
                 in a collapsible expansion panel. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_2_mix_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_2_mix_hint')}
                </div>

                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_2_mix_donut_mode === true}
                        .configValue=${'consumer_2_mix_donut_mode'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.consumer_2_mix_enable')}</div>
                </div>

                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ select: { mode: "dropdown", options: [
                        { value: "day",   label: this._localize('editor.consumer_1_mix_period_day') },
                        { value: "month", label: this._localize('editor.consumer_1_mix_period_month') },
                        { value: "year",  label: this._localize('editor.consumer_1_mix_period_year') }
                    ] } }}
                    .value=${this._config.consumer_2_mix_period || 'day'}
                    .configValue=${'consumer_2_mix_period'}
                    .label=${this._localize('editor.consumer_1_mix_period')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>

                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                    .value=${this._config.consumer_2_mix_ring_gap !== undefined ? this._config.consumer_2_mix_ring_gap : 8}
                    .configValue=${'consumer_2_mix_ring_gap'}
                    .label=${this._localize('editor.consumer_1_mix_ring_gap')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>

                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                    .value=${this._config.consumer_2_mix_ring_thickness !== undefined ? this._config.consumer_2_mix_ring_thickness : 4}
                    .configValue=${'consumer_2_mix_ring_thickness'}
                    .label=${this._localize('editor.consumer_1_mix_ring_thickness')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>

                <!-- Tag -->
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                    ${this._localize('editor.consumer_1_mix_period_day')}
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_pv_day || "", 'consumer_2_mix_pv_day', this._localize('editor.consumer_2_mix_pv_day'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_lg_day || "", 'consumer_2_mix_lg_day', this._localize('editor.consumer_2_mix_lg_day'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_venus_day || "", 'consumer_2_mix_venus_day', this._localize('editor.consumer_2_mix_venus_day'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_grid_day || "", 'consumer_2_mix_grid_day', this._localize('editor.consumer_2_mix_grid_day'))}

                <!-- Monat -->
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                    ${this._localize('editor.consumer_1_mix_period_month')}
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_pv_month || "", 'consumer_2_mix_pv_month', this._localize('editor.consumer_2_mix_pv_month'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_lg_month || "", 'consumer_2_mix_lg_month', this._localize('editor.consumer_2_mix_lg_month'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_venus_month || "", 'consumer_2_mix_venus_month', this._localize('editor.consumer_2_mix_venus_month'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_grid_month || "", 'consumer_2_mix_grid_month', this._localize('editor.consumer_2_mix_grid_month'))}

                <!-- Jahr -->
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                    ${this._localize('editor.consumer_1_mix_period_year')}
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_pv_year || "", 'consumer_2_mix_pv_year', this._localize('editor.consumer_2_mix_pv_year'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_lg_year || "", 'consumer_2_mix_lg_year', this._localize('editor.consumer_2_mix_lg_year'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_venus_year || "", 'consumer_2_mix_venus_year', this._localize('editor.consumer_2_mix_venus_year'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_mix_grid_year || "", 'consumer_2_mix_grid_year', this._localize('editor.consumer_2_mix_grid_year'))}

                <!-- Phase 5.83: per-segment colors for the c2 mix-ring.
                     Each defaults to the matching pipe color when unset.
                     Reuses the consumer_1 color i18n labels (identical PV/LG/Venus/Grid
                     semantics) -- no new translation keys needed. -->
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                    ${this._localize('editor.consumer_1_mix_colors_section')}
                </div>
                ${this._renderColorPicker('consumer_2_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
                ${this._renderColorPicker('consumer_2_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
                ${this._renderColorPicker('consumer_2_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
                ${this._renderColorPicker('consumer_2_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
            </ha-expansion-panel>

            <!-- Phase 5.56/5.82: rotation for Waschen bubble, wrapped in
                 a collapsible expansion panel. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.rotation_hint')}
                </div>

                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_2_rotate_show_live !== false}
                        .configValue=${'consumer_2_rotate_show_live'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
                </div>

                <div class="separator"></div>
                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_2_rotate_show_daily_1 === true}
                        .configValue=${'consumer_2_rotate_show_daily_1'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_rotate_daily_1 || "", 'consumer_2_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
                ${this._renderColorPicker('consumer_2_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

                <div class="separator"></div>
                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_2_rotate_show_daily_2 === true}
                        .configValue=${'consumer_2_rotate_show_daily_2'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_rotate_daily_2 || "", 'consumer_2_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
                ${this._renderColorPicker('consumer_2_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

                <div class="separator"></div>
                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_2_rotate_show_daily_3 === true}
                        .configValue=${'consumer_2_rotate_show_daily_3'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_rotate_daily_3 || "", 'consumer_2_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
                ${this._renderColorPicker('consumer_2_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}
            </ha-expansion-panel>

            <!-- Phase 5.67.8/5.82: Sparkline / history graph for Waschen,
                 wrapped in a collapsible expansion panel. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.sparkline_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_2_sparkline === true}
                    .configValue=${'consumer_2_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_sparkline_entity || "", 'consumer_2_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.consumer_2_sparkline_period || '24h'}
                .configValue=${'consumer_2_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.consumer_2_sparkline_layer || 'back'}
                .configValue=${'consumer_2_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.consumer_2_sparkline_style || 'area-line'}
                .configValue=${'consumer_2_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.consumer_2_sparkline_opacity !== undefined ? this._config.consumer_2_sparkline_opacity : 0.35}
                .configValue=${'consumer_2_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('consumer_2_sparkline_color', this._localize('editor.sparkline_color'), '#f97316')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_2_sparkline_debug === true}
                    .configValue=${'consumer_2_sparkline_debug'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_debug')}</div>
            </div>

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_2_sparkline_test_mode === true}
                    .configValue=${'consumer_2_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
            </ha-expansion-panel>
        </div>
        `;
    }

    // Phase 5.52: dedicated sub-view for Pumpe (Consumer 7) -- third bubble
    // with full feature parity to Tesla/BWWP. Default donut max = 165 cm
    // suitable for a typical Regenschacht / rainwater cistern. User can
    // override consumer_7_soc_max for other sensor ranges (deeper cisterns,
    // shallower wells, etc.). Rotation (phase 5.53) and charge-mix ring
    // (phase 5.54) follow in the next two phases.
    _renderConsumer7View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(7)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #ec4899;">${this._localize('editor.consumer_7_title')}</div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_7_enabled !== false}
                    .configValue=${'consumer_7_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7, 'consumer_7', this._localize('editor.entity'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.consumer_7_label}
                .configValue=${'consumer_7_label'}
                .label=${this._localize('editor.label')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.consumer_7_icon}
                .configValue=${'consumer_7_icon'}
                .label=${this._localize('editor.icon')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.invert_consumer')}</span>
                <ha-switch
                    .checked=${this._config.invert_consumer_7 === true}
                    .configValue=${'invert_consumer_7'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.consumer_hide_pipe')}</span>
                <ha-switch
                    .checked=${this._config.consumer_7_hide_pipe === true}
                    .configValue=${'consumer_7_hide_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            ${this._config.consumer_7_hide_pipe === true ? html`
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 2000, step: 10, mode: "slider" } }}
                .value=${this._config.consumer_7_pipe_threshold !== undefined ? this._config.consumer_7_pipe_threshold : 0}
                .configValue=${'consumer_7_pipe_threshold'}
                .label=${this._localize('editor.consumer_pipe_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_unit_kw')}</span>
                <ha-switch
                    .checked=${this._config.consumer_7_unit_kw === true}
                    .configValue=${'consumer_7_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_power')}</span>
                <ha-switch
                    .checked=${this._config.consumer_7_show_power !== false}
                    .configValue=${'consumer_7_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_flow_rate')}</span>
                <ha-switch
                    .checked=${this._config.show_flow_rate_consumer_7 === true}
                    .configValue=${'show_flow_rate_consumer_7'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_7_label_offset_x !== undefined ? this._config.consumer_7_label_offset_x : 0}
                .configValue=${'consumer_7_label_offset_x'}
                .label=${this._localize('editor.consumer_label_offset_x')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_7_label_offset_y !== undefined ? this._config.consumer_7_label_offset_y : -25}
                .configValue=${'consumer_7_label_offset_y'}
                .label=${this._localize('editor.consumer_label_offset_y')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_7_animation_threshold !== undefined ? this._config.consumer_7_animation_threshold : 0}
                .configValue=${'consumer_7_animation_threshold'}
                .label=${this._localize('editor.consumer_animation_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_7 || "", 'secondary_consumer_7', this._localize('editor.secondary_sensor'))}

            ${this._renderColorPickerQuint('color_consumer_7', 'color_pipe_consumer_7', 'color_text_consumer_7', 'color_icon_consumer_7', 'color_secondary_consumer_7', '#ec4899')}

            <!-- Phase 5.52: water-level donut ring for Pumpe bubble.
                 Default soc_max = 165 (typical cistern depth in cm). User can
                 change it for deeper/shallower cisterns or other use cases. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_7_donut_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_7_donut_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_7_soc_donut_mode === true}
                    .configValue=${'consumer_7_soc_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_7_soc_donut_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 1000, step: 1, mode: "box" } }}
                .value=${this._config.consumer_7_soc_max !== undefined ? this._config.consumer_7_soc_max : 165}
                .configValue=${'consumer_7_soc_max'}
                .label=${this._localize('editor.consumer_7_soc_max')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Phase 5.54: Charge-mix outer ring for Pumpe. Shows where the
                 bubble's energy came from over the chosen period. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_7_mix_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_7_mix_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_7_mix_donut_mode === true}
                    .configValue=${'consumer_7_mix_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_7_mix_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "day",   label: this._localize('editor.consumer_1_mix_period_day') },
                    { value: "month", label: this._localize('editor.consumer_1_mix_period_month') },
                    { value: "year",  label: this._localize('editor.consumer_1_mix_period_year') }
                ] } }}
                .value=${this._config.consumer_7_mix_period || 'day'}
                .configValue=${'consumer_7_mix_period'}
                .label=${this._localize('editor.consumer_1_mix_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_7_mix_ring_gap !== undefined ? this._config.consumer_7_mix_ring_gap : 8}
                .configValue=${'consumer_7_mix_ring_gap'}
                .label=${this._localize('editor.consumer_1_mix_ring_gap')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_7_mix_ring_thickness !== undefined ? this._config.consumer_7_mix_ring_thickness : 4}
                .configValue=${'consumer_7_mix_ring_thickness'}
                .label=${this._localize('editor.consumer_1_mix_ring_thickness')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Tag -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_day')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_pv_day || "", 'consumer_7_mix_pv_day', this._localize('editor.consumer_7_mix_pv_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_lg_day || "", 'consumer_7_mix_lg_day', this._localize('editor.consumer_7_mix_lg_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_venus_day || "", 'consumer_7_mix_venus_day', this._localize('editor.consumer_7_mix_venus_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_grid_day || "", 'consumer_7_mix_grid_day', this._localize('editor.consumer_7_mix_grid_day'))}

            <!-- Monat -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_month')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_pv_month || "", 'consumer_7_mix_pv_month', this._localize('editor.consumer_7_mix_pv_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_lg_month || "", 'consumer_7_mix_lg_month', this._localize('editor.consumer_7_mix_lg_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_venus_month || "", 'consumer_7_mix_venus_month', this._localize('editor.consumer_7_mix_venus_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_grid_month || "", 'consumer_7_mix_grid_month', this._localize('editor.consumer_7_mix_grid_month'))}

            <!-- Jahr -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_year')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_pv_year || "", 'consumer_7_mix_pv_year', this._localize('editor.consumer_7_mix_pv_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_lg_year || "", 'consumer_7_mix_lg_year', this._localize('editor.consumer_7_mix_lg_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_venus_year || "", 'consumer_7_mix_venus_year', this._localize('editor.consumer_7_mix_venus_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_mix_grid_year || "", 'consumer_7_mix_grid_year', this._localize('editor.consumer_7_mix_grid_year'))}

            <!-- Phase 5.83: per-segment colors for the c7 mix-ring.
                 Each defaults to the matching pipe color when unset.
                 Reuses the consumer_1 color i18n labels (identical PV/LG/Venus/Grid
                 semantics) -- no new translation keys needed. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_7_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_7_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_7_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_7_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}

            <!-- Phase 5.53: rotation for Pumpe bubble (analog Tesla/BWWP/Battery/Venus) -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.rotation_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_7_rotate_show_live !== false}
                    .configValue=${'consumer_7_rotate_show_live'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
            </div>

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_7_rotate_show_daily_1 === true}
                    .configValue=${'consumer_7_rotate_show_daily_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_rotate_daily_1 || "", 'consumer_7_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
            ${this._renderColorPicker('consumer_7_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_7_rotate_show_daily_2 === true}
                    .configValue=${'consumer_7_rotate_show_daily_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_rotate_daily_2 || "", 'consumer_7_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
            ${this._renderColorPicker('consumer_7_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_7_rotate_show_daily_3 === true}
                    .configValue=${'consumer_7_rotate_show_daily_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_rotate_daily_3 || "", 'consumer_7_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
            ${this._renderColorPicker('consumer_7_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}

            <!-- Phase 5.67.12: Sparkline / history graph for Pumpe.
                 COMPLETES THE 7-BUBBLE SPARKLINE PARITY.
                 Default colour #ec4899 (pink, matches the bubble's
                 default consumer-7 colour). Same control set as all
                 other consumer bubbles. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.sparkline_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_7_sparkline === true}
                    .configValue=${'consumer_7_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_sparkline_entity || "", 'consumer_7_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.consumer_7_sparkline_period || '24h'}
                .configValue=${'consumer_7_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.consumer_7_sparkline_layer || 'back'}
                .configValue=${'consumer_7_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.consumer_7_sparkline_style || 'area-line'}
                .configValue=${'consumer_7_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.consumer_7_sparkline_opacity !== undefined ? this._config.consumer_7_sparkline_opacity : 0.35}
                .configValue=${'consumer_7_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('consumer_7_sparkline_color', this._localize('editor.sparkline_color'), '#ec4899')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_7_sparkline_debug === true}
                    .configValue=${'consumer_7_sparkline_debug'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_debug')}</div>
            </div>

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_7_sparkline_test_mode === true}
                    .configValue=${'consumer_7_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
            </ha-expansion-panel>
        </div>
        `;
    }

    // Phase 5.49: dedicated sub-view for BWWP (Consumer 5) -- pattern copied
    // from Tesla (Consumer 1), starting with the SoC donut feature. Rotation
    // and charge-mix ring will follow in phases 5.50 / 5.51. The donut uses
    // consumer_5_soc_max (default 65) to support a temperature-as-percentage
    // semantic for boiler-style sensors (22°C / 65°C = 33.8% filled).
    _renderConsumer5View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(5)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #6366f1;">${this._localize('editor.consumer_5_title')}</div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_5_enabled !== false}
                    .configValue=${'consumer_5_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5, 'consumer_5', this._localize('editor.entity'))}

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.consumer_5_label}
                .configValue=${'consumer_5_label'}
                .label=${this._localize('editor.label')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.consumer_5_icon}
                .configValue=${'consumer_5_icon'}
                .label=${this._localize('editor.icon')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.invert_consumer')}</span>
                <ha-switch
                    .checked=${this._config.invert_consumer_5 === true}
                    .configValue=${'invert_consumer_5'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.consumer_hide_pipe')}</span>
                <ha-switch
                    .checked=${this._config.consumer_5_hide_pipe === true}
                    .configValue=${'consumer_5_hide_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            ${this._config.consumer_5_hide_pipe === true ? html`
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 2000, step: 10, mode: "slider" } }}
                .value=${this._config.consumer_5_pipe_threshold !== undefined ? this._config.consumer_5_pipe_threshold : 0}
                .configValue=${'consumer_5_pipe_threshold'}
                .label=${this._localize('editor.consumer_pipe_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_unit_kw')}</span>
                <ha-switch
                    .checked=${this._config.consumer_5_unit_kw === true}
                    .configValue=${'consumer_5_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_power')}</span>
                <ha-switch
                    .checked=${this._config.consumer_5_show_power !== false}
                    .configValue=${'consumer_5_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_flow_rate')}</span>
                <ha-switch
                    .checked=${this._config.show_flow_rate_consumer_5 === true}
                    .configValue=${'show_flow_rate_consumer_5'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_5_label_offset_x !== undefined ? this._config.consumer_5_label_offset_x : 0}
                .configValue=${'consumer_5_label_offset_x'}
                .label=${this._localize('editor.consumer_label_offset_x')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_5_label_offset_y !== undefined ? this._config.consumer_5_label_offset_y : -25}
                .configValue=${'consumer_5_label_offset_y'}
                .label=${this._localize('editor.consumer_label_offset_y')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_5_animation_threshold !== undefined ? this._config.consumer_5_animation_threshold : 0}
                .configValue=${'consumer_5_animation_threshold'}
                .label=${this._localize('editor.consumer_animation_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_5 || "", 'secondary_consumer_5', this._localize('editor.secondary_sensor'))}

            ${this._renderColorPickerQuint('color_consumer_5', 'color_pipe_consumer_5', 'color_text_consumer_5', 'color_icon_consumer_5', 'color_secondary_consumer_5', '#6366f1')}

            <!-- Phase 5.49: SoC/temperature donut ring for BWWP bubble.
                 Default soc_max = 65 (typical boiler ceiling in °C). User can
                 change it if their boiler runs hotter or for a non-boiler use. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_5_donut_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_5_donut_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_5_soc_donut_mode === true}
                    .configValue=${'consumer_5_soc_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_5_soc_donut_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 1000, step: 1, mode: "box" } }}
                .value=${this._config.consumer_5_soc_max !== undefined ? this._config.consumer_5_soc_max : 65}
                .configValue=${'consumer_5_soc_max'}
                .label=${this._localize('editor.consumer_5_soc_max')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Phase 5.51: Charge-mix outer ring for BWWP. Shows where the
                 bubble's energy came from over the chosen period. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_5_mix_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_5_mix_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_5_mix_donut_mode === true}
                    .configValue=${'consumer_5_mix_donut_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_5_mix_enable')}</div>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "day",   label: this._localize('editor.consumer_1_mix_period_day') },
                    { value: "month", label: this._localize('editor.consumer_1_mix_period_month') },
                    { value: "year",  label: this._localize('editor.consumer_1_mix_period_year') }
                ] } }}
                .value=${this._config.consumer_5_mix_period || 'day'}
                .configValue=${'consumer_5_mix_period'}
                .label=${this._localize('editor.consumer_1_mix_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_5_mix_ring_gap !== undefined ? this._config.consumer_5_mix_ring_gap : 8}
                .configValue=${'consumer_5_mix_ring_gap'}
                .label=${this._localize('editor.consumer_1_mix_ring_gap')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_5_mix_ring_thickness !== undefined ? this._config.consumer_5_mix_ring_thickness : 4}
                .configValue=${'consumer_5_mix_ring_thickness'}
                .label=${this._localize('editor.consumer_1_mix_ring_thickness')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <!-- Tag -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_day')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_pv_day || "", 'consumer_5_mix_pv_day', this._localize('editor.consumer_5_mix_pv_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_lg_day || "", 'consumer_5_mix_lg_day', this._localize('editor.consumer_5_mix_lg_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_venus_day || "", 'consumer_5_mix_venus_day', this._localize('editor.consumer_5_mix_venus_day'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_grid_day || "", 'consumer_5_mix_grid_day', this._localize('editor.consumer_5_mix_grid_day'))}

            <!-- Monat -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_month')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_pv_month || "", 'consumer_5_mix_pv_month', this._localize('editor.consumer_5_mix_pv_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_lg_month || "", 'consumer_5_mix_lg_month', this._localize('editor.consumer_5_mix_lg_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_venus_month || "", 'consumer_5_mix_venus_month', this._localize('editor.consumer_5_mix_venus_month'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_grid_month || "", 'consumer_5_mix_grid_month', this._localize('editor.consumer_5_mix_grid_month'))}

            <!-- Jahr -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_period_year')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_pv_year || "", 'consumer_5_mix_pv_year', this._localize('editor.consumer_5_mix_pv_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_lg_year || "", 'consumer_5_mix_lg_year', this._localize('editor.consumer_5_mix_lg_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_venus_year || "", 'consumer_5_mix_venus_year', this._localize('editor.consumer_5_mix_venus_year'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_mix_grid_year || "", 'consumer_5_mix_grid_year', this._localize('editor.consumer_5_mix_grid_year'))}

            <!-- Phase 5.81: per-segment colors for the BWWP mix-ring.
                 Each defaults to the matching pipe color when unset.
                 Reuses the consumer_1 color labels (same PV/LG/Venus/Grid
                 semantics) to avoid duplicate i18n keys. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_5_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_5_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_5_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_5_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}

            <!-- Phase 5.50: rotation for BWWP bubble (analog Tesla/Battery/Venus) -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.rotation_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_5_rotate_show_live !== false}
                    .configValue=${'consumer_5_rotate_show_live'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
            </div>

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_5_rotate_show_daily_1 === true}
                    .configValue=${'consumer_5_rotate_show_daily_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_rotate_daily_1 || "", 'consumer_5_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
            ${this._renderColorPicker('consumer_5_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_5_rotate_show_daily_2 === true}
                    .configValue=${'consumer_5_rotate_show_daily_2'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_rotate_daily_2 || "", 'consumer_5_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
            ${this._renderColorPicker('consumer_5_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

            <div class="separator"></div>
            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_5_rotate_show_daily_3 === true}
                    .configValue=${'consumer_5_rotate_show_daily_3'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_rotate_daily_3 || "", 'consumer_5_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
            ${this._renderColorPicker('consumer_5_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}

            <!-- Phase 5.67.10: Sparkline / history graph for BWWP.
                 Default colour #6366f1 (indigo, matches the bubble's
                 default consumer-5 colour). Same control set as
                 Tesla / Waschen / Trockner / Spüler. -->
            </ha-expansion-panel>

            <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.sparkline_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_5_sparkline === true}
                    .configValue=${'consumer_5_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_sparkline_entity || "", 'consumer_5_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.consumer_5_sparkline_period || '24h'}
                .configValue=${'consumer_5_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.consumer_5_sparkline_layer || 'back'}
                .configValue=${'consumer_5_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.consumer_5_sparkline_style || 'area-line'}
                .configValue=${'consumer_5_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.consumer_5_sparkline_opacity !== undefined ? this._config.consumer_5_sparkline_opacity : 0.35}
                .configValue=${'consumer_5_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('consumer_5_sparkline_color', this._localize('editor.sparkline_color'), '#6366f1')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_5_sparkline_debug === true}
                    .configValue=${'consumer_5_sparkline_debug'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_debug')}</div>
            </div>

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_5_sparkline_test_mode === true}
                    .configValue=${'consumer_5_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
            </ha-expansion-panel>
        </div>
        `;
    }

    // Phase 5.45: dedicated sub-view for Tesla (Consumer 1) -- pulled out of
    // the consumers collective view so each major bubble has its own top-
    // level slot in the editor (Solar / Grid / Battery / Venus / Tesla / ...).
    // Future phases will give Tesla the SoC donut + charge-mix ring features.
    _renderConsumer1View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.consumer_1_section')}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #a855f7;">${this._localize('editor.consumer_1_title')}</div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_1_enabled !== false}
                    .configValue=${'consumer_1_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.consumer_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1, 'consumer_1', this._localize('editor.entity'))}
            
            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.consumer_1_label}
                .configValue=${'consumer_1_label'}
                .label=${this._localize('editor.label')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.consumer_1_icon}
                .configValue=${'consumer_1_icon'}
                .label=${this._localize('editor.icon')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.invert_consumer')}</span>
                <ha-switch
                    .checked=${this._config.invert_consumer_1 === true}
                    .configValue=${'invert_consumer_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                <span>${this._localize('editor.consumer_hide_pipe')}</span>
                <ha-switch
                    .checked=${this._config.consumer_1_hide_pipe === true}
                    .configValue=${'consumer_1_hide_pipe'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            ${this._config.consumer_1_hide_pipe === true ? html`
            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 2000, step: 10, mode: "slider" } }}
                .value=${this._config.consumer_1_pipe_threshold !== undefined ? this._config.consumer_1_pipe_threshold : 0}
                .configValue=${'consumer_1_pipe_threshold'}
                .label=${this._localize('editor.consumer_pipe_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>
            ` : ''}

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_unit_kw')}</span>
                <ha-switch
                    .checked=${this._config.consumer_1_unit_kw === true}
                    .configValue=${'consumer_1_unit_kw'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_power')}</span>
                <ha-switch
                    .checked=${this._config.consumer_1_show_power !== false}
                    .configValue=${'consumer_1_show_power'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px; margin-bottom: 8px;">
                <span>${this._localize('editor.consumer_show_flow_rate')}</span>
                <ha-switch
                    .checked=${this._config.show_flow_rate_consumer_1 === true}
                    .configValue=${'show_flow_rate_consumer_1'}
                    @change=${this._valueChanged}
                ></ha-switch>
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_1_label_offset_x !== undefined ? this._config.consumer_1_label_offset_x : 0}
                .configValue=${'consumer_1_label_offset_x'}
                .label=${this._localize('editor.consumer_label_offset_x')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_1_label_offset_y !== undefined ? this._config.consumer_1_label_offset_y : -25}
                .configValue=${'consumer_1_label_offset_y'}
                .label=${this._localize('editor.consumer_label_offset_y')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                .value=${this._config.consumer_1_animation_threshold !== undefined ? this._config.consumer_1_animation_threshold : 0}
                .configValue=${'consumer_1_animation_threshold'}
                .label=${this._localize('editor.consumer_animation_threshold')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_1 || "", 'secondary_consumer_1', this._localize('editor.secondary_sensor'))}

            ${this._renderColorPickerQuint('color_consumer_1', 'color_pipe_consumer_1', 'color_text_consumer_1', 'color_icon_consumer_1', 'color_secondary_consumer_1', '#a855f7')}

            <!-- Phase 5.47/5.82: SoC donut ring for Tesla bubble, now wrapped
                 in a collapsible expansion panel. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_1_donut_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_1_donut_hint')}
                </div>

                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_1_soc_donut_mode === true}
                        .configValue=${'consumer_1_soc_donut_mode'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.consumer_1_soc_donut_enable')}</div>
                </div>

                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 1, max: 1000, step: 1, mode: "box" } }}
                    .value=${this._config.consumer_1_soc_max !== undefined ? this._config.consumer_1_soc_max : 100}
                    .configValue=${'consumer_1_soc_max'}
                    .label=${this._localize('editor.consumer_1_soc_max')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </ha-expansion-panel>

            <!-- Phase 5.48/5.82: Charge-mix outer ring for Tesla, wrapped
                 in a collapsible expansion panel. Includes the per-segment
                 colors (5.80) as an internal sub-heading because they're
                 logically part of the same outer-ring feature. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.consumer_1_mix_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.consumer_1_mix_hint')}
                </div>

                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_1_mix_donut_mode === true}
                        .configValue=${'consumer_1_mix_donut_mode'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.consumer_1_mix_enable')}</div>
                </div>

                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ select: { mode: "dropdown", options: [
                        { value: "day",   label: this._localize('editor.consumer_1_mix_period_day') },
                        { value: "month", label: this._localize('editor.consumer_1_mix_period_month') },
                        { value: "year",  label: this._localize('editor.consumer_1_mix_period_year') }
                    ] } }}
                    .value=${this._config.consumer_1_mix_period || 'day'}
                    .configValue=${'consumer_1_mix_period'}
                    .label=${this._localize('editor.consumer_1_mix_period')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>

                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 30, step: 1, mode: "slider" } }}
                    .value=${this._config.consumer_1_mix_ring_gap !== undefined ? this._config.consumer_1_mix_ring_gap : 8}
                    .configValue=${'consumer_1_mix_ring_gap'}
                    .label=${this._localize('editor.consumer_1_mix_ring_gap')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>

                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 1, max: 15, step: 1, mode: "slider" } }}
                    .value=${this._config.consumer_1_mix_ring_thickness !== undefined ? this._config.consumer_1_mix_ring_thickness : 4}
                    .configValue=${'consumer_1_mix_ring_thickness'}
                    .label=${this._localize('editor.consumer_1_mix_ring_thickness')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>

                <!-- Tag -->
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                    ${this._localize('editor.consumer_1_mix_period_day')}
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_pv_day || "", 'consumer_1_mix_pv_day', this._localize('editor.consumer_1_mix_pv_day'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_lg_day || "", 'consumer_1_mix_lg_day', this._localize('editor.consumer_1_mix_lg_day'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_venus_day || "", 'consumer_1_mix_venus_day', this._localize('editor.consumer_1_mix_venus_day'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_grid_day || "", 'consumer_1_mix_grid_day', this._localize('editor.consumer_1_mix_grid_day'))}

                <!-- Monat -->
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                    ${this._localize('editor.consumer_1_mix_period_month')}
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_pv_month || "", 'consumer_1_mix_pv_month', this._localize('editor.consumer_1_mix_pv_month'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_lg_month || "", 'consumer_1_mix_lg_month', this._localize('editor.consumer_1_mix_lg_month'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_venus_month || "", 'consumer_1_mix_venus_month', this._localize('editor.consumer_1_mix_venus_month'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_grid_month || "", 'consumer_1_mix_grid_month', this._localize('editor.consumer_1_mix_grid_month'))}

                <!-- Jahr -->
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                    ${this._localize('editor.consumer_1_mix_period_year')}
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_pv_year || "", 'consumer_1_mix_pv_year', this._localize('editor.consumer_1_mix_pv_year'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_lg_year || "", 'consumer_1_mix_lg_year', this._localize('editor.consumer_1_mix_lg_year'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_venus_year || "", 'consumer_1_mix_venus_year', this._localize('editor.consumer_1_mix_venus_year'))}
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_mix_grid_year || "", 'consumer_1_mix_grid_year', this._localize('editor.consumer_1_mix_grid_year'))}

                <!-- Phase 5.80: per-segment colors for the Tesla mix-ring.
                     Each defaults to the matching pipe color when unset. -->
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                    ${this._localize('editor.consumer_1_mix_colors_section')}
                </div>
                ${this._renderColorPicker('consumer_1_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
                ${this._renderColorPicker('consumer_1_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
                ${this._renderColorPicker('consumer_1_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
                ${this._renderColorPicker('consumer_1_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
            </ha-expansion-panel>

            <!-- Phase 5.44/5.82: rotation for Tesla bubble, wrapped in
                 a collapsible expansion panel. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.rotation_hint')}
                </div>

                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_1_rotate_show_live !== false}
                        .configValue=${'consumer_1_rotate_show_live'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.rotation_show_live')}</div>
                </div>

                <div class="separator"></div>
                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_1_rotate_show_daily_1 === true}
                        .configValue=${'consumer_1_rotate_show_daily_1'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.rotation_show_slot_1')}</div>
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_rotate_daily_1 || "", 'consumer_1_rotate_daily_1', this._localize('editor.rotation_slot_1_sensor'))}
                ${this._renderColorPicker('consumer_1_rotate_color_daily_1', this._localize('editor.rotation_slot_1_color'), '#ff3333')}

                <div class="separator"></div>
                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_1_rotate_show_daily_2 === true}
                        .configValue=${'consumer_1_rotate_show_daily_2'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.rotation_show_slot_2')}</div>
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_rotate_daily_2 || "", 'consumer_1_rotate_daily_2', this._localize('editor.rotation_slot_2_sensor'))}
                ${this._renderColorPicker('consumer_1_rotate_color_daily_2', this._localize('editor.rotation_slot_2_color'), '#33ff77')}

                <div class="separator"></div>
                <div class="switch-row">
                    <ha-switch
                        .checked=${this._config.consumer_1_rotate_show_daily_3 === true}
                        .configValue=${'consumer_1_rotate_show_daily_3'}
                        @change=${this._valueChanged}
                    ></ha-switch>
                    <div class="switch-label">${this._localize('editor.rotation_show_slot_3')}</div>
                </div>
                ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_rotate_daily_3 || "", 'consumer_1_rotate_daily_3', this._localize('editor.rotation_slot_3_sensor'))}
                ${this._renderColorPicker('consumer_1_rotate_color_daily_3', this._localize('editor.rotation_slot_3_color'), '#3377ff')}
            </ha-expansion-panel>

            <!-- Phase 5.67.7/5.82: Sparkline / history graph in bubble
                 background, wrapped in a collapsible expansion panel. -->
            <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
                <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                    ${this._localize('editor.sparkline_hint')}
                </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.consumer_1_sparkline === true}
                    .configValue=${'consumer_1_sparkline'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_enabled')}</div>
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_sparkline_entity || "", 'consumer_1_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "1h",  label: "1h"  },
                    { value: "6h",  label: "6h"  },
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" }
                ] } }}
                .value=${this._config.consumer_1_sparkline_period || '24h'}
                .configValue=${'consumer_1_sparkline_period'}
                .label=${this._localize('editor.sparkline_period')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "back",  label: this._localize('editor.sparkline_layer_back')  },
                    { value: "mid",   label: this._localize('editor.sparkline_layer_mid')   },
                    { value: "front", label: this._localize('editor.sparkline_layer_front') }
                ] } }}
                .value=${this._config.consumer_1_sparkline_layer || 'back'}
                .configValue=${'consumer_1_sparkline_layer'}
                .label=${this._localize('editor.sparkline_layer')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [
                    { value: "area",      label: this._localize('editor.sparkline_style_area')     },
                    { value: "line",      label: this._localize('editor.sparkline_style_line')     },
                    { value: "area-line", label: this._localize('editor.sparkline_style_arealine') }
                ] } }}
                .value=${this._config.consumer_1_sparkline_style || 'area-line'}
                .configValue=${'consumer_1_sparkline_style'}
                .label=${this._localize('editor.sparkline_style')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 0.05, max: 1.0, step: 0.05, mode: "slider" } }}
                .value=${this._config.consumer_1_sparkline_opacity !== undefined ? this._config.consumer_1_sparkline_opacity : 0.35}
                .configValue=${'consumer_1_sparkline_opacity'}
                .label=${this._localize('editor.sparkline_opacity')}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderColorPicker('consumer_1_sparkline_color', this._localize('editor.sparkline_color'), '#ff3333')}

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_1_sparkline_debug === true}
                    .configValue=${'consumer_1_sparkline_debug'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_debug')}</div>
            </div>

            <div class="switch-row" style="margin-top: 8px;">
                <ha-switch
                    .checked=${this._config.consumer_1_sparkline_test_mode === true}
                    .configValue=${'consumer_1_sparkline_test_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.sparkline_test_mode')}</div>
            </div>
            </ha-expansion-panel>
        </div>
        `;
    }

    _renderConsumersView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.consumers_section')}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title">${this._localize('editor.house_total_title')}</div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.house || "", 'house', this._localize('editor.house_sensor_label'))}
             <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                ${this._localize('editor.house_sensor_hint')}
            </div>

            <ha-selector
                .hass=${this.hass}
                .selector=${textSelectorSchema}
                .value=${this._config.house_label}
                .configValue=${'house_label'}
                .label=${this._localize('editor.label') + " (Optional)"}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            <ha-selector
                .hass=${this.hass}
                .selector=${iconSelectorSchema}
                .value=${this._config.house_icon}
                .configValue=${'house_icon'}
                .label=${this._localize('editor.icon') + " (Optional)"}
                @value-changed=${this._valueChanged}
            ></ha-selector>

            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_house || "", 'secondary_house', this._localize('editor.secondary_sensor'))}
            ${this._renderColorPickerQuint('color_house', null, 'color_text_house', 'color_icon_house', 'color_secondary_house', '#ff0080')}
        </div>

      `;
    }

    render() {
        if (!this.hass || !this._config) {
            return html``;
        }

        const entities = this._config.entities || {};

        const entitySelectorSchema = { entity: { domain: ["sensor", "input_number"] } };
        const textSelectorSchema = { text: {} };
        const iconSelectorSchema = { icon: {} };

        // SUBVIEW ROUTING
        if (this._subView === 'solar') return this._renderSolarView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'grid') return this._renderGridView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'battery') return this._renderBatteryView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'venus') return this._renderVenusView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'bkw') return this._renderBkwView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'consumer_1') return this._renderConsumer1View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'consumer_2') return this._renderConsumer2View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'consumer_3') return this._renderConsumer3View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'consumer_4') return this._renderConsumer4View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'consumer_5') return this._renderConsumer5View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'consumer_6') return this._renderConsumer6View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'consumer_7') return this._renderConsumer7View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'consumers') return this._renderConsumersView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'power') return this._renderPowerView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'temp') return this._renderTempView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'donut') return this._renderDonutView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema);
        if (this._subView === 'side_panels') return this._renderSidePanelsView();


        // MAIN MENU VIEW
        return html`
      <div class="card-config">
        
        <div class="section-title">${this._localize('editor.main_title')}</div>

        <div class="menu-item" @click=${() => this._goSubView('solar')}>
            <div class="menu-icon"><ha-icon icon="mdi:solar-power"></ha-icon> ${this._localize('editor.solar_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <div class="menu-item" @click=${() => this._goSubView('grid')}>
            <div class="menu-icon"><ha-icon icon="mdi:transmission-tower"></ha-icon> ${this._localize('editor.grid_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <div class="menu-item" @click=${() => this._goSubView('battery')}>
            <div class="menu-icon"><ha-icon icon="mdi:battery-high"></ha-icon> ${this._localize('editor.battery_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <div class="menu-item" @click=${() => this._goSubView('venus')}>
            <div class="menu-icon"><ha-icon icon="mdi:battery-charging-high"></ha-icon> ${this._localize('editor.venus_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        
        <div class="menu-item" @click=${() => this._goSubView('bkw')}>
            <div class="menu-icon"><ha-icon icon="mdi:solar-panel"></ha-icon> ${this._localize('editor.bkw_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <div class="menu-item" @click=${() => this._goSubView('consumer_1')}>
            <div class="menu-icon"><ha-icon icon="${this._consumerMenuIcon(1)}"></ha-icon> ${this._consumerMenuLabel(1)}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        
        <div class="menu-item" @click=${() => this._goSubView('consumer_2')}>
            <div class="menu-icon"><ha-icon icon="${this._consumerMenuIcon(2)}"></ha-icon> ${this._consumerMenuLabel(2)}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        
        <div class="menu-item" @click=${() => this._goSubView('consumer_3')}>
            <div class="menu-icon"><ha-icon icon="${this._consumerMenuIcon(3)}"></ha-icon> ${this._consumerMenuLabel(3)}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        
        <div class="menu-item" @click=${() => this._goSubView('consumer_4')}>
            <div class="menu-icon"><ha-icon icon="${this._consumerMenuIcon(4)}"></ha-icon> ${this._consumerMenuLabel(4)}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        
        <div class="menu-item" @click=${() => this._goSubView('consumer_5')}>
            <div class="menu-icon"><ha-icon icon="${this._consumerMenuIcon(5)}"></ha-icon> ${this._consumerMenuLabel(5)}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        
        <div class="menu-item" @click=${() => this._goSubView('consumer_6')}>
            <div class="menu-icon"><ha-icon icon="${this._consumerMenuIcon(6)}"></ha-icon> ${this._consumerMenuLabel(6)}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        
        <div class="menu-item" @click=${() => this._goSubView('consumer_7')}>
            <div class="menu-icon"><ha-icon icon="${this._consumerMenuIcon(7)}"></ha-icon> ${this._consumerMenuLabel(7)}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>
        
        <div class="menu-item" @click=${() => this._goSubView('consumers')}>
            <div class="menu-icon"><ha-icon icon="mdi:home"></ha-icon> ${this._localize('editor.consumers_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <div class="menu-item" @click=${() => this._goSubView('donut')}>
            <div class="menu-icon"><ha-icon icon="mdi:chart-donut"></ha-icon> ${this._localize('editor.donut_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <div class="menu-item" @click=${() => this._goSubView('temp')}>
            <div class="menu-icon"><ha-icon icon="mdi:thermometer"></ha-icon> ${this._localize('editor.temp_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <div class="menu-item" @click=${() => this._goSubView('power')}>
            <div class="menu-icon"><ha-icon icon="mdi:card-text-outline"></ha-icon> ${this._localize('editor.power_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <div class="section-title">${this._localize('editor.options_section')}</div>

        <div class="menu-item" @click=${() => this._goSubView('side_panels')}>
            <div class="menu-icon"><ha-icon icon="mdi:view-split-vertical"></ha-icon> ${this._localize('editor.side_panels_section')}</div>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
        </div>

        <!-- Group: Sizing & position -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:resize"></ha-icon>
                ${this._localize('editor.group_sizing')}
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0.5, max: 2.0, step: 0.05, mode: "slider" } }}
                    .value=${this._config.zoom !== undefined ? this._config.zoom : 0.9}
                    .configValue=${'zoom'}
                    .label=${this._localize('editor.zoom_label')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 70, max: 130, step: 2, mode: "slider" } }}
                    .value=${this._config.bubble_size !== undefined ? this._config.bubble_size : 90}
                    .configValue=${'bubble_size'}
                    .label=${this._localize('editor.bubble_size')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 8, max: 20, step: 1, mode: "slider" } }}
                    .value=${this._config.pipe_label_size !== undefined ? this._config.pipe_label_size : 10}
                    .configValue=${'pipe_label_size'}
                    .label=${this._localize('editor.pipe_label_size')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                    .value=${this._config.card_offset_x !== undefined ? this._config.card_offset_x : 0}
                    .configValue=${'card_offset_x'}
                    .label=${this._localize('editor.card_offset_x')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: -100, max: 100, step: 1, mode: "slider" } }}
                    .value=${this._config.card_offset_y !== undefined ? this._config.card_offset_y : 0}
                    .configValue=${'card_offset_y'}
                    .label=${this._localize('editor.card_offset_y')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 4px; margin-top: 12px;">
                ${this._localize('editor.background_padding_section')}
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                    .value=${this._config.background_padding_top !== undefined ? this._config.background_padding_top : 0}
                    .configValue=${'background_padding_top'}
                    .label=${this._localize('editor.background_padding_top')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                    .value=${this._config.background_padding_bottom !== undefined ? this._config.background_padding_bottom : 0}
                    .configValue=${'background_padding_bottom'}
                    .label=${this._localize('editor.background_padding_bottom')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                    .value=${this._config.background_padding_left !== undefined ? this._config.background_padding_left : 0}
                    .configValue=${'background_padding_left'}
                    .label=${this._localize('editor.background_padding_left')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 200, step: 1, mode: "slider" } }}
                    .value=${this._config.background_padding_right !== undefined ? this._config.background_padding_right : 0}
                    .configValue=${'background_padding_right'}
                    .label=${this._localize('editor.background_padding_right')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
        </div>

        <!-- Group: Appearance / visual effects -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:palette"></ha-icon>
                ${this._localize('editor.group_appearance')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_neon_glow !== false}
                    .configValue=${'show_neon_glow'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.neon_glow')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_donut_border === true}
                    .configValue=${'show_donut_border'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.donut_chart')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_comet_tail === true}
                    .configValue=${'show_comet_tail'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.comet_tail')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_dashed_line === true}
                    .configValue=${'show_dashed_line'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.dashed_line')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_tinted_background === true}
                    .configValue=${'show_tinted_background'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.tinted_background')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.use_colored_values === true}
                    .configValue=${'use_colored_values'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.colored_values')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.always_color_bubbles === true}
                    .configValue=${'always_color_bubbles'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.always_color_bubbles')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.transparent_background === true}
                    .configValue=${'transparent_background'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.transparent_background')}</div>
            </div>
        </div>

        <!-- Group: Display behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:eye"></ha-icon>
                ${this._localize('editor.group_display')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.hide_consumer_icons === true}
                    .configValue=${'hide_consumer_icons'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.hide_consumer_icons')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.hide_inactive_flows !== false}
                    .configValue=${'hide_inactive_flows'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.hide_inactive')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.show_consumer_always === true}
                    .configValue=${'show_consumer_always'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.show_consumer_always')}</div>
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.side_panels_enabled === true}
                    .configValue=${'side_panels_enabled'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.side_panels_enabled')}</div>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 2, max: 60, step: 1, mode: "slider" } }}
                    .value=${this._config.rotation_interval_sec !== undefined ? this._config.rotation_interval_sec : 10}
                    .configValue=${'rotation_interval_sec'}
                    .label=${this._localize('editor.rotation_interval_sec')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>
        </div>

        <!-- Group: Background animation -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:animation-play"></ha-icon>
                ${this._localize('editor.group_bg_anim')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.bg_anim_hint')}
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ select: { mode: "dropdown", options: [
                        { value: "off", label: this._localize('editor.bg_anim_off') },
                        { value: "aurora", label: this._localize('editor.bg_anim_aurora') },
                        { value: "flow", label: this._localize('editor.bg_anim_flow') }
                    ] } }}
                    .value=${this._config.bg_anim_style || 'off'}
                    .configValue=${'bg_anim_style'}
                    .label=${this._localize('editor.bg_anim_style')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 5, max: 120, step: 1, mode: "slider" } }}
                    .value=${this._config.bg_anim_duration_sec !== undefined ? this._config.bg_anim_duration_sec : 30}
                    .configValue=${'bg_anim_duration_sec'}
                    .label=${this._localize('editor.bg_anim_duration')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0, max: 0.3, step: 0.01, mode: "slider" } }}
                    .value=${this._config.bg_anim_intensity !== undefined ? this._config.bg_anim_intensity : 0.1}
                    .configValue=${'bg_anim_intensity'}
                    .label=${this._localize('editor.bg_anim_intensity')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div>
                <ha-selector
                    .hass=${this.hass}
                    .selector=${{ number: { min: 0.5, max: 1.5, step: 0.05, mode: "slider" } }}
                    .value=${this._config.bg_anim_saturate !== undefined ? this._config.bg_anim_saturate : 1}
                    .configValue=${'bg_anim_saturate'}
                    .label=${this._localize('editor.bg_anim_saturate')}
                    @value-changed=${this._valueChanged}
                ></ha-selector>
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 4px; margin-top: 12px;">
                ${this._localize('editor.bg_anim_colors')}
            </div>
            ${this._renderColorPicker('bg_color_1', this._localize('editor.bg_color_1'), '#ffdd00')}
            ${this._renderColorPicker('bg_color_2', this._localize('editor.bg_color_2'), '#ff0040')}
            ${this._renderColorPicker('bg_color_3', this._localize('editor.bg_color_3'), '#e100ff')}
            ${this._renderColorPicker('bg_color_4', this._localize('editor.bg_color_4'), '#8d07d5')}
        </div>

        <!-- Group: Debug & test -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:bug-outline"></ha-icon>
                ${this._localize('editor.group_debug')}
            </div>

            <div class="switch-row">
                <ha-switch
                    .checked=${this._config.demo_mode === true}
                    .configValue=${'demo_mode'}
                    @change=${this._valueChanged}
                ></ha-switch>
                <div class="switch-label">${this._localize('editor.demo_mode')}</div>
            </div>
        </div>

      </div>
    `;
    }
}

customElements.define("power-flux-card-editor", PowerFluxCardEditor);
