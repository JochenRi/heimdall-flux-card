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

// ---------------------------------------------------------------------------
// Phase editor-3: narrowing the entity pickers.
//
// A picker that offers all two thousand entities is not a choice, it is a
// search task. Home Assistant can filter by device_class, so a power field can
// offer power sensors only.
//
// But only where the classification is reliable. Measured on the live system:
// power sensors and state-of-charge sensors carry device_class without
// exception, while forecast and percentage sensors (evcc_solar_forecast_heute,
// heimdall_v2_autarkie_heute) carry none at all. Filtering those would HIDE
// the very sensors the field wants -- worse than no filter. So the table below
// covers the fields where the answer is certain and leaves the rest open; the
// suggestion button does the work there instead.
// ---------------------------------------------------------------------------

const ENTITY_FIELD_KINDS = (() => {
    const kinds = {};
    const power = ['solar', 'grid', 'grid_export', 'grid_combined', 'battery',
        'battery_charge', 'battery_discharge', 'grid_to_battery', 'venus',
        'venus_charge', 'venus_discharge', 'venus_pv_charge', 'house', 'bkw'];
    for (let i = 1; i <= 7; i++) power.push(`consumer_${i}`);
    for (const k of power) kinds[k] = 'power';
    for (const k of ['battery_soc', 'venus_soc']) kinds[k] = 'battery';
    for (const k of ['temp_indoor', 'temp_outdoor', 'temp_forecast_high',
                     'temp_forecast_low']) kinds[k] = 'temperature';
    return kinds;
})();

const ENTITY_FILTERS = {
    power: [{ domain: 'sensor', device_class: 'power' }, { domain: 'input_number' }],
    battery: [{ domain: 'sensor', device_class: 'battery' }, { domain: 'input_number' }],
    temperature: [{ domain: 'sensor', device_class: 'temperature' }, { domain: 'input_number' }],
};

// What a matching entity is likely to be called -- by ROLE, not by brand.
//
// The first version listed manufacturer names (marstek, lg, resu). That worked
// on the system it was written for and nowhere else. These are role words in
// German and English instead; no vendor has to appear in a list to be found.
//
// strong: all but names the sensor. weak: supporting evidence.
const ENTITY_NAME_HINTS = {
    solar:       { strong: ['dach', 'roof'], weak: ['pv', 'solar', 'panel', 'erzeugung', 'production', 'wr', 'inverter'] },
    grid:        { strong: ['netz', 'grid'], weak: ['meter', 'zaehler', 'zahler', 'bezug', 'import'] },
    grid_export: { strong: ['einspeisung', 'export'], weak: ['netz', 'grid', 'feed'] },
    grid_combined: { strong: ['netz', 'grid', 'saldo'], weak: ['meter', 'zaehler', 'zahler', 'balance'] },
    grid_to_battery: { strong: ['netz', 'grid'], weak: ['lade', 'charge', 'batt', 'akku', 'speicher'] },
    battery:     { strong: ['speicher', 'batt', 'akku', 'storage'], weak: ['dc', 'hausspeicher', 'home'] },
    battery_soc: { strong: ['soc', 'ladestand'], weak: ['speicher', 'batt', 'akku', 'storage', 'charge'] },
    battery_charge:    { strong: ['lade', 'charge'], weak: ['speicher', 'batt', 'akku', 'storage'] },
    battery_discharge: { strong: ['entlade', 'discharge'], weak: ['speicher', 'batt', 'akku', 'storage'] },
    venus:       { strong: ['speicher', 'batt', 'akku', 'storage'], weak: ['ac', 'balkon', 'zweit'] },
    venus_soc:   { strong: ['soc', 'ladestand'], weak: ['speicher', 'batt', 'akku', 'storage'] },
    venus_charge:    { strong: ['lade', 'charge'], weak: ['speicher', 'batt', 'akku', 'storage'] },
    venus_discharge: { strong: ['entlade', 'discharge'], weak: ['speicher', 'batt', 'akku', 'storage'] },
    venus_pv_charge: { strong: ['mppt'], weak: ['pv', 'solar', 'lade', 'charge'] },
    house:       { strong: ['haus', 'house', 'hausverbrauch'], weak: ['verbrauch', 'consumption', 'gesamt', 'total', 'home'] },
    bkw:         { strong: ['balkon', 'bkw', 'garten'], weak: ['pv', 'solar', 'mppt', 'micro'] },
    temp_indoor:  { strong: ['innen', 'indoor'], weak: ['haus', 'raum', 'room', 'durchschnitt'] },
    temp_outdoor: { strong: ['aussen', 'outdoor', 'outside'], weak: ['garten', 'wetter', 'weather'] },
    temp_forecast_high: { strong: ['forecast', 'high'], weak: ['max', 'hoch', 'prognose'] },
    temp_forecast_low:  { strong: ['forecast', 'low'], weak: ['min', 'tief', 'prognose'] },
};

// Energy fields (kWh counters behind the donuts, mix rings and rotation
// slots). Same machinery, device_class energy instead of power.
const ENERGY_FIELD_HINTS = {
    strongByRole: {
        solar: ['pv', 'solar', 'dach', 'roof', 'erzeugung', 'production'],
        battery: ['speicher', 'batt', 'akku', 'storage'],
        venus: ['speicher', 'batt', 'akku', 'storage'],
        grid: ['netz', 'grid', 'bezug', 'import'],
        export: ['einspeisung', 'export', 'feed'],
        import: ['bezug', 'import', 'netz', 'grid'],
        house: ['haus', 'house', 'verbrauch', 'consumption'],
        lg: ['speicher', 'batt', 'akku', 'storage'],
        self: ['eigen', 'self', 'direkt'],
        bkw: ['balkon', 'bkw', 'garten'],
    },
    period: { day: ['heute', 'today', 'daily', 'tag'],
              month: ['monat', 'month', 'monthly'],
              year: ['jahr', 'year', 'yearly'] },
};

// A car, a wallbox and a dehumidifier all report a charge level, and their
// devices carry one too -- so both the name hints and the device signal would
// happily offer a vehicle for the house battery. Role words, no brands.
const NON_STATIONARY_WORDS = [
    'vehicle', 'fahrzeug', 'auto', 'car', 'wallbox', 'charger', 'ladepunkt',
    'loadpoint', 'ladegeraet', 'ladegerat', 'mobile',
];

