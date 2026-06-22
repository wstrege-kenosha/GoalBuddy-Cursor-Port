#!/usr/bin/env node
import { validateGoalState } from "./lib/objective-state.mjs";

const statePath = process.argv[2];
const isChildCheck = process.argv.includes("--child");

if (!statePath) {
  console.error("Usage: node scripts/check-objective-state.mjs docs/objectives/<slug>/state.yaml");
  process.exit(2);
}

const result = validateGoalState(statePath, { isChildCheck });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
