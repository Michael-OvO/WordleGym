import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DecisionSnapshot,
  ManifestPayload,
  RobustnessPayload,
  SampleReplayPayload,
  SimulatorPayload,
  SummariesPayload,
  WalkthroughsPayload,
} from "@/types/generated";

const generatedDir = path.join(process.cwd(), "public", "generated");

async function readJsonFile<T>(filename: string, fallback: T): Promise<T> {
  try {
    const file = await readFile(path.join(generatedDir, filename), "utf-8");
    return JSON.parse(file) as T;
  } catch {
    return fallback;
  }
}

export async function getManifest(): Promise<ManifestPayload> {
  return readJsonFile<ManifestPayload>("manifest.json", {
    schema_version: 1,
    answers: 0,
    allowed_guesses: 0,
    strategies: [],
  });
}

export async function getSummaries(): Promise<SummariesPayload> {
  return readJsonFile<SummariesPayload>("summaries.json", {
    standard: [],
    evil: [],
    unknown: [],
  });
}

export async function getRobustness(): Promise<RobustnessPayload> {
  return readJsonFile<RobustnessPayload>("robustness.json", {
    matrix: {},
    mismatch_spread: [],
  });
}

export async function getDecisionSnapshots(): Promise<DecisionSnapshot[]> {
  return readJsonFile<DecisionSnapshot[]>("decision-snapshots.json", []);
}

export async function getSampleReplays(): Promise<SampleReplayPayload> {
  return readJsonFile<SampleReplayPayload>("sample-replays.json", {});
}

export async function getWalkthroughs(): Promise<WalkthroughsPayload | null> {
  try {
    const file = await readFile(path.join(generatedDir, "walkthroughs.json"), "utf-8");
    return JSON.parse(file) as WalkthroughsPayload;
  } catch {
    return null;
  }
}

export async function getSimulator(): Promise<SimulatorPayload | null> {
  try {
    const file = await readFile(path.join(generatedDir, "simulator.json"), "utf-8");
    return JSON.parse(file) as SimulatorPayload;
  } catch {
    return null;
  }
}

