# FitLog

FitLog is a local-first workout tracker for logging Push, Pull, Legs, and custom sessions. Search the exercise library, review your previous sets, and copy them into your current workout. Recipes, Nutrition, and Progress are placeholders.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL shown in the terminal. To try installation and offline use, serve the production build on localhost or an HTTPS site.

```sh
npm run build
npm run preview
```

## Log a workout

1. Open **Workouts**, choose **Start workout**, then choose a split. FitLog defaults to your local calendar date. You can edit it in the workout.
2. Choose **Add exercise**, search, and select a library entry. The picker shows the last earlier session for that exact exercise variant. Choose **Add and copy sets** if you want to start with those values.
3. Enter weight and reps, or seconds for a timed exercise. Use the set options button for units, scope, assistance, plate breakdowns, and notes. Enter the plate breakdown in the same unit and scope as the recorded weight. Use **Unknown** for an uncertain scope. Switching the unit changes the label and preserves the entered number.
4. From the exercise card, copy any previous set or the entire previous session. Copies append to your current sets. **History** shows all logged sessions for the selected variant. Earlier sessions are ordered by workout calendar date, then creation time on the same day.
5. Edits save as you type. **Complete workout** closes the editor. Open any past session from **Workout history** to edit or duplicate it.

Use distinct custom library entries for different machines or equipment setups if their indicated loads should be tracked independently. Records compare the same exercise, load type, and scope. Complete plate breakdowns qualify for comparison when their known total matches the entered weight. Assisted records track fewer pounds or kilograms of assistance at the same reps or seconds.

## Back up and restore

Use the database button on **Workouts** to open **Data & Backup**. Generate a JSON file and download it, or use **Share file** when the browser supports file sharing. The displayed date is when FitLog generated the export. Keep a copy somewhere you can access from another device, such as Files or iCloud Drive.

To restore, select a FitLog JSON backup, review the record counts, optionally generate an export of your current data, then confirm replacement. Workouts, exercises, and settings are stored in IndexedDB for the current browser and site origin. Export before clearing website data or moving to another browser, device, or deployment URL.

## Test and build

```sh
npm run check
npm test
npm run lint
npm run build
```

Vitest and fake-indexeddb cover persistence, exercise history, copied sets, comparable loads, backup replacement and validation, and the Dexie schema upgrade. A pending-write journal backs up an in-progress edit across unexpected reloads when browser storage is available.

## Deploy to Cloudflare Pages

1. Push this repository to a private GitHub repository.
2. In Cloudflare, open **Workers & Pages**, choose **Create application**, then **Pages** and **Import an existing Git repository**. Connect GitHub and select the repository.
3. Choose the `main` production branch, set the build command to `npm run build`, and set the output directory to `dist`. Use the repository root. The checked-in `.node-version` pins Node.js.
4. Choose **Save and Deploy** and open the HTTPS `pages.dev` URL. The GitHub repository stays private. The deployed app shell can be opened by anyone with its URL, and each device stores its own records locally.

See [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Verify on iPhone

Open the deployed app in Safari and use **Share → Add to Home Screen**. Launch the installed app online first so it can cache the app shell. Log and complete a workout, close the app, enable Airplane Mode, and reopen from the Home Screen. Check that the history loads and that edits still save. Test numeric keyboards, the bottom safe area, and exporting and restoring a file through Files. If FitLog offers an update, apply it from the home screen after completing the active workout.
