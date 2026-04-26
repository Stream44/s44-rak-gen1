import { canonicalize } from "../../../L01-foundation/utils.ts";

export type ProjectionTreeNode = {
  kind: "effect";
  adapter: string;
  args?: unknown;
  when?: unknown;
  effectMeta: { adapter: string; args?: unknown; when?: unknown };
  htmlFragment: string;
};

export default function render(props: {
  adapter: string;
  args?: unknown;
  when?: unknown;
}): ProjectionTreeNode {
  const adapter = props.adapter;
  const args = props.args;
  const when = props.when;
  const argCid = new Bun.CryptoHasher("sha256")
    .update(canonicalize(args))
    .digest("hex")
    .slice(0, 12);
  return {
    kind: "effect",
    adapter,
    args,
    when,
    effectMeta: { adapter, args, when },
    htmlFragment: `<!--effect:${adapter}:${argCid}-->`,
  };
}
