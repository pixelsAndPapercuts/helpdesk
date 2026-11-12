import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ApiError, GoogleGenAI } from "@google/genai";
import { Logger } from "@nestjs/common";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type {
  StructuredSummary,
  TranscriptSegment,
} from "./call-transcript.entity";

export type SummaryProvider = "claude" | "gemini";

export const SUMMARY_MODELS: Record<SummaryProvider, string[]> = {
  claude: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  gemini: [
    "models/gemini-3.8-flash",
    "models/gemini-3.7-flash",
    "models/gemini-3.5-flash",
    "models/gemini-2.5-flash",
    "models/gemini-3.5-flash-lite",
  ],
};

export const SUMMARY_RETRY = {
  attempts: 10,
  delaysMs: [2_000, 5_000, 10_000],
};

const logger = new Logger("Summarize");

type Line = TranscriptSegment & { name: string };

const Summary = z.object({
  problem: z
    .string()
    .describe("What the client needed help with, in one or two sentences."),
  stepsTaken: z
    .array(z.string())
    .describe("What was tried or done on the call, in order."),
  resolution: z
    .string()
    .describe("How it ended: fixed, partly fixed, or not fixed — and why."),
  followUps: z
    .array(z.string())
    .describe("Anything someone still has to do. Empty if nothing."),
});

const PROMPT = `You summarise recorded support calls between a client and their consultant.
You get the call's transcript. Write a short summary both people can read later.
Use only what was said on the call — don't guess or add advice. Use plain, simple words.
Refer to people by their names. If the transcript is too short or unclear to tell something, say so.`;

export class SummarizeError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}

const isKeyProblem = (status?: number) => status === 401 || status === 403;

export async function summarize(
  provider: SummaryProvider,
  lines: Line[],
): Promise<{ parts: StructuredSummary; model: string }> {
  const models = SUMMARY_MODELS[provider];

// Each retry moves on to the next model, since a busy (503) error is usually model-specific.
  for (let attempt = 1; ; attempt++) {
    const model = models[(attempt - 1) % models.length];
    try {
      const parts =
        provider === "gemini"
          ? await withGemini(lines, model)
          : await withClaude(lines, model);
      return { parts, model };
    } catch (e) {
      const retryable = !(e instanceof SummarizeError) || e.retryable;
      if (!retryable || attempt >= SUMMARY_RETRY.attempts) throw e;
      const delays = SUMMARY_RETRY.delaysMs;
      const wait = delays[Math.min(attempt - 1, delays.length - 1)];
      const next = models[attempt % models.length];
      logger.warn(
        `try ${attempt} of ${SUMMARY_RETRY.attempts} with ${model} failed (${(e as Error).message.slice(0, 200)}) — trying ${next} in ${wait / 1000} s`,
      );
      await sleep(wait);
    }
  }
}

let claude: Anthropic | undefined;

async function withClaude(
  lines: Line[],
  model: string,
): Promise<StructuredSummary> {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new SummarizeError("ANTHROPIC_API_KEY is not set", false);

  let response;
  try {
    claude ??= new Anthropic({ maxRetries: 0 });
    response = await claude.messages.parse({
      model,
      max_tokens: 16000,
      system: PROMPT,
      messages: [{ role: "user", content: transcriptText(lines) }],
      output_config: { effort: "low", format: zodOutputFormat(Summary) },
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError)
      throw new SummarizeError(`Claude: ${e.message}`, !isKeyProblem(e.status));
    throw new SummarizeError(
      `Could not reach Claude: ${e instanceof Error ? e.message : e}`,
    );
  }

  if (response.stop_reason === "refusal")
    throw new SummarizeError("Claude declined to summarise");
  if (response.stop_reason === "max_tokens")
    throw new SummarizeError("Claude’s summary was cut off");
  if (!response.parsed_output)
    throw new SummarizeError("Claude’s summary was not in the expected shape");
  return response.parsed_output;
}

let gemini: GoogleGenAI | undefined;
const summaryJsonSchema = z.toJSONSchema(Summary);

async function withGemini(
  lines: Line[],
  model: string,
): Promise<StructuredSummary> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new SummarizeError("GEMINI_API_KEY is not set", false);

  let text: string | undefined;
  try {
    gemini ??= new GoogleGenAI({ apiKey });
    const response = await gemini.models.generateContent({
      model,
      contents: transcriptText(lines),
      config: {
        systemInstruction: PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: summaryJsonSchema,
        abortSignal: AbortSignal.timeout(2 * 60_000),
      },
    });
    const blocked = response.promptFeedback?.blockReason;
    if (blocked) throw new SummarizeError(`Gemini blocked it: ${blocked}`);
    text = response.text;
  } catch (e) {
    if (e instanceof SummarizeError) throw e;
    if (e instanceof ApiError)
      throw new SummarizeError(
        `Gemini answered ${e.status}: ${e.message}`,
        !isKeyProblem(e.status),
      );
    throw new SummarizeError(
      `Could not reach Gemini: ${e instanceof Error ? e.message : e}`,
    );
  }

  if (!text) throw new SummarizeError("Gemini sent back an empty answer");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SummarizeError("Gemini’s answer wasn’t JSON");
  }
  const parsed = Summary.safeParse(json);
  if (!parsed.success)
    throw new SummarizeError("Gemini’s summary was not in the expected shape");
  return parsed.data;
}

function transcriptText(lines: Line[]) {
  const text = lines
    .map(
      (l) =>
        `${clock(l.start)} ${l.name} (${l.speaker.toLowerCase()}): ${l.text}`,
    )
    .join("\n");
  return `<transcript>\n${text}\n</transcript>`;
}

function clock(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