// Words that make a sensor a poor answer for a whole-house field: derived
// values, per-phase splits, device batteries. A field keeps any of these that
// its own hint list needs -- the forecast temperature fields want "forecast".
const ENTITY_NAME_PENALTIES = [
    'forecast', 'prognose', 'erwartung', 'ziel', 'now', 'max', 'peak', 'phase',
    'schein', 'apparent', 'melder', 'button', 'bthome', 'pixel', 'link',
    'signal', 'uptime', 'rate', 'handy', 'phone', '5min', 'mittel', 'average',
    'invertiert', 'inverted', 'gradient', 'lifetime',
];

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
    battery: {
        label: true,
        icon: true,
        enabled: { key: 'battery_enabled', def: true, labelKey: 'storage_enabled' },
        showLabel: { key: 'show_label_battery', def: false },
        unitKw: { key: 'battery_unit_kw', def: false },
        showFlowRate: { key: 'show_flow_rate_battery', def: true },
        invert: true,
        showPower: true,
        chargeViaHouse: true,
        hideSolarPipe: { key: 'hide_solar_to_battery_pipe' },
        animationThreshold: { key: 'battery_animation_threshold', max: 200, def: 1 },
        labelOffsets: { targets: [''], range: 100, labels: 'bubble' },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: true,
        mix: { toggleKey: 'battery_mix_donut_mode', toggleDef: false,
               periodDef: 'day', gapDef: 8, gapMax: 30,
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15 },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h', testMode: true },
    },
    venus: {
        label: true,
        icon: true,
        enabled: { key: 'venus_enabled', def: true, labelKey: 'storage_enabled' },
        showLabel: { key: 'show_label_venus', def: false },
        unitKw: { key: 'venus_unit_kw', def: false },
        showFlowRate: { key: 'show_flow_rate_venus', def: true },
        invert: true,
        showPower: true,
        chargeViaHouse: true,
        hideSolarPipe: { key: 'hide_solar_to_venus_pipe' },
        animationThreshold: { key: 'venus_animation_threshold', max: 200, def: 1 },
        labelOffsets: { targets: [''], range: 100, labels: 'bubble' },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: true,
        mix: { toggleKey: 'venus_mix_donut_mode', toggleDef: false,
               periodDef: 'day', gapDef: 8, gapMax: 30,
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15 },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h', testMode: true },
    },
    house: {
        label: true,
        icon: true,
        showLabel: { key: 'show_label_house', def: false },
        // No rotation: _getBubbleRotationDisplay is never called with 'house'.
        // No unit switch, no offsets, no threshold -- the house bubble sits in
        // the centre and has none of those.
        donutToday: { toggleKey: 'donut_today_mode', toggleDef: false,
                      labelKey: 'donut_today_mode',
                      entities: ['donut_today_solar', 'donut_today_battery',
                                 'donut_today_venus', 'donut_today_grid'] },
        mix: { toggleKey: 'house_mix_donut_mode', toggleDef: false,
               periodDef: 'day', gapDef: 8, gapMax: 30,
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15 },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h', testMode: true },
    },
    consumer_1: {
        label: true,
        icon: true,
        enabled: { key: 'consumer_1_enabled', def: true, labelKey: 'consumer_enabled' },
        // Off by default here, unlike the source bubbles: the card reads it
        // with === true, so a consumer pipe stays unlabelled until asked.
        showFlowRate: { key: 'show_flow_rate_consumer_1', def: false,
                        labelKey: 'consumer_show_flow_rate' },
        unitKw: { key: 'consumer_1_unit_kw', def: false, labelKey: 'consumer_unit_kw' },
        invert: { labelKey: 'invert_consumer' },
        showPower: { def: true, labelKey: 'consumer_show_power' },
        hidePipe: true,
        pipeThreshold: true,
        animationThreshold: { key: 'consumer_1_animation_threshold', max: 200, def: 0,
                              labelKey: 'consumer_animation_threshold' },
        labelOffsets: { targets: [''], range: 100, labels: 'consumer', defaults: { y: -25 } },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: { max: 100, labelKey: 'consumer_1_soc_donut_enable',
                    maxLabelKey: 'consumer_1_soc_max' },
        mix: { toggleKey: 'consumer_1_mix_donut_mode', toggleDef: false,
               labelKey: 'consumer_1_mix_enable',
               // The consumer ring uses its own key names and shares consumer_1's
               // labels -- all seven show the same words for the same control.
               ringNames: true,
               periodDef: 'day', periodLabelKey: 'consumer_1_mix_period',
               periodOptionPrefix: 'consumer_1_mix_period_',
               gapDef: 8, gapMax: 30, gapLabelKey: 'consumer_1_mix_ring_gap',
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15,
               thicknessLabelKey: 'consumer_1_mix_ring_thickness' },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h',
                     testMode: true, debug: true },
    },
    consumer_2: {
        label: true,
        icon: true,
        enabled: { key: 'consumer_2_enabled', def: true, labelKey: 'consumer_enabled' },
        // Off by default here, unlike the source bubbles: the card reads it
        // with === true, so a consumer pipe stays unlabelled until asked.
        showFlowRate: { key: 'show_flow_rate_consumer_2', def: false,
                        labelKey: 'consumer_show_flow_rate' },
        unitKw: { key: 'consumer_2_unit_kw', def: false, labelKey: 'consumer_unit_kw' },
        invert: { labelKey: 'invert_consumer' },
        showPower: { def: true, labelKey: 'consumer_show_power' },
        hidePipe: true,
        pipeThreshold: true,
        animationThreshold: { key: 'consumer_2_animation_threshold', max: 200, def: 0,
                              labelKey: 'consumer_animation_threshold' },
        labelOffsets: { targets: [''], range: 100, labels: 'consumer', defaults: { y: -25 } },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: { max: 5, labelKey: 'consumer_2_soc_donut_enable',
                    maxLabelKey: 'consumer_2_soc_max' },
        mix: { toggleKey: 'consumer_2_mix_donut_mode', toggleDef: false,
               labelKey: 'consumer_2_mix_enable',
               // The consumer ring uses its own key names and shares consumer_1's
               // labels -- all seven show the same words for the same control.
               ringNames: true,
               periodDef: 'day', periodLabelKey: 'consumer_1_mix_period',
               periodOptionPrefix: 'consumer_1_mix_period_',
               gapDef: 8, gapMax: 30, gapLabelKey: 'consumer_1_mix_ring_gap',
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15,
               thicknessLabelKey: 'consumer_1_mix_ring_thickness' },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h',
                     testMode: true, debug: true },
    },
    consumer_3: {
        label: true,
        icon: true,
        enabled: { key: 'consumer_3_enabled', def: true, labelKey: 'consumer_enabled' },
        // Off by default here, unlike the source bubbles: the card reads it
        // with === true, so a consumer pipe stays unlabelled until asked.
        showFlowRate: { key: 'show_flow_rate_consumer_3', def: false,
                        labelKey: 'consumer_show_flow_rate' },
        unitKw: { key: 'consumer_3_unit_kw', def: false, labelKey: 'consumer_unit_kw' },
        invert: { labelKey: 'invert_consumer' },
        showPower: { def: true, labelKey: 'consumer_show_power' },
        hidePipe: true,
        pipeThreshold: true,
        animationThreshold: { key: 'consumer_3_animation_threshold', max: 200, def: 0,
                              labelKey: 'consumer_animation_threshold' },
        labelOffsets: { targets: [''], range: 100, labels: 'consumer', defaults: { y: -25 } },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: { max: 5, labelKey: 'consumer_3_soc_donut_enable',
                    maxLabelKey: 'consumer_3_soc_max' },
        mix: { toggleKey: 'consumer_3_mix_donut_mode', toggleDef: false,
               labelKey: 'consumer_3_mix_enable',
               // The consumer ring uses its own key names and shares consumer_1's
               // labels -- all seven show the same words for the same control.
               ringNames: true,
               periodDef: 'day', periodLabelKey: 'consumer_1_mix_period',
               periodOptionPrefix: 'consumer_1_mix_period_',
               gapDef: 8, gapMax: 30, gapLabelKey: 'consumer_1_mix_ring_gap',
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15,
               thicknessLabelKey: 'consumer_1_mix_ring_thickness' },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h',
                     testMode: true, debug: true },
    },
    consumer_4: {
        label: true,
        icon: true,
        enabled: { key: 'consumer_4_enabled', def: true, labelKey: 'consumer_enabled' },
        // Off by default here, unlike the source bubbles: the card reads it
        // with === true, so a consumer pipe stays unlabelled until asked.
        showFlowRate: { key: 'show_flow_rate_consumer_4', def: false,
                        labelKey: 'consumer_show_flow_rate' },
        unitKw: { key: 'consumer_4_unit_kw', def: false, labelKey: 'consumer_unit_kw' },
        invert: { labelKey: 'invert_consumer' },
        showPower: { def: true, labelKey: 'consumer_show_power' },
        hidePipe: true,
        pipeThreshold: true,
        animationThreshold: { key: 'consumer_4_animation_threshold', max: 200, def: 0,
                              labelKey: 'consumer_animation_threshold' },
        labelOffsets: { targets: [''], range: 100, labels: 'consumer', defaults: { y: -25 } },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: { max: 5, labelKey: 'consumer_4_soc_donut_enable',
                    maxLabelKey: 'consumer_4_soc_max' },
        mix: { toggleKey: 'consumer_4_mix_donut_mode', toggleDef: false,
               labelKey: 'consumer_4_mix_enable',
               // The consumer ring uses its own key names and shares consumer_1's
               // labels -- all seven show the same words for the same control.
               ringNames: true,
               periodDef: 'day', periodLabelKey: 'consumer_1_mix_period',
               periodOptionPrefix: 'consumer_1_mix_period_',
               gapDef: 8, gapMax: 30, gapLabelKey: 'consumer_1_mix_ring_gap',
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15,
               thicknessLabelKey: 'consumer_1_mix_ring_thickness' },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h',
                     testMode: true, debug: true },
    },
    consumer_5: {
        label: true,
        icon: true,
        enabled: { key: 'consumer_5_enabled', def: true, labelKey: 'consumer_enabled' },
        // Off by default here, unlike the source bubbles: the card reads it
        // with === true, so a consumer pipe stays unlabelled until asked.
        showFlowRate: { key: 'show_flow_rate_consumer_5', def: false,
                        labelKey: 'consumer_show_flow_rate' },
        unitKw: { key: 'consumer_5_unit_kw', def: false, labelKey: 'consumer_unit_kw' },
        invert: { labelKey: 'invert_consumer' },
        showPower: { def: true, labelKey: 'consumer_show_power' },
        hidePipe: true,
        pipeThreshold: true,
        animationThreshold: { key: 'consumer_5_animation_threshold', max: 200, def: 0,
                              labelKey: 'consumer_animation_threshold' },
        labelOffsets: { targets: [''], range: 100, labels: 'consumer', defaults: { y: -25 } },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: { max: 65, labelKey: 'consumer_5_soc_donut_enable',
                    maxLabelKey: 'consumer_5_soc_max' },
        mix: { toggleKey: 'consumer_5_mix_donut_mode', toggleDef: false,
               labelKey: 'consumer_5_mix_enable',
               // The consumer ring uses its own key names and shares consumer_1's
               // labels -- all seven show the same words for the same control.
               ringNames: true,
               periodDef: 'day', periodLabelKey: 'consumer_1_mix_period',
               periodOptionPrefix: 'consumer_1_mix_period_',
               gapDef: 8, gapMax: 30, gapLabelKey: 'consumer_1_mix_ring_gap',
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15,
               thicknessLabelKey: 'consumer_1_mix_ring_thickness' },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h',
                     testMode: true, debug: true },
    },
    consumer_6: {
        label: true,
        icon: true,
        enabled: { key: 'consumer_6_enabled', def: true, labelKey: 'consumer_enabled' },
        // Off by default here, unlike the source bubbles: the card reads it
        // with === true, so a consumer pipe stays unlabelled until asked.
        showFlowRate: { key: 'show_flow_rate_consumer_6', def: false,
                        labelKey: 'consumer_show_flow_rate' },
        unitKw: { key: 'consumer_6_unit_kw', def: false, labelKey: 'consumer_unit_kw' },
        invert: { labelKey: 'invert_consumer' },
        showPower: { def: true, labelKey: 'consumer_show_power' },
        hidePipe: true,
        pipeThreshold: true,
        animationThreshold: { key: 'consumer_6_animation_threshold', max: 200, def: 0,
                              labelKey: 'consumer_animation_threshold' },
        labelOffsets: { targets: [''], range: 100, labels: 'consumer', defaults: { y: -25 } },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: { max: 30, labelKey: 'consumer_6_soc_donut_enable',
                    maxLabelKey: 'consumer_6_soc_max' },
        mix: { toggleKey: 'consumer_6_mix_donut_mode', toggleDef: false,
               labelKey: 'consumer_6_mix_enable',
               // The consumer ring uses its own key names and shares consumer_1's
               // labels -- all seven show the same words for the same control.
               ringNames: true,
               periodDef: 'day', periodLabelKey: 'consumer_1_mix_period',
               periodOptionPrefix: 'consumer_1_mix_period_',
               gapDef: 8, gapMax: 30, gapLabelKey: 'consumer_1_mix_ring_gap',
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15,
               thicknessLabelKey: 'consumer_1_mix_ring_thickness' },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h',
                     testMode: true, debug: true },
    },
    consumer_7: {
        label: true,
        icon: true,
        enabled: { key: 'consumer_7_enabled', def: true, labelKey: 'consumer_enabled' },
        // Off by default here, unlike the source bubbles: the card reads it
        // with === true, so a consumer pipe stays unlabelled until asked.
        showFlowRate: { key: 'show_flow_rate_consumer_7', def: false,
                        labelKey: 'consumer_show_flow_rate' },
        unitKw: { key: 'consumer_7_unit_kw', def: false, labelKey: 'consumer_unit_kw' },
        invert: { labelKey: 'invert_consumer' },
        showPower: { def: true, labelKey: 'consumer_show_power' },
        hidePipe: true,
        pipeThreshold: true,
        animationThreshold: { key: 'consumer_7_animation_threshold', max: 200, def: 0,
                              labelKey: 'consumer_animation_threshold' },
        labelOffsets: { targets: [''], range: 100, labels: 'consumer', defaults: { y: -25 } },
        rotation: { slots: 3, showLiveDef: true },
        socDonut: { max: 165, labelKey: 'consumer_7_soc_donut_enable',
                    maxLabelKey: 'consumer_7_soc_max' },
        mix: { toggleKey: 'consumer_7_mix_donut_mode', toggleDef: false,
               labelKey: 'consumer_7_mix_enable',
               // The consumer ring uses its own key names and shares consumer_1's
               // labels -- all seven show the same words for the same control.
               ringNames: true,
               periodDef: 'day', periodLabelKey: 'consumer_1_mix_period',
               periodOptionPrefix: 'consumer_1_mix_period_',
               gapDef: 8, gapMax: 30, gapLabelKey: 'consumer_1_mix_ring_gap',
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15,
               thicknessLabelKey: 'consumer_1_mix_ring_thickness' },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h',
                     testMode: true, debug: true },
    },
    // Phase editor-9: the climate tile. Two mirrored halves -- indoor and
    // outdoor, identical but for the prefix -- so both are generated from the
    // same sparkline definition. No label, no icon, no rotation, no mix ring:
    // it is a thermometer panel, not a bubble.
    temp_indoor: {
        sparkline: { opacityDef: 0.35, styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h' },
    },
    temp_outdoor: {
        sparkline: { opacityDef: 0.35, styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h' },
    },
    temp: {
        enabled: { key: 'temp_enabled', def: false, labelKey: 'temp_enabled' },
        // Wider range than the bubbles: this tile is moved across the whole
        // card, not nudged within one.
        labelOffsets: { targets: [''], range: 300, labels: 'temp',
                        keyStem: 'offset', defaults: { x: 0, y: 0 } },
        // Phase temp-body: what the lower two thirds carry.
        bodyToggles: [
            ['temp_body_mix_consumer_1', true, 'temp_body_mix_consumer_1'],
            ['temp_body_mix_consumer_5', true, 'temp_body_mix_consumer_5'],
        ],
        scales: [
            ['temp_outdoor_min', -10, -40, 20],
            ['temp_outdoor_max', 40, 20, 60],
            ['temp_indoor_min', 10, 0, 20],
            ['temp_indoor_max', 30, 20, 40],
        ],
    },
    grid: {
        label: true,
        icon: true,
        showLabel: { key: 'show_label_grid', def: false },
        unitKw: { key: 'grid_unit_kw', def: false },
        showFlowRate: { key: 'show_flow_rate_grid', def: true },
        animationThreshold: { key: 'grid_animation_threshold', max: 200, def: 1 },
        // '' yields grid_label_offset_x -- one pair, unlike solar's two.
        labelOffsets: { targets: [''], range: 100, labels: 'bubble' },
        rotation: { slots: 3, showLiveDef: true },
        donutToday: { toggleKey: 'grid_donut_today_mode', toggleDef: false,
                      entities: ['grid_donut_import_today', 'grid_donut_export_today'] },
        mix: { toggleKey: 'grid_mix_donut_mode', toggleDef: false,
               periodDef: 'day', gapDef: 8, gapMax: 30,
               thicknessDef: 4, thicknessMin: 1, thicknessMax: 15 },
        sparkline: { opacityDef: 0.35, layerDef: 'back', styleDef: 'area-line',
                     periods: SPARKLINE_PERIODS, periodDef: '24h', testMode: true },
    },
};

// The main view is not a bubble -- it holds the card-wide switches and
// sliders. Same machinery, its own list. Three keys the card has always read
// and no editor copy ever offered are included: show_flow_rates and
// animation_threshold (only the per-bubble variants existed) and
// show_label_house (every other source bubble had a label toggle).
const GLOBAL_FIELDS = {
    sizing: [
        ['zoom', 0.9, 'zoom_label', [0.5, 2, 0.05]],
        ['bubble_size', 90, 'bubble_size', [70, 130, 2]],
        ['pipe_label_size', 10, 'pipe_label_size', [8, 20, 1]],
        ['card_offset_x', 0, 'card_offset_x', [-100, 100, 1]],
        ['card_offset_y', 0, 'card_offset_y', [-100, 100, 1]],
        ['background_padding_top', 0, 'background_padding_top', [0, 200, 1]],
        ['background_padding_bottom', 0, 'background_padding_bottom', [0, 200, 1]],
        ['background_padding_left', 0, 'background_padding_left', [0, 200, 1]],
        ['background_padding_right', 0, 'background_padding_right', [0, 200, 1]],
    ],
    appearance: [
        ['show_neon_glow', true, 'neon_glow'],
        ['show_donut_border', false, 'donut_chart'],
        ['show_comet_tail', false, 'comet_tail'],
        ['show_dashed_line', false, 'dashed_line'],
        ['show_tinted_background', false, 'tinted_background'],
        ['use_colored_values', false, 'colored_values'],
        ['always_color_bubbles', false, 'always_color_bubbles'],
        ['transparent_background', false, 'transparent_background'],
    ],
    display: [
        ['hide_consumer_icons', false, 'hide_consumer_icons'],
        ['hide_inactive_flows', true, 'hide_inactive'],
        ['show_consumer_always', false, 'show_consumer_always'],
        // Card-wide flow-rate toggle. The card has always read it; only the
        // per-bubble variants were ever offered.
        ['show_flow_rates', true, 'show_flow_rates'],
        // Card-wide animation threshold, likewise -- only the per-consumer
        // variant existed in the editor.
        ['animation_threshold', 1, 'global_animation_threshold', [0, 200, 1]],
        ['side_panels_enabled', false, 'side_panels_enabled'],
        ['rotation_interval_sec', 10, 'rotation_interval_sec', [2, 60, 1]],
    ],
    debug: [
        ['demo_mode', false, 'demo_mode'],
    ],
    // Phase portals-1: rings where a pipe passes under a tile. Position is
    // computed from the tile's own anchor and offsets, so moving a tile moves
    // its portals. The offsets here are a correction, not the mechanism --
    // they exist so a crossing that lands badly can be nudged without waiting
    // for a code change.
    portals: [
        ['portals_enabled', true, 'portals_enabled'],
        ['portal_size', 13, 'portal_size', [4, 40, 1]],
        ['portal_gap', 14, 'portal_gap', [0, 60, 1]],
        ['temp_portal_offset_x', 0, 'temp_portal_offset_x', [-150, 150, 1]],
        ['temp_portal_offset_y', 0, 'temp_portal_offset_y', [-150, 150, 1]],
        ['power_portal_offset_x', 0, 'power_portal_offset_x', [-150, 150, 1]],
        ['power_portal_offset_y', 0, 'power_portal_offset_y', [-150, 150, 1]],
    ],
    panels: [
        ['side_panels_enabled', false, 'side_panels_enabled'],
        ['side_panel_width', 320, 'side_panel_width', [150, 500, 10]],
        // The slider stops at 120 on purpose: bubble size depends on the sum of
        // panel width and gap, so a larger gap shrinks the whole card. A YAML
        // value above 120 is silently clamped the next time this is touched.
        ['side_panel_gap', 40, 'side_panel_gap', [0, 120, 4]],
    ],
};

// ---------------------------------------------------------------------------
// Phase editor-7: layout and guidance.
//
// Three rules, applied once here and inherited by every section:
//
//   A. Arrangement -- x/y pairs sit side by side, switches run two columns.
//      ha-form's grid container does this and was never used. On a dialog Home
//      Assistant keeps at roughly half the screen width (a years-old open
//      request on the frontend, not something a card can change), using the
//      width that IS there is the only lever available.
//
//   B. Grouping -- more than six fields in a group become collapsible blocks.
//      What gets touched often stays open, fine adjustment folds away.
//
//   C. Guidance -- computeHelper, offered by ha-form and unused until now.
//      A helper is written only where the effect is not self-evident, and it
//      says what MORE does and what LESS does. Everywhere else it would be
//      noise, and noise is what makes people stop reading.
// ---------------------------------------------------------------------------

// Helper text per field, keyed by the suffix after the bubble prefix so one
// entry serves all twelve bubbles. Card-wide fields are keyed by full name.
const FIELD_HELP = {
    label_offset_x: 'help_offset_x',
    label_offset_y: 'help_offset_y',
    animation_threshold: 'help_animation_threshold',
    sparkline_opacity: 'help_sparkline_opacity',
    mix_gap: 'help_mix_gap',
    mix_thickness: 'help_mix_thickness',
    mix_ring_gap: 'help_mix_gap',
    mix_ring_thickness: 'help_mix_thickness',
    sparkline_period: 'help_sparkline_period',
    sparkline_layer: 'help_sparkline_layer',
    sparkline_test_mode: 'help_test_mode',
    soc_max: 'help_soc_max',
    pipe_threshold: 'help_pipe_threshold',
    unit_kw: 'help_unit_kw',
    zoom: 'help_zoom',
    bubble_size: 'help_bubble_size',
    pipe_label_size: 'help_pipe_label_size',
    card_offset_x: 'help_offset_x',
    card_offset_y: 'help_offset_y',
    background_padding_top: 'help_background_padding',
    background_padding_bottom: 'help_background_padding',
    background_padding_left: 'help_background_padding',
    background_padding_right: 'help_background_padding',
    rotation_interval_sec: 'help_rotation_interval',
    side_panel_width: 'help_side_panel_width',
    side_panel_gap: 'help_side_panel_gap',
    show_flow_rates: 'help_show_flow_rates',
    portals_enabled: 'help_portals_enabled',
    temp_body_mix_consumer_1: 'help_temp_body_mix',
    temp_body_mix_consumer_5: 'help_temp_body_mix',
    temp_offset_x: 'help_temp_offset',
    temp_offset_y: 'help_temp_offset',
    temp_outdoor_min: 'help_temp_scale_min',
    temp_indoor_min: 'help_temp_scale_min',
    temp_outdoor_max: 'help_temp_scale_max',
    temp_indoor_max: 'help_temp_scale_max',
    portal_size: 'help_portal_size',
    portal_gap: 'help_portal_gap',
    temp_portal_offset_x: 'help_portal_offset',
    temp_portal_offset_y: 'help_portal_offset',
    power_portal_offset_x: 'help_portal_offset',
    power_portal_offset_y: 'help_portal_offset',
    demo_mode: 'help_demo_mode',
    transparent_background: 'help_transparent_background',
};

// Look a field's helper up: exact name first, then the suffix after the
// bubble prefix, so battery_label_offset_x and consumer_3_label_offset_x share
// one entry.
const fieldHelpKey = (key) => {
    if (FIELD_HELP[key]) return FIELD_HELP[key];
    const parts = key.split('_');
    for (let i = 1; i < parts.length; i++) {
        const suffix = parts.slice(i).join('_');
        if (FIELD_HELP[suffix]) return FIELD_HELP[suffix];
    }
    return undefined;
};

// Wrap fields in a grid so they render side by side. minWidth decides how many
// columns fit -- narrow for number pairs, wider for switch labels.
const sideBySide = (fields, minWidth) => ({
    __grid: true, minWidth: minWidth || '160px', fields,
});

// Wrap fields in a collapsible block.
const collapsible = (titleKey, fields, expanded) => ({
    __panel: true, titleKey, fields, expanded: expanded === true,
});

const globalField = ([key, def, labelKey, range]) => (range
    ? { key, def, labelKey,
        selector: { number: { min: range[0], max: range[1], step: range[2], mode: 'slider' } } }
    : { key, def, labelKey, selector: { boolean: {} } });

// Rules A and B for the card-wide groups, where the scrolling was worst:
// sizing splits into three blocks, appearance and display run two columns.
const globalFields = (group) => {
    const list = (GLOBAL_FIELDS[group] || []).map(globalField);
    const pick = (...keys) => keys.map((k) => list.find((x) => x.key === k)).filter(Boolean);

    if (group === 'sizing') {
        return [
            collapsible('group_sizing_scale',
                pick('zoom', 'bubble_size', 'pipe_label_size'), true),
            collapsible('group_sizing_position',
                [sideBySide(pick('card_offset_x', 'card_offset_y'))]),
            collapsible('group_sizing_padding', [
                sideBySide(pick('background_padding_top', 'background_padding_bottom')),
                sideBySide(pick('background_padding_left', 'background_padding_right')),
            ]),
        ];
    }
    if (group === 'appearance') return [sideBySide(list, '240px')];
    if (group === 'display') {
        const sliders = pick('animation_threshold', 'rotation_interval_sec');
        const switches = list.filter((x) => !sliders.includes(x));
        return [sideBySide(switches, '240px'), ...sliders];
    }
    if (group === 'portals') {
        return [
            pick('portals_enabled')[0],
            sideBySide(pick('portal_size', 'portal_gap')),
            collapsible('group_portal_nudge', [
                sideBySide(pick('temp_portal_offset_x', 'temp_portal_offset_y')),
                sideBySide(pick('power_portal_offset_x', 'power_portal_offset_y')),
            ]),
        ].filter(Boolean);
    }
    if (group === 'panels') {
        const [enabled, ...rest] = list;
        return [enabled, sideBySide(rest, '180px')];
    }
    return list;
};

// Containers nest, but data, schema and the write whitelist all need the flat
// list of real fields. One walker, so the three can never see different sets.
const flattenFields = (items) => {
    const out = [];
    for (const item of items) {
        if (item && (item.__grid || item.__panel)) out.push(...flattenFields(item.fields));
        else out.push(item);
    }
    return out;
};

const bubbleFields = (prefix, group) => {
    if (prefix === '__global__') return globalFields(group);
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
        if (caps.enabled) bool(caps.enabled.key, caps.enabled.def,
            caps.enabled.labelKey || `${prefix}_enabled`);
        if (caps.showLabel) bool(caps.showLabel.key, caps.showLabel.def, 'label_toggle');
        if (caps.unitKw) bool(caps.unitKw.key, caps.unitKw.def,
            caps.unitKw.labelKey || `${prefix}_unit_kw`);
        if (caps.showFlowRate) bool(caps.showFlowRate.key, caps.showFlowRate.def,
            caps.showFlowRate.labelKey || 'flow_rate_title');
        // Storage-only switches, in the order the old markup had them.
        if (caps.invert) bool(`invert_${prefix}`, false,
            caps.invert.labelKey || `invert_${prefix}`);
        if (caps.showPower) bool(`${prefix}_show_power`, caps.showPower.def === true,
            caps.showPower.labelKey || `${prefix}_show_power`);
        if (caps.chargeViaHouse) bool(`${prefix}_charge_via_house`, false, `${prefix}_charge_via_house`);
        if (caps.hideSolarPipe) bool(caps.hideSolarPipe.key, false, 'hide_solar_arc');
        // Consumer-only switches and sliders.
        if (caps.hidePipe) bool(`${prefix}_hide_pipe`, false, 'consumer_hide_pipe');
        if (caps.pipeThreshold) num(`${prefix}_pipe_threshold`, 0, 0, 2000, 10,
            'consumer_pipe_threshold');
        if (caps.animationThreshold) {
            const a = caps.animationThreshold;
            num(a.key, a.def, 0, a.max, 1, a.labelKey || 'bubble_animation_threshold');
        }
    }

    // Scale ends for the two thermometer columns. Paired so min and max of one
    // column sit on a row -- they are only ever set together.
    if (group === 'body' && caps.bodyToggles) {
        f.push(sideBySide(caps.bodyToggles.map(([key, def, labelKey]) =>
            ({ key, def, labelKey, selector: { boolean: {} } })), '200px'));
    }

    if (group === 'scales' && caps.scales) {
        for (let i = 0; i < caps.scales.length; i += 2) {
            f.push(sideBySide(caps.scales.slice(i, i + 2).map(([key, def, min, max]) => ({
                key, def, labelKey: key,
                selector: { number: { min, max, step: 1, mode: 'slider' } },
            }))));
        }
    }

    if (group === 'soc' && caps.socDonut) {
        bool(`${prefix}_soc_donut_mode`, false,
            caps.socDonut.labelKey || `${prefix}_soc_donut_enabled`);
        // The one thing that genuinely differs across the seven consumers: what
        // "full" means. A charge level tops out at 100, a temperature at its
        // upper limit, a tank at its capacity.
        if (caps.socDonut.max !== undefined) {
            f.push({ key: `${prefix}_soc_max`, def: caps.socDonut.max,
                labelKey: caps.socDonut.maxLabelKey || `${prefix}_soc_max`,
                selector: { number: { min: 1, max: 1000, step: 1, mode: 'box' } } });
        }
    }

    if (group === 'offsets' && caps.labelOffsets) {
        const o = caps.labelOffsets;
        // Rule A: x and y belong together and are adjusted together, so they
        // sit on one row rather than stacked with a slider's width between.
        for (const target of o.targets) {
            const stem = target ? `${prefix}_${target}` : prefix;
            const stemKey = o.keyStem === 'offset' ? `${stem}_offset` : `${stem}_label_offset`;
            const pair = ['x', 'y'].map((axis) => ({
                key: `${stemKey}_${axis}`,
                def: (o.defaults && o.defaults[axis] !== undefined) ? o.defaults[axis] : 0,
                selector: { number: { min: -o.range, max: o.range, step: 1, mode: 'slider' } },
                labelKey: o.labels === 'axis'
                    ? `__axis_${axis.toUpperCase()}`
                    : (o.keyStem === 'offset'
                        ? `${o.labels}_offset_${axis}`
                        : `${o.labels}_label_offset_${axis}`),
            }));
            f.push(sideBySide(pair));
        }
    }

    if (group === 'rotation' && caps.rotation) {
        bool(`${prefix}_rotate_show_live`, caps.rotation.showLiveDef, 'rotation_show_live');
        const slots = [];
        for (let n = 1; n <= caps.rotation.slots; n++) {
            slots.push({ key: `${prefix}_rotate_show_daily_${n}`, def: false,
                         selector: { boolean: {} }, labelKey: `rotation_show_slot_${n}` });
        }
        f.push(sideBySide(slots, '200px'));
    }

    if (group === 'donut' && caps.donutToday) {
        const d = caps.donutToday;
        bool(d.toggleKey, d.toggleDef, d.labelKey || `${prefix}_donut_enabled`);
    }

    if (group === 'mix' && caps.mix) {
        const m = caps.mix;
        bool(m.toggleKey, m.toggleDef, m.labelKey || `${prefix}_mix_enabled`);
        f.push({ key: `${prefix}_mix_period`, def: m.periodDef,
            selector: { select: { mode: 'dropdown', options: MIX_PERIODS } },
            labelKey: m.periodLabelKey || `${prefix}_mix_period`,
            optionLabels: m.periodOptionPrefix || `${prefix}_mix_period_` });
        const gapKey = m.ringNames ? `${prefix}_mix_ring_gap` : `${prefix}_mix_gap`;
        const thickKey = m.ringNames ? `${prefix}_mix_ring_thickness` : `${prefix}_mix_thickness`;
        f.push(sideBySide([
            { key: gapKey, def: m.gapDef, labelKey: m.gapLabelKey || `${prefix}_mix_gap`,
              selector: { number: { min: 0, max: m.gapMax, step: 1, mode: 'slider' } } },
            { key: thickKey, def: m.thicknessDef,
              labelKey: m.thicknessLabelKey || `${prefix}_mix_thickness`,
              selector: { number: { min: m.thicknessMin, max: m.thicknessMax, step: 1, mode: 'slider' } } },
        ]));
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
        // Rule B: appearance is fine adjustment -- folded away, the two
        // everyday controls (on, period) stay in reach above it.
        const fine = [];
        const styleField = { key: `${prefix}_sparkline_style`, def: s.styleDef,
            selector: { select: { mode: 'dropdown', options: SPARKLINE_STYLES } },
            labelKey: 'sparkline_style', optionLabels: 'sparkline_style_' };
        // The climate curves have no layer choice -- they sit behind their own
        // column and nowhere else -- so style stands alone there.
        if (s.layerDef) {
            fine.push(sideBySide([
                { key: `${prefix}_sparkline_layer`, def: s.layerDef,
                  selector: { select: { mode: 'dropdown', options: SPARKLINE_LAYERS } },
                  labelKey: 'sparkline_layer', optionLabels: 'sparkline_layer_' },
                styleField,
            ], '200px'));
        } else {
            fine.push(styleField);
        }
        fine.push({ key: `${prefix}_sparkline_opacity`, def: s.opacityDef,
            labelKey: 'sparkline_opacity',
            selector: { number: { min: 0.05, max: 1, step: 0.05, mode: 'slider' } } });
        if (s.debug) fine.push({ key: `${prefix}_sparkline_debug`, def: false,
            selector: { boolean: {} }, labelKey: 'sparkline_debug' });
        if (s.testMode) fine.push({ key: `${prefix}_sparkline_test_mode`, def: false,
            selector: { boolean: {} }, labelKey: 'sparkline_test_mode' });
        f.push(collapsible('group_sparkline_look', fine));
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
            _subView: { state: true }, // Controls which sub-page is open (null = main)
            _openSuggestion: { state: true } // Which field's suggestion list is open
        };
    }

    setConfig(config) {
        this._config = config;
    }

    // Neutral names for the bubbles. The editor's texts carry {battery},
    // {venus} and friends instead of the hardware that happened to be on the
    // desk when they were written -- "Venus" and "LG" meant nothing to anyone
    // with a different make.
    //
    // Resolved per bubble in this order:
    //   1. the label the user gave the bubble
    //   2. the name of the DEVICE its sensor belongs to  ("Marstek Venus")
    //   3. the neutral default                            ("Storage 2")
    //
    // Display only. Nothing is written back into the config -- the label field
    // stays the user's to set.
    _bubbleName(prefix) {
        const cfg = this._config || {};
        const label = cfg[`${prefix}_label`];
        if (label) return label;

        const entityId = (cfg.entities || {})[prefix];
        const reg = this.hass && this.hass.entities;
        const devices = this.hass && this.hass.devices;
        if (entityId && reg && devices) {
            const entry = reg[entityId];
            const device = entry && entry.device_id && devices[entry.device_id];
            if (device) {
                const name = device.name_by_user || device.name;
                if (name) return name;
            }
            const st = this.hass.states && this.hass.states[entityId];
            if (st && st.attributes && st.attributes.friendly_name) {
                return st.attributes.friendly_name;
            }
        }
        return this._localizeRaw(`editor.bubble_default_${prefix}`);
    }

    _localizeRaw(key) {
        const lang = this.hass && this.hass.language ? this.hass.language : 'en';
        const dict = editorTranslations[lang] || editorTranslations['en'];
        return dict[key] || editorTranslations['en'][key] || key;
    }

    _localize(key) {
        const text = this._localizeRaw(key);
        if (text.indexOf('{') === -1) return text;
        return text.replace(/\{([a-z0-9_]+)\}/g, (whole, prefix) =>
            this._bubbleName(prefix));
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
        for (const fld of flattenFields(bubbleFields(prefix, group))) {
            const cur = this._config[fld.key];
            data[fld.key] = cur !== undefined ? cur : fld.def;
        }
        return data;
    }

    _bubbleSchema(prefix, group) {
        const build = (items) => items.map((item) => {
            // Grid: children side by side. flatten:true keeps their values at
            // the top of the data object, where the handler expects them.
            if (item.__grid) {
                return { type: 'grid', name: '', flatten: true,
                         column_min_width: item.minWidth, schema: build(item.fields) };
            }
            // Expandable: a collapsible block. flatten:true for the same reason.
            if (item.__panel) {
                return { type: 'expandable', name: '', flatten: true,
                         expanded: item.expanded,
                         title: this._localize(`editor.${item.titleKey}`),
                         schema: build(item.fields) };
            }
            const entry = { name: item.key, selector: item.selector,
                            labelKey: item.labelKey, optional: item.optional,
                            helpKey: fieldHelpKey(item.key) };
            if (item.optionLabels !== undefined) {
                // An empty optionLabels prefix means the values are literals
                // (durations such as "6h") and are shown unchanged. Otherwise
                // the legacy keys drop the hyphen: "area-line" -> ..._arealine.
                entry.selector = { select: { mode: 'dropdown',
                    options: item.selector.select.options.map((v) => ({
                        value: v,
                        label: item.optionLabels === '' ? v : this._localize(
                            `editor.${item.optionLabels}${v.replace(/-/g, '')}`),
                    })) } };
            }
            return entry;
        });
        return build(bubbleFields(prefix, group));
    }

    // Guidance under a field, where the effect is not self-evident.
    _bubbleHelper(schemaEntry) {
        if (!schemaEntry || !schemaEntry.helpKey) return undefined;
        return this._localize(`editor.${schemaEntry.helpKey}`);
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

        for (const fld of flattenFields(bubbleFields(prefix, group))) {
            if (!(fld.key in v)) continue;
            const val = v[fld.key];
            const isDefault = (val === fld.def) || (val === undefined) || (val === '');
            if (isDefault && !(fld.key in this._config)) continue;
            if (val === undefined || val === '') delete cfg[fld.key];
            else cfg[fld.key] = val;

            // Comet tail and dashed line draw the same pipe two ways, so the
            // hand-wired handler switched one off when the other came on. That
            // rule lives in the markup handler and would have been lost
            // silently on the way into the schema.
            if (fld.key === 'show_comet_tail' && val === true) cfg.show_dashed_line = false;
            if (fld.key === 'show_dashed_line' && val === true) cfg.show_comet_tail = false;
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
                .computeHelper=${(s) => this._bubbleHelper(s)}
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

    // Every entity picker in every section goes through here, so narrowing and
    // suggestions are added once and take effect in all twelve sections at
    // once -- no touching 220 call sites.
    _entitySelectorFor(configValue, currentValue, fallbackSchema) {
        const kind = ENTITY_FIELD_KINDS[configValue];
        const filter = kind && ENTITY_FILTERS[kind];
        if (!filter) return fallbackSchema;

        // Never hide what is already configured. If the saved sensor does not
        // match the filter -- a template sensor without a device_class, say --
        // the filter is dropped for this field, otherwise the picker would
        // come up blank and the value would look lost.
        if (currentValue && this.hass) {
            const st = this.hass.states[currentValue];
            const dc = st && st.attributes && st.attributes.device_class;
            const matches = filter.some((f) => {
                if (!f.device_class) return currentValue.startsWith(`${f.domain}.`);
                return dc === f.device_class;
            });
            if (!matches) return fallbackSchema;
        }
        return { entity: { filter } };
    }

    // Which role a field is asking for. Storage fields want a sensor that sits
    // on a device with a charge level; source and meter fields want one that
    // does not.
    _fieldRole(configValue) {
        if (/^(battery|venus)(_|$)/.test(configValue)) return 'storage';
        if (/^(solar|grid|house|bkw)(_|$)/.test(configValue)) return 'source';
        return null;
    }

    // Does this entity's device also expose a charge level in percent?
    // Brand-independent: a battery inverter carries one, a meter or a string
    // inverter does not, whoever built it.
    //
    // Template sensors have no device at all -- most of the interesting ones on
    // a tuned system are hand-built. When the device is unknown the signal is
    // OMITTED, never counted against, or a user's own sensors would rank last.
    _deviceContext(entityId) {
        const reg = this.hass && this.hass.entities;
        const devices = this.hass && this.hass.devices;
        if (!reg || !devices) return null;              // older HA: no registry
        const entry = reg[entityId];
        if (!entry || !entry.device_id) return null;    // template sensor
        const device = devices[entry.device_id];

        // A charge level alone is not enough: a thermometer and a smoke
        // detector report one too. What separates a storage system is that the
        // SAME device also meters power or energy. Both conditions, no brands.
        let hasChargeLevel = false;
        let metersEnergy = false;
        for (const [id, e] of Object.entries(reg)) {
            if (e.device_id !== entry.device_id || id === entityId) continue;
            const st = this.hass.states[id];
            const dc = st && st.attributes && st.attributes.device_class;
            if (dc === 'battery' && st.attributes.unit_of_measurement === '%') hasChargeLevel = true;
            if (dc === 'power' || dc === 'energy') metersEnergy = true;
            if (hasChargeLevel && metersEnergy) break;
        }
        hasChargeLevel = hasChargeLevel && metersEnergy;
        const label = device
            ? (device.name_by_user || device.name || null)
            : null;
        return { hasChargeLevel, label };
    }

    // Ranked guesses for one field, each with the reason next to it -- a
    // suggestion you cannot check is just a different kind of guessing.
    _entitySuggestions(configValue, limit) {
        if (!this.hass || !this.hass.states) return [];
        const hints = ENTITY_NAME_HINTS[configValue];
        if (!hints) return [];
        const kind = ENTITY_FIELD_KINDS[configValue];
        const wantUnit = { power: 'W', battery: '%', temperature: '\u00b0C' }[kind];
        const role = this._fieldRole(configValue);

        // Which device the bubble this field belongs to already points at, and
        // which devices its siblings have taken. Without this, "storage 1
        // charge level" and "storage 2 charge level" would offer the identical
        // list -- there is nothing in a sensor name that says which of two
        // storage systems it belongs to, but the device says it exactly.
        const ents = (this._config && this._config.entities) || {};
        const bubble = configValue.split('_')[0];
        const deviceOf = (entityId) => {
            const reg = this.hass && this.hass.entities;
            const e = entityId && reg && reg[entityId];
            return (e && e.device_id) || null;
        };
        const ownDevice = deviceOf(ents[bubble]);
        const takenDevices = new Set();
        for (const [k, v] of Object.entries(ents)) {
            if (k.split('_')[0] === bubble || !ENTITY_FIELD_KINDS[k]) continue;
            const d = deviceOf(v);
            if (d) takenDevices.add(d);
        }

        // Word-boundary matching, not substrings: "pv" must not match inside an
        // unrelated name. Id and friendly name become one underscore-separated
        // string with sentinels at both ends.
        const asWords = (id, name) =>
            `_${id} ${name || ''}_`.toLowerCase().replace(/[.\s-]/g, '_');
        const has = (hay, word) => hay.includes(`_${word}_`);
        const penalties = ENTITY_NAME_PENALTIES.filter((p) =>
            !hints.strong.includes(p) && !hints.weak.includes(p));

        const scored = [];
        for (const [id, st] of Object.entries(this.hass.states)) {
            if (!id.startsWith('sensor.') && !id.startsWith('input_number.')) continue;
            const attrs = st.attributes || {};
            if (isNaN(parseFloat(st.state))) continue;

            const hay = asWords(id, attrs.friendly_name);
            let score = 0;
            const why = [];
            if (kind && attrs.device_class === kind) { score += 5; why.push(attrs.device_class); }
            if (wantUnit && attrs.unit_of_measurement === wantUnit) { score += 3; why.push(wantUnit); }
            for (const w of hints.strong) if (has(hay, w)) score += 5;
            for (const w of hints.weak) if (has(hay, w)) score += 2;
            for (const p of penalties) if (hay.includes(p)) score -= 6;

            // Suggestions obey the same filter the picker does. Without this a
            // field that only accepts device_class battery could be handed a
            // vehicle charge level that carries no device class at all.
            const wantedFilter = ENTITY_FILTERS[kind];
            if (wantedFilter) {
                const ok = wantedFilter.some((f) => f.device_class
                    ? attrs.device_class === f.device_class
                    : id.startsWith(`${f.domain}.`));
                if (!ok) continue;
            }
            if (role === 'storage' && NON_STATIONARY_WORDS.some((w) => has(hay, w))) continue;

            const ownDev = (this.hass.entities && this.hass.entities[id]
                && this.hass.entities[id].device_id) || null;
            if (ownDev && ownDevice) {
                if (ownDev === ownDevice) {
                    // Weighted above any name match: the device is hard
                    // evidence, a word in an id is a hint.
                    score += 8;
                    why.push(this._localize('editor.suggest_why_same_device'));
                } else if (takenDevices.has(ownDev)) {
                    score -= 8;   // belongs to a different bubble already
                }
            }

            const ctx = role ? this._deviceContext(id) : null;
            if (ctx) {
                if (role === 'storage' && ctx.hasChargeLevel) {
                    score += 6;
                    why.push(this._localize('editor.suggest_why_storage'));
                } else if (role === 'source' && ctx.hasChargeLevel) {
                    score -= 4;
                }
                if (ctx.label) why.unshift(ctx.label);
            }

            if (score < 8) continue;
            if (attrs.friendly_name && !why.includes(attrs.friendly_name)) why.push(attrs.friendly_name);
            scored.push({ id, score, why: why.join(' \u00b7 ') });
        }
        scored.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
        return scored.slice(0, limit || 3);
    }

    _toggleSuggestions(configValue) {
        this._openSuggestion = this._openSuggestion === configValue ? null : configValue;
        this.requestUpdate();
    }

    _applySuggestion(configValue, entityId) {
        this._openSuggestion = null;
        this._valueChanged({
            target: { configValue, value: entityId },
            detail: { value: entityId },
        });
    }

    _renderEntitySelector(entitySelectorSchema, value, configValue, label) {
        const val = value || "";
        const schema = this._entitySelectorFor(configValue, val, entitySelectorSchema);
        const canSuggest = !val && !!ENTITY_NAME_HINTS[configValue];
        const open = this._openSuggestion === configValue;
        const suggestions = open ? this._entitySuggestions(configValue, 3) : [];
            return html`
            <div class="entity-picker-wrapper">
                <ha-selector
                    .hass=${this.hass}
                    .selector=${schema}
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
                ${canSuggest ? html`<ha-icon
                    class="suggest-entity-btn"
                    icon=${open ? 'mdi:close' : 'mdi:auto-fix'}
                    title=${this._localize('editor.suggest_entity')}
                    @click=${() => this._toggleSuggestions(configValue)}
                ></ha-icon>` : ''}
            </div>
            ${open ? html`
                <div class="suggestion-box">
                    ${suggestions.length === 0
                        ? html`<div class="suggestion-empty">${this._localize('editor.suggest_none')}</div>`
                        : suggestions.map((s) => html`
                            <div class="suggestion-row" @click=${() => this._applySuggestion(configValue, s.id)}>
                                <div class="suggestion-id">${s.id}</div>
                                <div class="suggestion-why">${s.why}</div>
                            </div>
                        `)}
                </div>
            ` : ''}
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
      /* Phase editor-3: suggestion button and result list. */
      .suggest-entity-btn {
          --mdc-icon-size: 20px;
          color: var(--primary-color);
          cursor: pointer;
          flex-shrink: 0;
          margin-top: -12px;
      }
      .suggest-entity-btn:hover {
          color: var(--primary-text-color);
      }
      .suggestion-box {
          margin: -4px 0 10px 0;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          overflow: hidden;
      }
      .suggestion-row {
          padding: 8px 10px;
          cursor: pointer;
          border-bottom: 1px solid var(--divider-color);
      }
      .suggestion-row:last-child { border-bottom: none; }
      .suggestion-row:hover { background: var(--secondary-background-color); }
      .suggestion-id {
          font-family: monospace;
          font-size: 0.85em;
          color: var(--primary-text-color);
      }
      .suggestion-why {
          font-size: 0.78em;
          color: var(--secondary-text-color);
          margin-top: 2px;
      }
      .suggestion-empty {
          padding: 8px 10px;
          font-size: 0.82em;
          color: var(--secondary-text-color);
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
            ${this._bubbleForm('__global__', 'panels')}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 8px 0 12px 0;">
                ${this._localize('editor.side_panels_hint')}
            </div>
        </div>

        ${(() => {
            // Live arithmetic on the space the panels claim, and the window
            // width below which the card starts shrinking. Free text, so it
            // stays markup -- a schema renders fields, not sentences.
            const w = this._config.side_panel_width !== undefined ? this._config.side_panel_width : 320;
            const g = this._config.side_panel_gap !== undefined ? this._config.side_panel_gap : 40;
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
        const solarMixTargets = ['house', 'lg', 'venus', 'grid'];
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
                ${solarMixTargets.map((solarMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`solar_mix_${solarMixTarget}_${mixPeriod}`] || "",
                    `solar_mix_${solarMixTarget}_${mixPeriod}`,
                    this._localize(`editor.solar_mix_${solarMixTarget}_label`)))}
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
    // Phase editor-5: Grid on the generic schema. A subset of what Solar
    // already carries -- one label-offset pair instead of two, a two-segment
    // mix ring instead of four, no enable switch.
    _renderGridView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const gridMixTargets = ['import', 'export'];
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

            ${this._bubbleForm('grid', 'sensors')}

            ${this._renderColorPickerQuint('color_grid', 'color_pipe_grid', 'color_text_grid', 'color_icon_grid', 'color_secondary_grid', '#3b82f6')}
            ${this._renderColorPicker('color_export', this._localize('editor.export_color'), '#ff3333')}
        </div>

        <!-- Group: Behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cog"></ha-icon>
                ${this._localize('editor.group_behavior')}
            </div>

            ${this._bubbleForm('grid', 'behavior')}
        </div>

        <!-- Group: Watt-label positioning -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cursor-move"></ha-icon>
                ${this._localize('editor.group_label_positions')}
            </div>

            ${this._bubbleForm('grid', 'offsets')}
        </div>

        <!-- Group: Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('grid', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`grid_rotate_daily_${n}`] || "", `grid_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`grid_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
                </ha-expansion-panel>

        <!-- Group: Grid donut -->
        <ha-expansion-panel outlined .header=${this._localize('editor.grid_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:donut-small"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.grid_donut_hint')}
            </div>

            ${this._bubbleForm('grid', 'donut')}

            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_donut_import_today || "", 'grid_donut_import_today', this._localize('editor.grid_donut_import_sensor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_donut_export_today || "", 'grid_donut_export_today', this._localize('editor.grid_donut_export_sensor'))}

            <!-- Phase 5.73: Grid Import/Export balance mix-ring, two segments. -->
            <div class="group-title">
                <ha-icon icon="mdi:circle-multiple-outline"></ha-icon>
                ${this._localize('editor.grid_mix_section')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.grid_mix_hint')}
            </div>

            ${this._bubbleForm('grid', 'mix')}

            ${(() => {
                const mixPeriod = this._config.grid_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.grid_mix_${mixPeriod}_section`)}
                </div>
                ${gridMixTargets.map((gridMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`grid_mix_${gridMixTarget}_${mixPeriod}`] || "",
                    `grid_mix_${gridMixTarget}_${mixPeriod}`,
                    this._localize(`editor.grid_mix_${gridMixTarget}_label`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <!-- Phase 5.84: per-segment colors for the grid mix-ring. -->
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.source_mix_colors_section')}
            </div>
            ${this._renderColorPicker('grid_mix_color_import', this._localize('editor.grid_mix_color_import'), '#ff0040')}
            ${this._renderColorPicker('grid_mix_color_export', this._localize('editor.grid_mix_color_export'), '#ffd900')}

            <!-- Phase 5.73: Grid sparkline. -->
            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.sparkline_title')}
            </div>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_sparkline_entity || "", 'grid_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('grid', 'sparkline')}

            ${this._renderColorPicker('grid_sparkline_color', this._localize('editor.sparkline_color'), '#ff0040')}
                </ha-expansion-panel>
      `;
    }

    // Phase editor-5b: Storage 1 on the generic schema. The two storage bubbles
    // are structurally identical -- same controls, same order, different prefix
    // and colour defaults -- so they are built from one template. Six
    // capabilities that no source bubble has: enable switch, invert, show
    // power, charge-via-house, hide-solar-pipe, and the charge-level ring.
    _renderBatteryView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.battery_section')}</h2>
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

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                ${this._localize('editor.grid_to_battery_hint')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.grid_to_battery || "", 'grid_to_battery', this._localize('editor.grid_to_battery_sensor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_battery || "", 'secondary_battery', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('battery', 'sensors')}

            ${this._renderColorPickerQuint('color_battery', 'color_pipe_battery', 'color_text_battery', 'color_icon_battery', 'color_secondary_battery', '#00ff88')}
        </div>

        <!-- Group: Behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cog"></ha-icon>
                ${this._localize('editor.group_behavior')}
            </div>

            ${this._bubbleForm('battery', 'behavior')}
        </div>

        <!-- Group: Watt-label positioning -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cursor-move"></ha-icon>
                ${this._localize('editor.group_label_positions')}
            </div>

            ${this._bubbleForm('battery', 'offsets')}
        </div>

        <!-- Group: Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('battery', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`battery_rotate_daily_${n}`] || "", `battery_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`battery_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
                </ha-expansion-panel>

        <!-- Group: charge-level ring and charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.battery_soc_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:battery-charging"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.battery_soc_donut_hint')}
            </div>

            ${this._bubbleForm('battery', 'soc')}

            <div class="group-title">
                <ha-icon icon="mdi:circle-multiple-outline"></ha-icon>
                ${this._localize('editor.battery_mix_section')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.battery_mix_hint')}
            </div>

            ${this._bubbleForm('battery', 'mix')}

            ${(() => {
                const mixPeriod = this._config.battery_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.battery_mix_${mixPeriod}_section`)}
                </div>
                ${mixTargets.map((batteryMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`battery_mix_${batteryMixTarget}_${mixPeriod}`] || "",
                    `battery_mix_${batteryMixTarget}_${mixPeriod}`,
                    this._localize(`editor.battery_mix_${batteryMixTarget}_label`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.source_mix_colors_section')}
            </div>
            ${this._renderColorPicker('battery_mix_color_pv', this._localize('editor.battery_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('battery_mix_color_grid', this._localize('editor.battery_mix_color_grid'), '#ff0040')}

            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.sparkline_title')}
            </div>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.battery_sparkline_entity || "", 'battery_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('battery', 'sparkline')}

            ${this._renderColorPicker('battery_sparkline_color', this._localize('editor.sparkline_color'), '#e100ff')}
                </ha-expansion-panel>
      `;
    }
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

    // Phase editor-5b: Storage 2 on the generic schema. The two storage bubbles
    // are structurally identical -- same controls, same order, different prefix
    // and colour defaults -- so they are built from one template. Six
    // capabilities that no source bubble has: enable switch, invert, show
    // power, charge-via-house, hide-solar-pipe, and the charge-level ring.
    _renderVenusView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.venus_section')}</h2>
        </div>

        <!-- Group: Sensors & display -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:tune"></ha-icon>
                ${this._localize('editor.group_sensors_display')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.venus, 'venus', this._localize('editor.venus_entity'))}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 4px; margin-bottom: 8px;">
                ${this._localize('editor.venus_separate_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_charge || "", 'venus_charge', this._localize('editor.venus_charge_sensor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_discharge || "", 'venus_discharge', this._localize('editor.venus_discharge_sensor'))}

            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_soc, 'venus_soc', this._localize('editor.venus_soc_label'))}

            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_pv_charge || "", 'venus_pv_charge', this._localize('editor.venus_pv_charge_sensor'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.venus_pv_charge_hint')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_venus || "", 'secondary_venus', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('venus', 'sensors')}

            ${this._renderColorPickerQuint('color_venus', 'color_pipe_venus', 'color_text_venus', 'color_icon_venus', 'color_secondary_venus', '#06b6d4')}
        </div>

        <!-- Group: Behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cog"></ha-icon>
                ${this._localize('editor.group_behavior')}
            </div>

            ${this._bubbleForm('venus', 'behavior')}
        </div>

        <!-- Group: Watt-label positioning -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:cursor-move"></ha-icon>
                ${this._localize('editor.group_label_positions')}
            </div>

            ${this._bubbleForm('venus', 'offsets')}
        </div>

        <!-- Group: Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('venus', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`venus_rotate_daily_${n}`] || "", `venus_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`venus_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
                </ha-expansion-panel>

        <!-- Group: charge-level ring and charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.venus_soc_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:battery-charging"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.venus_soc_donut_hint')}
            </div>

            ${this._bubbleForm('venus', 'soc')}

            <div class="group-title">
                <ha-icon icon="mdi:circle-multiple-outline"></ha-icon>
                ${this._localize('editor.venus_mix_section')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.venus_mix_hint')}
            </div>

            ${this._bubbleForm('venus', 'mix')}

            ${(() => {
                const mixPeriod = this._config.venus_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.venus_mix_${mixPeriod}_section`)}
                </div>
                ${mixTargets.map((venusMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`venus_mix_${venusMixTarget}_${mixPeriod}`] || "",
                    `venus_mix_${venusMixTarget}_${mixPeriod}`,
                    this._localize(`editor.venus_mix_${venusMixTarget}_label`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.source_mix_colors_section')}
            </div>
            ${this._renderColorPicker('venus_mix_color_pv', this._localize('editor.venus_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('venus_mix_color_grid', this._localize('editor.venus_mix_color_grid'), '#ff0040')}

            <div class="group-title">
                <ha-icon icon="mdi:chart-line-variant"></ha-icon>
                ${this._localize('editor.sparkline_title')}
            </div>
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.venus_sparkline_entity || "", 'venus_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('venus', 'sparkline')}

            ${this._renderColorPicker('venus_sparkline_color', this._localize('editor.sparkline_color'), '#8d07d5')}
                </ha-expansion-panel>
      `;
    }
    // Phase editor-6: the house bubble's rings and curve. The house has no
    // rotation (the rotation helper is never called with 'house'), no unit
    // switch and no offsets -- it sits in the centre. Its base fields (sensor,
    // label, icon, colours) live in the main view, where they always have.
    _renderDonutView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const houseMixTargets = ['self', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.donut_section')}</h2>
        </div>

        <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 12px;">
            ${this._localize('editor.donut_hint')}
        </div>

        ${this._bubbleForm('house', 'donut')}

        ${this._renderEntitySelector(entitySelectorSchema, entities.donut_today_solar || "", 'donut_today_solar', this._localize('editor.donut_today_solar'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.donut_today_battery || "", 'donut_today_battery', this._localize('editor.donut_today_battery'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.donut_today_venus || "", 'donut_today_venus', this._localize('editor.donut_today_venus'))}
        ${this._renderEntitySelector(entitySelectorSchema, entities.donut_today_grid || "", 'donut_today_grid', this._localize('editor.donut_today_grid'))}

        <!-- House charge-mix ring: self-supply versus grid -->
        <ha-expansion-panel outlined .header=${this._localize('editor.house_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.house_mix_hint')}
            </div>

            ${this._bubbleForm('house', 'mix')}

            ${(() => {
                const mixPeriod = this._config.house_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.house_mix_${mixPeriod}_section`)}
                </div>
                ${houseMixTargets.map((houseMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`house_mix_${houseMixTarget}_${mixPeriod}`] || "",
                    `house_mix_${houseMixTarget}_${mixPeriod}`,
                    this._localize(`editor.house_mix_${houseMixTarget}_label`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.source_mix_colors_section')}
            </div>
            ${this._renderColorPicker('house_mix_color_self', this._localize('editor.house_mix_color_self'), '#ffd900')}
            ${this._renderColorPicker('house_mix_color_grid', this._localize('editor.house_mix_color_grid'), '#ff0040')}
        </ha-expansion-panel>

        <!-- House sparkline -->
        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.house_sparkline_entity || "", 'house_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('house', 'sparkline')}

            ${this._renderColorPicker('house_sparkline_color', this._localize('editor.sparkline_color'), '#ff2d78')}
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
    // Phase editor-9: the climate tile, last of the twelve sections. Two
    // mirrored halves -- indoor and outdoor -- generated from one sparkline
    // definition with different prefixes, the same way the seven consumers
    // share one template.
    _renderTempView(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const tempSides = [
            { side: 'indoor',  titleKey: 'temp_sparkline_indoor_title',  color: '#7cf8d1' },
            { side: 'outdoor', titleKey: 'temp_sparkline_outdoor_title', color: '#77bafd' },
        ];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._localize('editor.temp_section')}</h2>
        </div>

        <div class="consumer-group">
            ${this._bubbleForm('temp', 'behavior')}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin: 8px 0 4px;">
                ${this._localize('editor.temp_position_hint')}
            </div>
            ${this._bubbleForm('temp', 'offsets')}
        </div>

        <!-- Sensors -->
        <ha-expansion-panel outlined .header=${this._localize('editor.temp_sensors_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:thermometer"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.temp_sensors_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.temp_indoor || "", 'temp_indoor', this._localize('editor.temp_indoor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.temp_outdoor || "", 'temp_outdoor', this._localize('editor.temp_outdoor'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.temp_forecast_high || "", 'temp_forecast_high', this._localize('editor.temp_forecast_high'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.temp_forecast_low || "", 'temp_forecast_low', this._localize('editor.temp_forecast_low'))}
        </ha-expansion-panel>

        <!-- Lower panel -->
        <ha-expansion-panel outlined .header=${this._localize('editor.temp_body_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:view-list"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.temp_body_hint')}
            </div>

            ${this._bubbleForm('temp', 'body')}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.temp_body_temps_section')}
            </div>
            ${this._renderEntitySelector(entitySelectorSchema, entities.temp_body_battery_temp || "", 'temp_body_battery_temp', this._localize('editor.temp_body_battery_temp'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.temp_body_venus_temp || "", 'temp_body_venus_temp', this._localize('editor.temp_body_venus_temp'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.temp_body_bwwp_temp || "", 'temp_body_bwwp_temp', this._localize('editor.temp_body_bwwp_temp'))}
            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.temp_body_colors_section')}
            </div>
            ${this._renderColorPicker('temp_body_color_pv', this._localize('editor.temp_body_color_pv'), '#ffd900')}
            ${this._renderColorPicker('temp_body_color_lg', this._localize('editor.temp_body_color_lg'), '#e100ff')}
            ${this._renderColorPicker('temp_body_color_venus', this._localize('editor.temp_body_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('temp_body_color_grid', this._localize('editor.temp_body_color_grid'), '#ff0040')}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                ${this._localize('editor.temp_body_temps_hint')}
            </div>
        </ha-expansion-panel>

        <!-- Scale ends -->
        <ha-expansion-panel outlined .header=${this._localize('editor.temp_scales_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:ruler"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.temp_scales_hint')}
            </div>

            ${this._bubbleForm('temp', 'scales')}
        </ha-expansion-panel>

        <!-- Colours -->
        <ha-expansion-panel outlined .header=${this._localize('editor.temp_colors_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:palette"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.temp_colors_hint')}
            </div>

            ${this._renderColorPicker('temp_indoor_color', this._localize('editor.temp_indoor_color'), '#7cf8d1')}
            ${this._renderColorPicker('temp_outdoor_color', this._localize('editor.temp_outdoor_color'), '#77bafd')}
            ${this._renderColorPicker('temp_marker_color', this._localize('editor.temp_marker_color'), '#d60000')}
        </ha-expansion-panel>

        <!-- One curve per column -->
        ${tempSides.map((tempSide) => html`
        <ha-expansion-panel outlined .header=${this._localize(`editor.${tempSide.titleKey}`)}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.temp_sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities[`temp_${tempSide.side}_sparkline_entity`] || "", `temp_${tempSide.side}_sparkline_entity`, this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.temp_sparkline_entity_hint')}
            </div>

            ${this._bubbleForm(`temp_${tempSide.side}`, 'sparkline')}

            ${this._renderColorPicker(`temp_${tempSide.side}_sparkline_color`, this._localize('editor.sparkline_color'), tempSide.color)}
        </ha-expansion-panel>
        `)}
      `;
    }
    // Phase editor-8: consumer 6 on the generic schema. All seven are built
    // from one template -- 29 controls each, identical but for the colours and
    // soc_max, which is the only thing that genuinely differs: what "full"
    // means for a charge level, a temperature or a tank.
    _renderConsumer6View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const idx = 6;
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'lg', 'venus', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(idx)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #14b8a6;">${this._localize('editor.consumer_6_title')}</div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6, 'consumer_6', this._localize('editor.entity'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_6 || "", 'secondary_consumer_6', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('consumer_6', 'sensors')}
            ${this._bubbleForm('consumer_6', 'behavior')}
            ${this._bubbleForm('consumer_6', 'offsets')}

            ${this._renderColorPickerQuint('color_consumer_6', 'color_pipe_consumer_6', 'color_text_consumer_6', 'color_icon_consumer_6', 'color_secondary_consumer_6', '#14b8a6')}
        </div>

        <!-- Charge-level ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_6_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:gauge"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_6_donut_hint')}
            </div>

            ${this._bubbleForm('consumer_6', 'soc')}
        </ha-expansion-panel>

        <!-- Charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_6_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_6_mix_hint')}
            </div>

            ${this._bubbleForm('consumer_6', 'mix')}

            ${(() => {
                const mixPeriod = this._config.consumer_6_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.consumer_1_mix_period_${mixPeriod}`)}
                </div>
                ${mixTargets.map((consumerMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`consumer_6_mix_${consumerMixTarget}_${mixPeriod}`] || "",
                    `consumer_6_mix_${consumerMixTarget}_${mixPeriod}`,
                    this._localize(`editor.consumer_6_mix_${consumerMixTarget}_${mixPeriod}`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_6_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_6_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_6_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_6_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
        </ha-expansion-panel>

        <!-- Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('consumer_6', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`consumer_6_rotate_daily_${n}`] || "", `consumer_6_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`consumer_6_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
        </ha-expansion-panel>

        <!-- Sparkline -->
        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_6_sparkline_entity || "", 'consumer_6_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('consumer_6', 'sparkline')}

            ${this._renderColorPicker('consumer_6_sparkline_color', this._localize('editor.sparkline_color'), '#14b8a6')}
        </ha-expansion-panel>
      `;
    }
    // Phase 5.61: dedicated sub-view for Spüler (Consumer 4) -- sixth bubble
    // with full feature parity. Default donut max = 5 (kWh) for a daily
    // energy budget on a dishwasher. User can override consumer_4_soc_max
    // for any other ratio metric. Rotation (phase 5.62) and charge-mix ring
    // (phase 5.63) follow.
    // Phase editor-8: consumer 4 on the generic schema. All seven are built
    // from one template -- 29 controls each, identical but for the colours and
    // soc_max, which is the only thing that genuinely differs: what "full"
    // means for a charge level, a temperature or a tank.
    _renderConsumer4View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const idx = 4;
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'lg', 'venus', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(idx)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #eab308;">${this._localize('editor.consumer_4_title')}</div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4, 'consumer_4', this._localize('editor.entity'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_4 || "", 'secondary_consumer_4', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('consumer_4', 'sensors')}
            ${this._bubbleForm('consumer_4', 'behavior')}
            ${this._bubbleForm('consumer_4', 'offsets')}

            ${this._renderColorPickerQuint('color_consumer_4', 'color_pipe_consumer_4', 'color_text_consumer_4', 'color_icon_consumer_4', 'color_secondary_consumer_4', '#eab308')}
        </div>

        <!-- Charge-level ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_4_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:gauge"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_4_donut_hint')}
            </div>

            ${this._bubbleForm('consumer_4', 'soc')}
        </ha-expansion-panel>

        <!-- Charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_4_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_4_mix_hint')}
            </div>

            ${this._bubbleForm('consumer_4', 'mix')}

            ${(() => {
                const mixPeriod = this._config.consumer_4_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.consumer_1_mix_period_${mixPeriod}`)}
                </div>
                ${mixTargets.map((consumerMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`consumer_4_mix_${consumerMixTarget}_${mixPeriod}`] || "",
                    `consumer_4_mix_${consumerMixTarget}_${mixPeriod}`,
                    this._localize(`editor.consumer_4_mix_${consumerMixTarget}_${mixPeriod}`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_4_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_4_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_4_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_4_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
        </ha-expansion-panel>

        <!-- Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('consumer_4', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`consumer_4_rotate_daily_${n}`] || "", `consumer_4_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`consumer_4_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
        </ha-expansion-panel>

        <!-- Sparkline -->
        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_4_sparkline_entity || "", 'consumer_4_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('consumer_4', 'sparkline')}

            ${this._renderColorPicker('consumer_4_sparkline_color', this._localize('editor.sparkline_color'), '#eab308')}
        </ha-expansion-panel>
      `;
    }
    // Phase 5.58: dedicated sub-view for Trockner (Consumer 3) -- fifth bubble
    // with full feature parity to Tesla/BWWP/Pumpe/Waschen. Default donut
    // max = 5 (kWh) suitable for a daily energy budget on a tumble dryer.
    // User can override consumer_3_soc_max for any other ratio metric.
    // Rotation (phase 5.59) and charge-mix ring (phase 5.60) follow.
    // Phase editor-8: consumer 3 on the generic schema. All seven are built
    // from one template -- 29 controls each, identical but for the colours and
    // soc_max, which is the only thing that genuinely differs: what "full"
    // means for a charge level, a temperature or a tank.
    _renderConsumer3View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const idx = 3;
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'lg', 'venus', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(idx)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #06b6d4;">${this._localize('editor.consumer_3_title')}</div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3, 'consumer_3', this._localize('editor.entity'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_3 || "", 'secondary_consumer_3', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('consumer_3', 'sensors')}
            ${this._bubbleForm('consumer_3', 'behavior')}
            ${this._bubbleForm('consumer_3', 'offsets')}

            ${this._renderColorPickerQuint('color_consumer_3', 'color_pipe_consumer_3', 'color_text_consumer_3', 'color_icon_consumer_3', 'color_secondary_consumer_3', '#06b6d4')}
        </div>

        <!-- Charge-level ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_3_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:gauge"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_3_donut_hint')}
            </div>

            ${this._bubbleForm('consumer_3', 'soc')}
        </ha-expansion-panel>

        <!-- Charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_3_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_3_mix_hint')}
            </div>

            ${this._bubbleForm('consumer_3', 'mix')}

            ${(() => {
                const mixPeriod = this._config.consumer_3_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.consumer_1_mix_period_${mixPeriod}`)}
                </div>
                ${mixTargets.map((consumerMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`consumer_3_mix_${consumerMixTarget}_${mixPeriod}`] || "",
                    `consumer_3_mix_${consumerMixTarget}_${mixPeriod}`,
                    this._localize(`editor.consumer_3_mix_${consumerMixTarget}_${mixPeriod}`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_3_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_3_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_3_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_3_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
        </ha-expansion-panel>

        <!-- Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('consumer_3', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`consumer_3_rotate_daily_${n}`] || "", `consumer_3_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`consumer_3_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
        </ha-expansion-panel>

        <!-- Sparkline -->
        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_3_sparkline_entity || "", 'consumer_3_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('consumer_3', 'sparkline')}

            ${this._renderColorPicker('consumer_3_sparkline_color', this._localize('editor.sparkline_color'), '#06b6d4')}
        </ha-expansion-panel>
      `;
    }
    // Phase 5.55: dedicated sub-view for Waschen (Consumer 2) -- fourth bubble
    // with full feature parity to Tesla/BWWP/Pumpe. Default donut max = 5 (kWh)
    // suitable for a daily energy budget on a washing machine. User can
    // override consumer_2_soc_max for other sensor ranges (different machine,
    // or a different secondary sensor like remaining time in minutes).
    // Rotation (phase 5.56) and charge-mix ring (phase 5.57) follow.
    // Phase editor-8: consumer 2 on the generic schema. All seven are built
    // from one template -- 29 controls each, identical but for the colours and
    // soc_max, which is the only thing that genuinely differs: what "full"
    // means for a charge level, a temperature or a tank.
    _renderConsumer2View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const idx = 2;
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'lg', 'venus', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(idx)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #f97316;">${this._localize('editor.consumer_2_title')}</div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2, 'consumer_2', this._localize('editor.entity'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_2 || "", 'secondary_consumer_2', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('consumer_2', 'sensors')}
            ${this._bubbleForm('consumer_2', 'behavior')}
            ${this._bubbleForm('consumer_2', 'offsets')}

            ${this._renderColorPickerQuint('color_consumer_2', 'color_pipe_consumer_2', 'color_text_consumer_2', 'color_icon_consumer_2', 'color_secondary_consumer_2', '#f97316')}
        </div>

        <!-- Charge-level ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_2_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:gauge"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_2_donut_hint')}
            </div>

            ${this._bubbleForm('consumer_2', 'soc')}
        </ha-expansion-panel>

        <!-- Charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_2_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_2_mix_hint')}
            </div>

            ${this._bubbleForm('consumer_2', 'mix')}

            ${(() => {
                const mixPeriod = this._config.consumer_2_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.consumer_1_mix_period_${mixPeriod}`)}
                </div>
                ${mixTargets.map((consumerMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`consumer_2_mix_${consumerMixTarget}_${mixPeriod}`] || "",
                    `consumer_2_mix_${consumerMixTarget}_${mixPeriod}`,
                    this._localize(`editor.consumer_2_mix_${consumerMixTarget}_${mixPeriod}`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_2_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_2_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_2_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_2_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
        </ha-expansion-panel>

        <!-- Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('consumer_2', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`consumer_2_rotate_daily_${n}`] || "", `consumer_2_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`consumer_2_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
        </ha-expansion-panel>

        <!-- Sparkline -->
        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_2_sparkline_entity || "", 'consumer_2_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('consumer_2', 'sparkline')}

            ${this._renderColorPicker('consumer_2_sparkline_color', this._localize('editor.sparkline_color'), '#f97316')}
        </ha-expansion-panel>
      `;
    }
    // Phase 5.52: dedicated sub-view for Pumpe (Consumer 7) -- third bubble
    // with full feature parity to Tesla/BWWP. Default donut max = 165 cm
    // suitable for a typical Regenschacht / rainwater cistern. User can
    // override consumer_7_soc_max for other sensor ranges (deeper cisterns,
    // shallower wells, etc.). Rotation (phase 5.53) and charge-mix ring
    // (phase 5.54) follow in the next two phases.
    // Phase editor-8: consumer 7 on the generic schema. All seven are built
    // from one template -- 29 controls each, identical but for the colours and
    // soc_max, which is the only thing that genuinely differs: what "full"
    // means for a charge level, a temperature or a tank.
    _renderConsumer7View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const idx = 7;
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'lg', 'venus', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(idx)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #ec4899;">${this._localize('editor.consumer_7_title')}</div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7, 'consumer_7', this._localize('editor.entity'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_7 || "", 'secondary_consumer_7', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('consumer_7', 'sensors')}
            ${this._bubbleForm('consumer_7', 'behavior')}
            ${this._bubbleForm('consumer_7', 'offsets')}

            ${this._renderColorPickerQuint('color_consumer_7', 'color_pipe_consumer_7', 'color_text_consumer_7', 'color_icon_consumer_7', 'color_secondary_consumer_7', '#ec4899')}
        </div>

        <!-- Charge-level ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_7_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:gauge"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_7_donut_hint')}
            </div>

            ${this._bubbleForm('consumer_7', 'soc')}
        </ha-expansion-panel>

        <!-- Charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_7_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_7_mix_hint')}
            </div>

            ${this._bubbleForm('consumer_7', 'mix')}

            ${(() => {
                const mixPeriod = this._config.consumer_7_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.consumer_1_mix_period_${mixPeriod}`)}
                </div>
                ${mixTargets.map((consumerMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`consumer_7_mix_${consumerMixTarget}_${mixPeriod}`] || "",
                    `consumer_7_mix_${consumerMixTarget}_${mixPeriod}`,
                    this._localize(`editor.consumer_7_mix_${consumerMixTarget}_${mixPeriod}`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_7_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_7_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_7_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_7_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
        </ha-expansion-panel>

        <!-- Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('consumer_7', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`consumer_7_rotate_daily_${n}`] || "", `consumer_7_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`consumer_7_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
        </ha-expansion-panel>

        <!-- Sparkline -->
        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_7_sparkline_entity || "", 'consumer_7_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('consumer_7', 'sparkline')}

            ${this._renderColorPicker('consumer_7_sparkline_color', this._localize('editor.sparkline_color'), '#ec4899')}
        </ha-expansion-panel>
      `;
    }
    // Phase 5.49: dedicated sub-view for BWWP (Consumer 5) -- pattern copied
    // from Tesla (Consumer 1), starting with the SoC donut feature. Rotation
    // and charge-mix ring will follow in phases 5.50 / 5.51. The donut uses
    // consumer_5_soc_max (default 65) to support a temperature-as-percentage
    // semantic for boiler-style sensors (22°C / 65°C = 33.8% filled).
    // Phase editor-8: consumer 5 on the generic schema. All seven are built
    // from one template -- 29 controls each, identical but for the colours and
    // soc_max, which is the only thing that genuinely differs: what "full"
    // means for a charge level, a temperature or a tank.
    _renderConsumer5View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const idx = 5;
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'lg', 'venus', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(idx)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #6366f1;">${this._localize('editor.consumer_5_title')}</div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5, 'consumer_5', this._localize('editor.entity'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_5 || "", 'secondary_consumer_5', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('consumer_5', 'sensors')}
            ${this._bubbleForm('consumer_5', 'behavior')}
            ${this._bubbleForm('consumer_5', 'offsets')}

            ${this._renderColorPickerQuint('color_consumer_5', 'color_pipe_consumer_5', 'color_text_consumer_5', 'color_icon_consumer_5', 'color_secondary_consumer_5', '#6366f1')}
        </div>

        <!-- Charge-level ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_5_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:gauge"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_5_donut_hint')}
            </div>

            ${this._bubbleForm('consumer_5', 'soc')}
        </ha-expansion-panel>

        <!-- Charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_5_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_5_mix_hint')}
            </div>

            ${this._bubbleForm('consumer_5', 'mix')}

            ${(() => {
                const mixPeriod = this._config.consumer_5_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.consumer_1_mix_period_${mixPeriod}`)}
                </div>
                ${mixTargets.map((consumerMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`consumer_5_mix_${consumerMixTarget}_${mixPeriod}`] || "",
                    `consumer_5_mix_${consumerMixTarget}_${mixPeriod}`,
                    this._localize(`editor.consumer_5_mix_${consumerMixTarget}_${mixPeriod}`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_5_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_5_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_5_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_5_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
        </ha-expansion-panel>

        <!-- Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('consumer_5', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`consumer_5_rotate_daily_${n}`] || "", `consumer_5_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`consumer_5_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
        </ha-expansion-panel>

        <!-- Sparkline -->
        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_5_sparkline_entity || "", 'consumer_5_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('consumer_5', 'sparkline')}

            ${this._renderColorPicker('consumer_5_sparkline_color', this._localize('editor.sparkline_color'), '#6366f1')}
        </ha-expansion-panel>
      `;
    }
    // Phase 5.45: dedicated sub-view for Tesla (Consumer 1) -- pulled out of
    // the consumers collective view so each major bubble has its own top-
    // level slot in the editor (Solar / Grid / Battery / Venus / Tesla / ...).
    // Future phases will give Tesla the SoC donut + charge-mix ring features.
    // Phase editor-8: consumer 1 on the generic schema. All seven are built
    // from one template -- 29 controls each, identical but for the colours and
    // soc_max, which is the only thing that genuinely differs: what "full"
    // means for a charge level, a temperature or a tank.
    _renderConsumer1View(entities, entitySelectorSchema, textSelectorSchema, iconSelectorSchema) {
        const idx = 1;
        const rotationSlotColors = ['#ff3333', '#33ff77', '#3377ff'];
        const mixTargets = ['pv', 'lg', 'venus', 'grid'];
        return html`
        <div class="header">
            <div class="back-btn" @click=${this._goBack}>
                <ha-icon icon="mdi:arrow-left"></ha-icon> ${this._localize('editor.back')}
            </div>
            <h2>${this._consumerMenuLabel(idx)}</h2>
        </div>

        <div class="consumer-group">
            <div class="consumer-title" style="color: #a855f7;">${this._localize('editor.consumer_1_title')}</div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1, 'consumer_1', this._localize('editor.entity'))}
            ${this._renderEntitySelector(entitySelectorSchema, entities.secondary_consumer_1 || "", 'secondary_consumer_1', this._localize('editor.secondary_sensor'))}

            ${this._bubbleForm('consumer_1', 'sensors')}
            ${this._bubbleForm('consumer_1', 'behavior')}
            ${this._bubbleForm('consumer_1', 'offsets')}

            ${this._renderColorPickerQuint('color_consumer_1', 'color_pipe_consumer_1', 'color_text_consumer_1', 'color_icon_consumer_1', 'color_secondary_consumer_1', '#a855f7')}
        </div>

        <!-- Charge-level ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_1_donut_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:gauge"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_1_donut_hint')}
            </div>

            ${this._bubbleForm('consumer_1', 'soc')}
        </ha-expansion-panel>

        <!-- Charge-mix ring -->
        <ha-expansion-panel outlined .header=${this._localize('editor.consumer_1_mix_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:circle-multiple-outline"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.consumer_1_mix_hint')}
            </div>

            ${this._bubbleForm('consumer_1', 'mix')}

            ${(() => {
                const mixPeriod = this._config.consumer_1_mix_period || 'day';
                return html`
                <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 8px; margin-bottom: 4px;">
                    ${this._localize(`editor.consumer_1_mix_period_${mixPeriod}`)}
                </div>
                ${mixTargets.map((consumerMixTarget) => this._renderEntitySelector(
                    entitySelectorSchema,
                    entities[`consumer_1_mix_${consumerMixTarget}_${mixPeriod}`] || "",
                    `consumer_1_mix_${consumerMixTarget}_${mixPeriod}`,
                    this._localize(`editor.consumer_1_mix_${consumerMixTarget}_${mixPeriod}`)))}
                <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: 4px;">
                    ${this._localize('editor.mix_period_scope_hint')}
                </div>
                `;
            })()}

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-top: 12px; margin-bottom: 4px; font-weight: 500;">
                ${this._localize('editor.consumer_1_mix_colors_section')}
            </div>
            ${this._renderColorPicker('consumer_1_mix_color_pv', this._localize('editor.consumer_1_mix_color_pv'), '#ffd900')}
            ${this._renderColorPicker('consumer_1_mix_color_lg', this._localize('editor.consumer_1_mix_color_lg'), '#e100ff')}
            ${this._renderColorPicker('consumer_1_mix_color_venus', this._localize('editor.consumer_1_mix_color_venus'), '#8d07d5')}
            ${this._renderColorPicker('consumer_1_mix_color_grid', this._localize('editor.consumer_1_mix_color_grid'), '#ff0040')}
        </ha-expansion-panel>

        <!-- Value rotation -->
        <ha-expansion-panel outlined .header=${this._localize('editor.rotation_section')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:rotate-3d-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.rotation_hint')}
            </div>

            ${this._bubbleForm('consumer_1', 'rotation')}

            ${[1, 2, 3].map((n) => html`
                <div class="separator"></div>
                ${this._renderEntitySelector(entitySelectorSchema, entities[`consumer_1_rotate_daily_${n}`] || "", `consumer_1_rotate_daily_${n}`, this._localize(`editor.rotation_slot_${n}_sensor`))}
                ${this._renderColorPicker(`consumer_1_rotate_color_daily_${n}`, this._localize(`editor.rotation_slot_${n}_color`), rotationSlotColors[n - 1])}
            `)}
        </ha-expansion-panel>

        <!-- Sparkline -->
        <ha-expansion-panel outlined .header=${this._localize('editor.sparkline_title')}>
            <ha-icon class="section-icon" slot="leading-icon" icon="mdi:chart-line-variant"></ha-icon>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.sparkline_hint')}
            </div>

            ${this._renderEntitySelector(entitySelectorSchema, entities.consumer_1_sparkline_entity || "", 'consumer_1_sparkline_entity', this._localize('editor.sparkline_entity_label'))}
            <div style="font-size: 0.8em; color: var(--secondary-text-color); margin-top: -4px; margin-bottom: 8px;">
                ${this._localize('editor.sparkline_entity_hint')}
            </div>

            ${this._bubbleForm('consumer_1', 'sparkline')}

            ${this._renderColorPicker('consumer_1_sparkline_color', this._localize('editor.sparkline_color'), '#ff3333')}
        </ha-expansion-panel>
      `;
    }
    // Phase editor-6: the house bubble's base fields. Its rings and curve live
    // in the donut sub-view; this is the sensor, the naming and the colours.
    // show_label_house joins them -- every other source bubble has a label
    // toggle, the card has always read this one, and no editor copy offered it.
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

            ${this._bubbleForm('house', 'sensors')}
            ${this._bubbleForm('house', 'behavior')}

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

            ${this._bubbleForm('__global__', 'sizing')}
        </div>

        <!-- Group: Appearance / visual effects -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:palette"></ha-icon>
                ${this._localize('editor.group_appearance')}
            </div>

            ${this._bubbleForm('__global__', 'appearance')}
        </div>

        <!-- Group: Display behavior -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:eye"></ha-icon>
                ${this._localize('editor.group_display')}
            </div>

            ${this._bubbleForm('__global__', 'display')}
        </div>


        <!-- Group: Debug & test -->
        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:circle-double"></ha-icon>
                ${this._localize('editor.group_portals')}
            </div>

            <div style="font-size: 0.85em; color: var(--secondary-text-color); margin-bottom: 8px;">
                ${this._localize('editor.portals_hint')}
            </div>

            ${this._bubbleForm('__global__', 'portals')}
        </div>

        <div class="option-group">
            <div class="group-title">
                <ha-icon icon="mdi:bug-outline"></ha-icon>
                ${this._localize('editor.group_debug')}
            </div>

            ${this._bubbleForm('__global__', 'debug')}
        </div>

      </div>
    `;
    }
}

customElements.define("power-flux-card-editor", PowerFluxCardEditor);
