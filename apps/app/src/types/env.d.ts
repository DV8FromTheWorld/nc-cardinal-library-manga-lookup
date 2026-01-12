export {};

declare global {
  interface ProcessEnv {
    readonly PUBLIC_API_URL: string;
  }

  const process: {
    env: ProcessEnv;
  };
}
