/** Lookup the capId the session holds for a given capability URI. */
export default function lookupCap(input: {
  session: { currentUser: { id: string; capabilities: Record<string, string> } };
  capUri: string;
}): string | undefined {
  return input.session.currentUser.capabilities[input.capUri];
}
