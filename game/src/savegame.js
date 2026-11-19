// The save file: cash, story progress and lifetime stats in localStorage.
// Reading never throws; a missing or damaged save simply means a fresh game.
import { SAVE_KEY } from './config.js';

/** The shape of a brand-new save. */
export function freshSave() {
  return {
    cash: 120,
    missionIndex: 0,
    jobsDone: 0,
    timesBusted: 0,
    timesWasted: 0,
    started: false,
  };
}

/** Load the save, or return null when there is none worth continuing. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.cash !== 'number') return null;
    return Object.assign(freshSave(), data);
  } catch (err) {
    return null;
  }
}

/** Persist the save. */
export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (err) {
    // Storage can be unavailable (private mode); the game simply runs unsaved.
  }
}

/** Delete the save so the next start is a new game. */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // Nothing to clear.
  }
}
