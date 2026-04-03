const REQUIRED_ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL"] as const;

export interface LessonEnv {
  apiKey: string;
  baseURL: string;
  model: string;
}

function readRequiredEnv(key: (typeof REQUIRED_ENV_KEYS)[number]): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${key}. Add it to lessons/s05-skills/.env before running this lesson.`,
    );
  }

  return value;
}

export function loadLessonEnv(): LessonEnv {
  return {
    apiKey: readRequiredEnv("OPENAI_API_KEY"),
    baseURL: readRequiredEnv("OPENAI_BASE_URL"),
    model: readRequiredEnv("OPENAI_MODEL"),
  };
}
