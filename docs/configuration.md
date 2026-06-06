# Configuration reference

*Information-oriented: look up an option here. For what the options mean
conceptually, see [Features explained](features.md).*

The card is **designed to be configured through the visual editor** — open the
card, click **Edit**, and every bubble has its own collapsible section. The
editor is the source of truth; the YAML keys below mirror exactly what the
editor writes. You rarely need to hand-write YAML.

Notation used below:
- `N` = a consumer number, `1`–`7`.
- *source* = one of `solar`, `grid`, `battery` (Battery 1 / LG), `venus`
  (Battery 2), `house`.

The card element type is `custom:power-flux-card`.

## Card options (global)

### General & appearance

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | string | **required** | `custom:power-flux-card` |
| `entities` | object | **required** | Sensor entities — see [Entities](#entities) |
| `zoom` | number | `0.9` | Overall scale factor of the card |
| `bubble_size` | number | `90` | Bubble diameter in px |
| `pipe_label_size` | number | `10` | Font size of the watt labels on pipes, in px |
| `card_offset_x` / `card_offset_y` | number | `0` | Pixel offset of the whole flow inside the card |
| `transparent_background` | boolean | `false` | Remove the card background |
| `background_padding_top` / `_bottom` / `_left` / `_right` | number | `0` | Inner padding of the card background, in px |

### Animations & effects

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `show_neon_glow` | boolean | `true` | Neon glow around bubbles and pipes |
| `show_comet_tail` | boolean | `false` | Comet-tail flow animation |
| `show_dashed_line` | boolean | `false` | Dashed-line flow animation (alternative to comet-tail) |
| `show_tinted_background` | boolean | `false` | Tinted background inside the bubbles |
| `show_donut_border` | boolean | `false` | Draw a border around donut rings |
| `hide_inactive_flows` | boolean | `true` | Hide pipes whose value is below threshold |
| `use_colored_values` | boolean | `false` | Color the numeric values to match the bubble |
| `always_color_bubbles` | boolean | `false` | Always color bubble outlines, even when inactive |
| `show_consumer_always` | boolean | `false` | Show consumer bubbles even at 0 W |
| `hide_consumer_icons` | boolean | `false` | Hide the small consumer-icon row |
| `demo_mode` | boolean | `false` | Force demo values on all pipes (for positioning labels) |
| `rotation_interval_sec` | number | – | Seconds between rotated values (see [rotation](features.md#value-rotation)) |

### Background animation

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `bg_anim_style` | string | `off` | `aurora`, `flow`, or `off` |
| `bg_anim_duration_sec` | number | – | Animation cycle length, in seconds |
| `bg_anim_intensity` | number | – | Animation intensity |
| `bg_anim_saturate` | number | – | Color saturation of the animated background |

### Side panels

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `side_panels_enabled` | boolean | `false` | Show optional left/right side panels |
| `side_panel_width` | number | `320` | Width of each side panel, in px |
| `side_panel_gap` | number | `40` | Gap between panels and the flow, in px |
| `left_panel_cards` / `right_panel_cards` | array | – | Lovelace cards to render in the panels (managed in the editor) |

### Battery pipes

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `battery_enabled` | boolean | `true` | Show Battery 1 (LG) |
| `venus_enabled` | boolean | `true` | Show Battery 2 (Venus) |
| `battery_charge_via_house` / `venus_charge_via_house` | boolean | – | Route solar charging through the house instead of a direct Solar→battery pipe |
| `hide_solar_to_battery_pipe` / `hide_solar_to_venus_pipe` | boolean | `false` | Hide the direct Solar→battery pipe |
| `invert_battery` / `invert_venus` | boolean | – | Invert the sign of the battery power value |

### House daily-mix donut

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `donut_today_mode` | boolean | – | Switch the house donut from live to daily-mix (kWh) |
| `pv_donut_today_mode` / `grid_donut_today_mode` | boolean | – | Per-segment daily-mix toggles |

## Entities

All sensors are assigned in the editor; none are hard-coded.

| Key | Description |
| --- | --- |
| `solar` | Current PV power |
| `grid_combined` | Combined grid power (negative = export, positive = import) |
| `grid` / `grid_export` | Alternative split grid entities |
| `battery` | Battery 1 (LG) power, signed |
| `battery_soc` | Battery 1 state of charge (%) |
| `battery_charge` / `battery_discharge` | Alternative split charge/discharge entities |
| `venus` | Battery 2 (Venus) power, signed |
| `venus_soc` | Battery 2 state of charge (%) |
| `house` | Total house consumption |
| `consumer_1` … `consumer_7` | Power of each consumer |
| `secondary_consumer_N` | Secondary value for a consumer's donut (e.g. SoC %, temperature) |

The source sensors for the **charge-mix ring** (per day/month/year), the
**value rotation** (up to three daily sensors), and the **sparkline** are also
assigned in each bubble's editor section.

## Per-bubble options

Each source bubble (`solar`, `grid`, `battery`, `venus`) and the house bubble
share a common set of keys, prefixed with the *source* name. Consumers use the
`consumer_N_` prefix. Examples below use `battery_` and `consumer_1_`; the same
keys exist for every bubble.

### Labels, icons, position

| Key pattern | Type | Description |
| --- | --- | --- |
| `{source}_label`, `consumer_N_label` | string | Bubble label |
| `{source}_icon`, `consumer_N_icon` | string | MDI icon |
| `{source}_label_offset_x` / `_y` | number | Watt-label offset, in px |
| `solar_export_label_offset_x` / `_y` | number | Offset for the solar→export label |
| `show_label_{solar,grid,battery,venus}` | boolean | Show the bubble's name label |

### Behavior & values

| Key pattern | Type | Description |
| --- | --- | --- |
| `{source}_unit_kw`, `consumer_N_unit_kw` | boolean | Force kW display |
| `{source}_animation_threshold`, `consumer_N_animation_threshold` | number | Hide the animation below this many watts |
| `consumer_N_pipe_threshold` | number | Hide the consumer pipe below this many watts |
| `consumer_N_hide_pipe` | boolean | Always hide this consumer's pipe |
| `consumer_N_enabled` | boolean | Enable the consumer bubble (default `true` for 1–5, `false` for 6–7) |
| `battery_show_power`, `venus_show_power`, `consumer_N_show_power` | boolean | Show the power value in the bubble |
| `show_flow_rate_{source}`, `show_flow_rate_consumer_N` | boolean | Show the flow rate on the pipe |
| `invert_consumer_N` | boolean | Invert the sign of the consumer value |

### Donut (inner ring)

| Key pattern | Type | Description |
| --- | --- | --- |
| `{battery,venus}_soc_donut_mode`, `consumer_N_soc_donut_mode` | boolean | Enable the inner donut |
| `consumer_N_soc_max` | number | Donut maximum (e.g. `100` for %, `65` for °C, `165` for cm) |

### Charge-mix ring (outer ring)

| Key pattern | Type | Description |
| --- | --- | --- |
| `{source}_mix_donut_mode`, `consumer_N_mix_donut_mode` | boolean | Enable the charge-mix ring |
| `{source}_mix_period`, `consumer_N_mix_period` | string | `day`, `month`, or `year` |
| `{source}_mix_gap`, `consumer_N_mix_ring_gap` | number | Gap between bubble and ring, in px |
| `{source}_mix_thickness`, `consumer_N_mix_ring_thickness` | number | Ring thickness, in px |

The four segment **colors** and the per-period source **sensors** (PV / LG /
Venus / Grid) are assigned in the same editor section. Unset colors fall back
to the matching pipe color.

> Note: source bubbles use `_mix_gap` / `_mix_thickness`, while consumers use
> `_mix_ring_gap` / `_mix_ring_thickness`. This naming difference is historical.

### Value rotation

| Key pattern | Type | Description |
| --- | --- | --- |
| `{source}_rotate_show_live`, `consumer_N_rotate_show_live` | boolean | Include the live value in the rotation |
| `{source}_rotate_show_daily_1..3`, `consumer_N_rotate_show_daily_1..3` | boolean | Include rotation slots 1–3 |

The three daily sensors and their colors are assigned in the editor.

### Sparkline

| Key pattern | Type | Description |
| --- | --- | --- |
| `{source}_sparkline`, `consumer_N_sparkline` | boolean | Enable the inline history sparkline |
| `{source}_sparkline_period`, `consumer_N_sparkline_period` | string | History period |
| `{source}_sparkline_style`, `consumer_N_sparkline_style` | string | Line style |
| `{source}_sparkline_opacity`, `consumer_N_sparkline_opacity` | number | Opacity |
| `{source}_sparkline_layer`, `consumer_N_sparkline_layer` | string | Draw behind or in front of content |
| `{source}_sparkline_test_mode`, `consumer_N_sparkline_test_mode` | boolean | Show synthetic data for positioning |

## Climate / temperature bubble

An optional bubble showing indoor and outdoor temperature.

| Key | Type | Description |
| --- | --- | --- |
| `temp_enabled` | boolean | Show the climate bubble |
| `temp_offset_x` / `temp_offset_y` | number | Position offset, in px |
| `temp_indoor_min` / `temp_indoor_max` | number | Indoor gauge range |
| `temp_outdoor_min` / `temp_outdoor_max` | number | Outdoor gauge range |
| `temp_indoor_sparkline*` / `temp_outdoor_sparkline*` | various | Per-line sparkline options |

## Minimal example

```yaml
type: custom:power-flux-card
entities:
  solar: sensor.solar_power
  grid_combined: sensor.grid_power
  battery: sensor.battery_1_power
  battery_soc: sensor.battery_1_soc
  venus: sensor.battery_2_power
  venus_soc: sensor.battery_2_soc
  house: sensor.home_consumption
  consumer_1: sensor.consumer_1_power
  consumer_2: sensor.consumer_2_power
  consumer_3: sensor.consumer_3_power
battery_enabled: true
venus_enabled: true
show_neon_glow: true
```
