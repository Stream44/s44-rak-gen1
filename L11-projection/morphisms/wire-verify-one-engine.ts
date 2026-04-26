import type { ModuleResolver } from "../module-loader.ts";

export default async function wireVerifyOneEngine(
  resolver: ModuleResolver,
  capabilityEngine: {
    authorize(intent: unknown, capabilityId: string): { authorized: boolean; error?: string };
    authorizeResource(
      capId: string,
      resourceId: string,
      subject: { id: string },
    ): { authorized: boolean; error?: string };
  },
): Promise<() => void> {
  try {
    const setEngine = (await resolver("module://./morphisms/verify-one.ts", "__setEngine")) as (
      engine:
        | {
            authorize(
              intent: unknown,
              capabilityId: string,
            ): { authorized: boolean; error?: string };
            authorizeResource(
              capId: string,
              resourceId: string,
              subject: { id: string },
            ): { authorized: boolean; error?: string };
          }
        | undefined,
    ) => void;
    setEngine(capabilityEngine);
    return () => setEngine(undefined);
  } catch {
    try {
      const setEngine = (await resolver(
        "module://adk/L11-projection/morphisms/verify-one.ts",
        "__setEngine",
      )) as (
        engine:
          | {
              authorize(
                intent: unknown,
                capabilityId: string,
              ): { authorized: boolean; error?: string };
              authorizeResource(
                capId: string,
                resourceId: string,
                subject: { id: string },
              ): { authorized: boolean; error?: string };
            }
          | undefined,
      ) => void;
      setEngine(capabilityEngine);
      return () => setEngine(undefined);
    } catch {
      return () => {};
    }
  }
}
