import { appendOnlyJournalContract } from "../storage-space/storage-space.test.ts";
import { createEphemeralJournalSpace } from "./ephemeral-journal-space.ts";

appendOnlyJournalContract("ephemeral-journal-space", async () => {
  const store = createEphemeralJournalSpace({ name: "contract" });
  await store.open({});
  return { store };
});
