# Getting started

*A tutorial: by the end you will have the card on a dashboard, showing your
live power flow.*

This walkthrough assumes the card is already installed. If not, do
[Installation](installation.md) first, then come back here.

## 1. Add the card to a dashboard

1. Open the dashboard where you want the card.
2. Enter edit mode (top-right pencil → **Edit dashboard**).
3. **Add card** → search for **Power Flux Card** (the element is named
   `power-flux-card`) → add it.

You will see the visual editor with a live preview on the right.

## 2. Set the core entities

In the editor, open each source section and assign its main sensor:

- **Solar/PV** → your PV power sensor
- **Netz (Grid)** → your grid power sensor (negative = export, positive =
  import — or use split import/export entities)
- **Batterie 1 (LG)** → battery power + state-of-charge sensors
- **Batterie 2 (Venus)** → second battery power + state-of-charge sensors
- **Haus (House)** → total house consumption

As soon as the sensors are set, the bubbles fill with live values and the
flow pipes animate between them.

## 3. Add a consumer

Open one of the consumer sections (e.g. **Tesla**), enable it, and assign its
power sensor. A new bubble and a pipe from the house appear. Repeat for as many
of the seven consumers as you use. (Consumers 6 and 7 are off by default.)

## 4. Save

Click **Save**. The card is now live on your dashboard.

## Where to go next

- Make it look the way you want → [Features explained](features.md) and the
  [Configuration reference](configuration.md).
- Add weather, a camera, or tiles beside the flow → enable **Seiten-Panels**
  (side panels) in the editor; see [Features](features.md#side-panels).
