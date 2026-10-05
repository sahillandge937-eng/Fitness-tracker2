# PULSE — Professional 3-File Fitness Tracker

This version is intentionally simplified to **3 main files** so it is easy to show to your sir:

- `index.html` — page structure
- `style.css` — complete PULSE UI/design
- `app.js` — all working logic, storage, calculations, history and charts

## Run in VS Code (phone or computer)

1. Open the `PULSE-Professional-3-Files` folder in VS Code.
2. Install the **Live Server** extension if you do not already have it.
3. Open `index.html`.
4. Choose **Open with Live Server**.
5. Register a new PULSE account.

## What actually works

- Login/register using local browser storage.
- Workout logging with date, type, duration, intensity, distance and notes.
- Automatic workout calorie estimate when calories are left blank.
- Manual calorie override when a measured/known value is available.
- Food logging with calories + protein + carbs + fat.
- Daily calories taken vs calories burned.
- Net calories = calories taken − workout calories burned.
- 7-day dashboard trend.
- 30-day analytics.
- Monday–Sunday weekly breakdown.
- Selectable monthly History page.
- Previous August and September sample history for presentation/demo.
- User-entered past days remain stored after refresh and browser restart.
- Edit/delete workouts and delete food records.
- Goals, profile and an on-device rule-based AI Coach.
- JSON backup export/import.
- Remove sample history when you no longer need demo data.

## Important accuracy note

Workout calories are **estimates**, not clinical measurements. The calculator uses a standard MET-style estimate from workout type, duration, effort and saved body weight. Food calories are whatever you enter.

A phone/browser cannot honestly measure exact calories burned without appropriate sensor/device data, so this version does not fake a "real sensor" number.

## Supabase later

The UI is separated from the storage functions enough that Supabase can be connected later. The current build uses `localStorage` on purpose so the project is immediately runnable in VS Code with no API keys and no backend setup.
